import "server-only";
import { ensureDefaultProject, sendSystemEmail } from "@mailclock/core";
import { prisma } from "@mailclock/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

const social = {
  ...(process.env.GITHUB_CLIENT_ID && {
    github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "" },
  }),
  ...(process.env.GOOGLE_CLIENT_ID && {
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" },
  }),
};

export const enabledSocialProviders = Object.keys(social) as ("github" | "google")[];

/**
 * The header that carries the real client IP, used to key sign-in rate limits. Clients can send
 * any header, so this must be one your platform or proxy sets itself: Vercel sets x-forwarded-for
 * (the default); behind Cloudflare use cf-connecting-ip; behind nginx, a header it overwrites.
 */
const clientIpHeader = process.env.MAILCLOCK_CLIENT_IP_HEADER?.trim() || "x-forwarded-for";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // An address must be proven before it can be used to sign in, so nobody can claim someone
    // else's email first and lock the real owner out.
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendSystemEmail({
        to: user.email,
        subject: "Reset your Mailclock password",
        text: `Someone asked to reset the password for this Mailclock account. If it was you, open this link within an hour:\n\n${url}\n\nIf it wasn't, ignore this email; your password stays the same.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Signing in with an unconfirmed address sends a fresh link (capped by the sign-in rate limit).
    // Must be explicit: Better Auth 1.7 only re-sends when this is true, despite its type comment.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendSystemEmail({
        to: user.email,
        subject: "Confirm your email for Mailclock",
        text: `Confirm this address to finish creating your Mailclock account:\n\n${url}\n\nIf you didn't sign up, ignore this email.`,
      });
    },
  },
  socialProviders: social,
  // Stored in Postgres so the limits hold across every instance (in-memory counters are per
  // instance, which on serverless means nearly no limit). Enabled in production.
  rateLimit: {
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 10 },
      "/sign-up/email": { window: 60 * 60, max: 10 },
      "/request-password-reset": { window: 15 * 60, max: 5 },
      "/send-verification-email": { window: 15 * 60, max: 5 },
    },
  },
  advanced: { ipAddress: { ipAddressHeaders: [clientIpHeader] } },
  databaseHooks: {
    user: {
      create: {
        // Every account starts with a project and a Mock provider, so the first email works immediately.
        after: async (user) => {
          await ensureDefaultProject(user.id);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
