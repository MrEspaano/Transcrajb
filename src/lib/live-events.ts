import { EventEmitter } from "node:events";

import { MeetingStatus, TranscriptSegment } from "@/lib/types";

export type LiveMeetingEvent =
  | { type: "segment"; segment: TranscriptSegment }
  | { type: "status"; status: MeetingStatus; message?: string }
  | { type: "heartbeat"; at: string };

class LiveEventBus {
  private emitter = new EventEmitter();

  emit(meetingId: string, event: LiveMeetingEvent): void {
    this.emitter.emit(meetingId, event);
  }

  subscribe(meetingId: string, handler: (event: LiveMeetingEvent) => void): () => void {
    this.emitter.on(meetingId, handler);
    return () => this.emitter.off(meetingId, handler);
  }
}

declare global {
  var __transcrajbLiveBus__: LiveEventBus | undefined;
}

export function getLiveEventBus(): LiveEventBus {
  if (!globalThis.__transcrajbLiveBus__) {
    globalThis.__transcrajbLiveBus__ = new LiveEventBus();
  }

  return globalThis.__transcrajbLiveBus__;
}
