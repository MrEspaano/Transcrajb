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

export async function GET(_: Request, context: Context): Promise<NextResponse> {
  try {
    const service = getMeetingService();
    const details = await service.getMeetingDetails(context.params.id);

    return NextResponse.json(details);
  } catch (error) {
    return jsonError(error);
  }
}
