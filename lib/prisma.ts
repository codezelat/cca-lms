import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Prisma } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const shouldLogQueries =
  process.env.NODE_ENV === "development" &&
  process.env.PRISMA_LOG_QUERIES === "true";

const prismaLogLevels: Prisma.LogLevel[] = shouldLogQueries
  ? ["query", "error", "warn"]
  : process.env.NODE_ENV === "development"
    ? ["error", "warn"]
    : ["error"];

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: prismaLogLevels,
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
