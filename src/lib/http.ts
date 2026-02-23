import { NextResponse } from "next/server";

import { BadRequestError, NotFoundError } from "@/lib/errors";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : "Unknown server error";
  return NextResponse.json({ error: message }, { status: 500 });
}
