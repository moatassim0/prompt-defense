/** Normalizes Better Auth client `{ error }` objects into a user-visible message. */

export function formatBetterAuthClientError(error: unknown, fallback: string): string {
  if (error == null) return fallback;
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof error !== 'object') return fallback;
  const e = error as Record<string, unknown>;
  if (typeof e.message === 'string' && e.message.trim()) return e.message;
  if (typeof e.statusText === 'string' && e.statusText.trim()) return e.statusText;
  const code = e.code;
  if (typeof code === 'string' && code.trim()) return code;
  const status = typeof e.status === 'number' ? e.status : NaN;
  if (status === 401) return 'Invalid email or password.';
  if (status === 403) return 'Sign in blocked for this account (e.g. email not verified).';
  if (status === 429) return 'Too many sign-in attempts. Try again later.';
  if (status >= 500) return 'Server error during sign in. Check that the API and database are running.';
  return fallback;
}
