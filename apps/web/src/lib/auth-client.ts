// The four auth calls the UI makes, as plain fetches to Better Auth's endpoints. The full
// better-auth/react client was the largest script on the login page (~0.9s of main-thread time
// on a throttled phone in Lighthouse) for what amounts to these requests.

type AuthResult = { error: { message: string } | null };

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

const failure = (data: Record<string, unknown>, fallback: string): AuthResult => ({
  error: { message: typeof data.message === "string" ? data.message : fallback },
});

export const authClient = {
  async signInEmail(email: string, password: string): Promise<AuthResult> {
    const { ok, data } = await post("/sign-in/email", { email, password });
    return ok ? { error: null } : failure(data, "Could not sign in");
  },

  async signUpEmail(name: string, email: string, password: string): Promise<AuthResult> {
    const { ok, data } = await post("/sign-up/email", { name, email, password });
    return ok ? { error: null } : failure(data, "Could not create the account");
  },

  /** Starts an OAuth sign-in; the browser leaves the page on success. */
  async signInSocial(provider: "github" | "google", callbackURL: string): Promise<AuthResult> {
    const { ok, data } = await post("/sign-in/social", { provider, callbackURL });
    if (ok && typeof data.url === "string") {
      window.location.assign(data.url);
      return { error: null };
    }
    return failure(data, `Could not continue with ${provider}`);
  },

  async signOut(): Promise<void> {
    await post("/sign-out", {});
  },
};
