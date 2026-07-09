import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is OPT-IN (PRISMA_LOG_QUERIES=true) — never on by default, even
    // in development: the WhatsApp inbound worker polls the queue on an interval, so
    // logging every query floods the console with empty `SELECT … FOR UPDATE SKIP
    // LOCKED` polls. Default to error/warn only.
    log:
      process.env.PRISMA_LOG_QUERIES === "true"
        ? ["query", "error", "warn"]
        : ["error", "warn"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// Prevent multiple instances in development
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
