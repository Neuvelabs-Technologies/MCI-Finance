import crypto from 'node:crypto';
import { config } from '../config/env.js';

export const newToken = (): string => crypto.randomBytes(24).toString('base64url');

/** Give the customer a fresh form link token. */
export function issueToken(customer: { token?: string | null; tokenExpiresAt?: Date }, validityDays: number): string {
  const token = newToken();
  const days = Number(validityDays) > 0 ? Number(validityDays) : 90;
  customer.token = token;
  customer.tokenExpiresAt = new Date(Date.now() + days * 864e5);
  return token;
}

export const formLink = (token: string): string => `${config.publicBaseUrl}/f/${token}`;
