import { PrismaClient } from "@prisma/client";

declare global {
  var __transcrajbPrisma__: PrismaClient | undefined;
}

export function getPrismaClient(): PrismaClient {
  if (!globalThis.__transcrajbPrisma__) {
    globalThis.__transcrajbPrisma__ = new PrismaClient();
  }

  return globalThis.__transcrajbPrisma__;
}
