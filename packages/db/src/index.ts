import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __mailclockPrisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Shared Prisma client. Reused across hot reloads in development. */
export const prisma: PrismaClient = globalForPrisma.__mailclockPrisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__mailclockPrisma = prisma;
