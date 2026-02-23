import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { getLiveEventBus } from "@/lib/live-events";
import { getMeetingService } from "@/lib/meeting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: {
    id: string;
  };
}

function formatSseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const meetingId = context.params.id;
    const service = getMeetingService();
    const details = await service.getMeetingDetails(meetingId);
    const bus = getLiveEventBus();

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (payload: unknown) => controller.enqueue(encoder.encode(formatSseData(payload)));

        write({
          type: "status",
          status: details.meeting.status,
          message: "SSE-anslutning aktiv"
        });

        for (const segment of details.segments) {
          write({ type: "segment", segment });
        }

        const unsubscribe = bus.subscribe(meetingId, (event) => write(event));
        const heartbeatInterval = setInterval(() => {
          write({ type: "heartbeat", at: new Date().toISOString() });
        }, 15000);

        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeatInterval);
          unsubscribe();
          controller.close();
        });
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
