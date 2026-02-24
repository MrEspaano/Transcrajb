import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  const keyPresent = Boolean(apiKey && apiKey.trim().length > 0);

  if (!keyPresent) {
    return NextResponse.json(
      {
        ok: false,
        keyPresent: false,
        reason: "OPENAI_API_KEY is missing"
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          ok: false,
          keyPresent: true,
          status: response.status,
          bodyPreview: text.slice(0, 300)
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as { data?: { id?: string }[] };
    const sampleModels = (payload.data ?? []).slice(0, 5).map((item) => item.id).filter(Boolean);

    return NextResponse.json({
      ok: true,
      keyPresent: true,
      sampleModels
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        keyPresent: true,
        reason: message
      },
      { status: 502 }
    );
  }
}
