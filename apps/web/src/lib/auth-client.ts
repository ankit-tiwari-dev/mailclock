// The auth calls the UI makes, as plain fetches to Better Auth's endpoints. The full
// better-auth/react client was the largest script on the login page (~0.9s of main-thread time
// on a throttled phone in Lighthouse) for what amounts to these requests.

type AuthError = { message: string; code?: string; status: number };
type AuthResult<T = object> = ({ error: null } & T) | { error: AuthError };

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

const failure = (status: number, data: Record<string, unknown>, fallback: string): { error: AuthError } => ({
  error: {
    status,
    code: typeof data.code === "string" ? data.code : undefined,
    message:
      status === 429 ? "Too many attempts. Wait a few minutes and try again." : typeof data.message === "string" ? data.message : fallback,
  },
});

export const authClient = {
  /** Fails with code EMAIL_NOT_VERIFIED (403) until the address is confirmed; a new link is then sent. */
  async signInEmail(email: string, password: string): Promise<AuthResult> {
    const { ok, status, data } = await post("/sign-in/email", { email, password, callbackURL: "/dashboard" });
    return ok ? { error: null } : failure(status, data, "Could not sign in");
  },

  /** `verify: true` means a confirmation link was emailed and there is no session yet. */
  async signUpEmail(name: string, email: string, password: string): Promise<AuthResult<{ verify: boolean }>> {
    const { ok, status, data } = await post("/sign-up/email", { name, email, password, callbackURL: "/dashboard" });
    return ok ? { error: null, verify: !data.token } : failure(status, data, "Could not create the account");
  },

  /** Starts an OAuth sign-in; the browser leaves the page on success. */
  async signInSocial(provider: "github" | "google", callbackURL: string): Promise<AuthResult> {
    const { ok, status, data } = await post("/sign-in/social", { provider, callbackURL });
    if (ok && typeof data.url === "string") {
      window.location.assign(data.url);
      return { error: null };
    }
    return failure(status, data, `Could not continue with ${provider}`);
  },

  /** Always reports success for a well-formed address, so it never reveals which emails have accounts. */
  async requestPasswordReset(email: string): Promise<AuthResult> {
    const { ok, status, data } = await post("/request-password-reset", { email, redirectTo: `${window.location.origin}/reset-password` });
    return ok ? { error: null } : failure(status, data, "Could not send the reset link");
  },

  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    const { ok, status, data } = await post("/reset-password", { token, newPassword });
    return ok ? { error: null } : failure(status, data, "This reset link is invalid or has expired");
  },

  async signOut(): Promise<void> {
    await post("/sign-out", {});
  },
};
