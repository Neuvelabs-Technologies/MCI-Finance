// Microsoft Entra ID sign-in: OpenID Connect authorization code flow with PKCE.
//
//   1. startSignIn()      the authorize URL, plus a signed "transaction" the browser keeps in
//                         sessionStorage until Microsoft sends it back
//   2. Microsoft          MFA, Conditional Access, then redirects to <app>/auth/callback?code&state
//   3. completeSignIn()   checks the transaction, swaps the code for tokens server-side (the client
//                         secret never leaves here) and verifies the ID token against Microsoft's keys
//
// Who may sign in is decided in MCI's Entra: the app registration only lets members of its
// assignment group (AZR-0029-FINANCE-prod-Users) through. Anyone it lets through is an admin here.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config, microsoftConfigured } from '../config/env.js';
import { Admin, type AdminDoc } from '../models/Admin.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const SCOPES = 'openid profile email';
const TRANSACTION_AUDIENCE = 'mci-finance:microsoft-signin';
const TRANSACTION_TTL = '10m';
const HTTP_TIMEOUT_MS = 10_000;

export interface MicrosoftIdentity {
  oid: string;
  email: string;
  name: string;
}

interface Transaction extends jwt.JwtPayload {
  state: string;
  nonce: string;
  codeVerifier: string;
}

interface Jwk extends crypto.JsonWebKey {
  kid?: string;
  kty?: string;
}

