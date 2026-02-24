import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createWavSilence(durationSeconds = 1, sampleRate = 16000): Uint8Array {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = durationSeconds * sampleRate;
  const dataSize = numSamples * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let idx = 0; idx < value.length; idx += 1) {
      view.setUint8(offset + idx, value.charCodeAt(idx));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  return new Uint8Array(buffer);
}

export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "OPENAI_API_KEY missing" }, { status: 500 });
  }

  try {
    const wavBytes = createWavSilence();
    const formData = new FormData();
    const bytes = Uint8Array.from(wavBytes);
    const file = new Blob([bytes], { type: "audio/wav" });
    formData.append("file", file, "silence.wav");
    formData.append("model", process.env.OPENAI_STT_MODEL || "whisper-1");
    formData.append("language", "sv");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData,
      signal: AbortSignal.timeout(20000)
    });

    const bodyText = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          bodyPreview: bodyText.slice(0, 400)
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: response.status,
      bodyPreview: bodyText.slice(0, 200)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}
