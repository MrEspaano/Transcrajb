import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonError } from "@/lib/http";
import { getMeetingService } from "@/lib/meeting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createParticipantSchema = z.object({
  name: z.string().min(2).max(80),
  voiceProfile: z
    .object({
      embedding: z.array(z.number()).min(1).max(4096).optional(),
      notes: z.string().max(2000).optional()
    })
    .optional()
});

export async function GET(): Promise<NextResponse> {
  try {
    const service = getMeetingService();
    const participants = await service.listParticipants();

    return NextResponse.json({ participants });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = createParticipantSchema.parse(body);

    const service = getMeetingService();
    const participant = await service.createParticipant(parsed);

    return NextResponse.json({ participant }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
