const UNTIL_KEY = 'suppressAuth401UntilMs';

/** Call before sign-out so in-flight API 401s do not show "session expired". */
export function markIntentionalSignOut(): void {
  try {
    // Short window: several parallel requests may 401 after the cookie is cleared.
    sessionStorage.setItem(UNTIL_KEY, String(Date.now() + 4000));
  } catch {
    /* ignore (private mode, etc.) */
  }
}

/** Clear suppress window after a successful sign-in so real 401s are not swallowed. */
export function clearIntentionalSignOut(): void {
  try {
    sessionStorage.removeItem(UNTIL_KEY);
  } catch {
    /* ignore */
  }
}

/** True while we are in the post–sign-out window (multiple 401s expected). */
export function shouldSuppressAuth401Toast(): boolean {
  try {
    const until = Number(sessionStorage.getItem(UNTIL_KEY) || 0);
    if (!until) return false;
    if (Date.now() < until) return true;
    sessionStorage.removeItem(UNTIL_KEY);
    return false;
  } catch {
    return false;
  }
}
