import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
    return jsonError(error);
  }
}
