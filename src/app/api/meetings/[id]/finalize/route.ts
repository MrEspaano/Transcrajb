import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { getMeetingService } from "@/lib/meeting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: {
    id: string;
  };
}

export async function POST(_: Request, context: Context): Promise<NextResponse> {
  try {
    const service = getMeetingService();
    const result = await service.finalizeMeeting(context.params.id);

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
