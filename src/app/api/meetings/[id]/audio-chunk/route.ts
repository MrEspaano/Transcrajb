import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { BadRequestError } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { getMeetingService } from "@/lib/meeting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chunkSchema = z
  .object({
    text: z.string().min(1).max(10000).optional(),
    audioBase64: z.string().min(10).optional(),
    mimeType: z.string().min(3).max(120).optional(),
    speakerHintId: z.string().min(1).optional(),
    diarizationLabel: z.string().min(1).max(80).optional(),
    voiceEmbedding: z.array(z.number()).min(1).max(4096).optional(),
    confidence: z.number().min(0).max(1).optional(),
    isOverlapping: z.boolean().optional()
  })
  .refine((value) => value.text || value.audioBase64, {
    message: "Either text or audioBase64 is required",
    path: ["text"]
  });

interface Context {
  params: {
    id: string;
  };
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const payload = chunkSchema.parse(await request.json());

    const service = getMeetingService();
    const result = await service.ingestAudioChunk(context.params.id, payload);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BadRequestError && error.message === "Meeting is not in live status") {
      // Late chunks can arrive after stop/finalize due to MediaRecorder buffering.
      return NextResponse.json({ ignored: true, reason: "meeting-not-live" }, { status: 202 });
    }

    return jsonError(error);
  }
}
