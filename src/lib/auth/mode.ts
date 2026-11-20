/**
 * Authentication mode.
 *
 * `demo`     — the synthetic identity switcher. Default, and the only mode that
 *              keeps the standalone hackathon demo usable without setup. It is
 *              not authentication and the UI says so.
 * `password` — email + password accounts stored in the local database with
 *              scrypt hashes. Self-hosted, no external identity provider, no
 *              account registration endpoint (an operator provisions accounts).
 *
 * There is deliberately no `oidc`/Toss-login mode yet: those need app
 * registration and credentials that are not available here, and pretending they
 * work would be the exact failure the product contract forbids. The adapter
 * boundary is documented in docs/TOSS.md.
 */
export type AuthMode = "demo" | "password";

export function getAuthMode(): AuthMode {
  const raw = (process.env.CIVICPULSE_AUTH_MODE ?? "demo").trim().toLowerCase();
  if (raw === "password") return "password";
  if (raw !== "demo" && raw !== "") {
    // Fail loudly rather than silently serving the demo switcher when an
    // operator asked for real accounts and mistyped the mode.
    throw new Error(
      `Unsupported CIVICPULSE_AUTH_MODE "${raw}". Use "demo" or "password".`,
    );
  }
  return "demo";
}

export function isPasswordAuthMode(): boolean {
  return getAuthMode() === "password";
}

/** Cookie/session switching is only available in the demo provider. */
export function isDemoAuthMode(): boolean {
  return getAuthMode() === "demo";
}

/**
 * Whether an already-issued session may still act in the current mode.
 *
 * A deployment switched from demo to password must not keep honouring cookies
 * for password-less demo accounts: the demo switcher is disabled there, but a
 * pre-existing cookie would otherwise remain a valid session forever. Password
 * accounts are the only ones with an email, so they are the only ones accepted.
 */
export function isSessionAllowedForMode(
  user: { email?: string | null },
  mode: AuthMode = getAuthMode(),
): boolean {
  return mode === "demo" ? true : Boolean(user.email);
}
