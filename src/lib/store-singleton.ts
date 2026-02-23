import { InMemoryMeetingStore } from "@/lib/store-memory";
import { getPrismaClient } from "@/lib/prisma";
import { PrismaMeetingStore } from "@/lib/store-prisma";
import { MeetingStore } from "@/lib/store";

declare global {
  var __transcrajbStore__: MeetingStore | undefined;
}

export function getStore(): MeetingStore {
  if (!globalThis.__transcrajbStore__) {
    globalThis.__transcrajbStore__ = process.env.DATABASE_URL
      ? new PrismaMeetingStore(getPrismaClient())
      : new InMemoryMeetingStore();
  }

  return globalThis.__transcrajbStore__;
}
