import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonError } from "@/lib/http";
import { getMeetingService } from "@/lib/meeting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createMeetingSchema = z.object({
  title: z.string().min(1).max(160),
  language: z.string().min(2).max(10).optional(),
  participantIds: z.array(z.string().min(1)).min(1).max(5)
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const service = getMeetingService();
    const meetings = await service.listMeetings({ search });

    return NextResponse.json({ meetings });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = createMeetingSchema.parse(body);

    const service = getMeetingService();
    const meeting = await service.createMeeting(parsed);

    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