/** An error whose `reason` goes to the audit log; the message is what the person sees. */
class SignInError extends ApiError {
  constructor(
    status: number,
    message: string,
    public reason: string
  ) {
    super(status, message);
  }
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function endpoints() {
  if (!microsoftConfigured()) throw new ApiError(503, 'Microsoft sign-in is not set up on this server.');
  const { authority, tenantId } = config.microsoft;
  return {
    ...config.microsoft,
    authorizeUrl: `${authority}/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `${authority}/${tenantId}/oauth2/v2.0/token`,
    keysUrl: `${authority}/${tenantId}/discovery/v2.0/keys`,
    issuer: `${authority}/${tenantId}/v2.0`,
  };
}

const sameString = (a: unknown, b: unknown): boolean => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Step 1: where to send the browser, and what it must bring back. */
export function startSignIn(): { url: string; transaction: string } {
  const cfg = endpoints();
  const state = randomToken(16);
  const nonce = randomToken(16);
  const codeVerifier = randomToken(32);
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const transaction = jwt.sign({ state, nonce, codeVerifier }, config.jwtSecret, { audience: TRANSACTION_AUDIENCE, expiresIn: TRANSACTION_TTL });
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: cfg.redirectUri,
    scope: SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // People signed in with more than one account get to choose.
    prompt: 'select_account',
  });
  return { url: `${cfg.authorizeUrl}?${params}`, transaction };
}

// Microsoft rotates its signing keys: cache them, and refetch when a token names an unknown key.
let keyCache = { url: '', fetchedAt: 0, keys: new Map<string, Jwk>() };
const KEY_CACHE_MS = 6 * 60 * 60 * 1000;

async function signingKey(url: string, kid: string): Promise<crypto.KeyObject> {
  const stale = keyCache.url !== url || Date.now() - keyCache.fetchedAt > KEY_CACHE_MS;
  if (stale || !keyCache.keys.has(kid)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`signing keys request failed (${res.status})`);
    const { keys = [] } = (await res.json()) as { keys?: Jwk[] };
    keyCache = { url, fetchedAt: Date.now(), keys: new Map(keys.filter((k) => k.kid && k.kty === 'RSA').map((k) => [k.kid as string, k])) };
  }
  const jwk = keyCache.keys.get(kid);
  if (!jwk) throw new Error(`no signing key matches kid ${kid}`);
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

/** Tests only: forget cached signing keys. */
export function resetSigningKeyCache(): void {
  keyCache = { url: '', fetchedAt: 0, keys: new Map() };
}

async function redeemCode(cfg: ReturnType<typeof endpoints>, code: string, codeVerifier: string): Promise<string> {
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: codeVerifier,
      scope: SCOPES,
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.id_token) {
    // AADSTS codes (expired secret, wrong redirect URI…) are for the server log, not the person.
    logger.error({ status: res.status, error: body.error, description: body.error_description }, '[microsoft] token exchange failed');
    throw new SignInError(401, 'Microsoft did not accept the sign-in. Please try again.', body.error === 'invalid_client' ? 'invalid_client' : 'token_exchange_failed');
  }
  return body.id_token;
}

async function verifyIdToken(cfg: ReturnType<typeof endpoints>, idToken: string, nonce: string): Promise<jwt.JwtPayload> {
  try {
    const decoded = jwt.decode(idToken, { complete: true });
    const kid = decoded?.header.kid;
    if (!kid) throw new Error('ID token has no key id');
    const key = await signingKey(cfg.keysUrl, kid);
    const claims = jwt.verify(idToken, key, { algorithms: ['RS256'], audience: cfg.clientId, issuer: cfg.issuer, clockTolerance: 60 }) as jwt.JwtPayload;
    if (claims.tid !== cfg.tenantId) throw new Error('token is from another tenant');
    if (!claims.nonce || !sameString(claims.nonce, nonce)) throw new Error('nonce mismatch');
    if (!claims.oid) throw new Error('token has no oid');
    return claims;
  } catch (err) {
    logger.error({ err }, '[microsoft] ID token rejected');
    throw new SignInError(401, 'Microsoft sign-in could not be verified. Please try again.', 'invalid_id_token');
  }
}

/** Step 3: the identity Microsoft vouched for. */
export async function completeSignIn(input: { code: string; state: string; transaction: string }): Promise<MicrosoftIdentity> {
  const cfg = endpoints();
  let tx: Transaction;
  try {
    tx = jwt.verify(input.transaction, config.jwtSecret, { audience: TRANSACTION_AUDIENCE }) as Transaction;
  } catch {
    throw new SignInError(400, 'The sign-in took too long or was started in another tab. Please try again.', 'invalid_transaction');
  }
  if (!sameString(input.state, tx.state)) throw new SignInError(400, 'The sign-in response did not match this browser. Please try again.', 'state_mismatch');

  const idToken = await redeemCode(cfg, input.code, tx.codeVerifier);
  const claims = await verifyIdToken(cfg, idToken, tx.nonce);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    oid: str(claims.oid),
    email: (str(claims.email) || str(claims.preferred_username)).toLowerCase().trim(),
    name: str(claims.name) || str(claims.preferred_username) || 'Microsoft user',
  };
}

/**
 * The admin account for a Microsoft identity, created on first sign-in.
 * Matched on the immutable `oid`, falling back to email the first time so an admin added
 * by email (or the seeded first admin) is linked rather than duplicated.
 */
export async function adminForIdentity(identity: MicrosoftIdentity): Promise<{ admin: AdminDoc; created: boolean }> {
  let admin = await Admin.findOne({ microsoftId: identity.oid });
  if (!admin && identity.email) {
    admin = await Admin.findOne({ email: identity.email });
    if (admin?.microsoftId) throw new SignInError(409, 'This email is already linked to a different Microsoft account. Ask another admin to check it.', 'oid_conflict');
  }
  if (admin) {
    admin.microsoftId = identity.oid;
    if (!admin.name && identity.name) admin.name = identity.name;
    return { admin, created: false };
  }
  if (!identity.email) throw new SignInError(403, 'Microsoft did not share an email address for this account.', 'no_email');
  admin = new Admin({
    email: identity.email,
    name: identity.name,
    microsoftId: identity.oid,
    // Required by the schema; nobody knows it, so the account can't sign in with a password.
    passwordHash: await bcrypt.hash(randomToken(32), 10),
  });
  return { admin, created: true };
}

/** The reason code of a sign-in failure, for the audit log. */
export const failureReason = (e: unknown): string => (e instanceof SignInError ? e.reason : 'error');
