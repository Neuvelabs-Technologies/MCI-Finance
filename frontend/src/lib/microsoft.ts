import { authApi } from '@/api/auth.api';

// The signed sign-in transaction waits here while the browser is at Microsoft.
const TX_KEY = 'mci-finance:ms-signin';

/** Send the browser to Microsoft. It comes back to /auth/callback. */
export async function startMicrosoftSignIn(): Promise<void> {
  const { url, transaction } = await authApi.microsoftStart();
  sessionStorage.setItem(TX_KEY, transaction);
  window.location.assign(url);
}

/** The transaction saved by startMicrosoftSignIn, removed as it's read so it's used once. */
export function takeMicrosoftTransaction(): string {
  const tx = sessionStorage.getItem(TX_KEY) ?? '';
  sessionStorage.removeItem(TX_KEY);
  return tx;
}
