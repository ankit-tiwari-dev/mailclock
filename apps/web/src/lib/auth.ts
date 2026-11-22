import "server-only";
import { ensureDefaultProject } from "@mailclock/core";
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

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders: social,
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
