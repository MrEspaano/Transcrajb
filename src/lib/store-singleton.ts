import { InMemoryMeetingStore } from "@/lib/store-memory";
import { MeetingStore } from "@/lib/store";

declare global {
  var __transcrajbStore__: MeetingStore | undefined;
}

export function getStore(): MeetingStore {
  if (!globalThis.__transcrajbStore__) {
    globalThis.__transcrajbStore__ = new InMemoryMeetingStore();
  }

  return globalThis.__transcrajbStore__;
}
