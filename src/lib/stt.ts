import OpenAI from "openai";
import { toFile } from "openai/uploads";

export interface TranscriptionInput {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  provider: "text" | "mock_stt" | "openai_stt";
}

function extFromMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) {
    return "webm";
  }
  if (mimeType.includes("wav")) {
    return "wav";
  }
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "audio";
}

function mockTranscriptionNotice(language: string): string {
  if (language.toLowerCase().startsWith("sv")) {
    return "[Ljud mottaget. Lägg till OPENAI_API_KEY och sätt TRANSCRAJB_USE_MOCK_STT=false för riktig transkribering.]";
  }

  return "[Audio chunk received. Configure OpenAI STT for real transcription.]";
}

export class SpeechToTextService {
  private client: OpenAI | undefined;

  constructor(private readonly apiKey = process.env.OPENAI_API_KEY) {
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const text = input.text?.trim();
    if (text) {
      return {
        text,
        confidence: 0.99,
        provider: "text"
      };
    }

    const language = input.language ?? "sv";
    const useMock = process.env.TRANSCRAJB_USE_MOCK_STT === "true";

    if (useMock || !this.client || !input.audioBase64) {
      return {
        text: mockTranscriptionNotice(language),
        confidence: 0.35,
        provider: "mock_stt"
      };
    }

    const mimeType = input.mimeType ?? "audio/webm";
    const extension = extFromMimeType(mimeType);
    const buffer = Buffer.from(input.audioBase64, "base64");
    const modelCandidates = [process.env.OPENAI_STT_MODEL, "gpt-4o-transcribe", "whisper-1"].filter(
      (model): model is string => Boolean(model)
    );

    let lastErrorMessage = "Unknown STT error";
    for (const model of modelCandidates) {
      try {
        const file = await toFile(buffer, `chunk.${extension}`, {
          type: mimeType
        });

        const response = await this.client.audio.transcriptions.create({
          file,
          model,
          language
        });

        return {
          text: response.text.trim(),
          confidence: 0.9,
          provider: "openai_stt"
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        lastErrorMessage = detail;
        console.error("[transcrajb][stt] model failed", { model, mimeType, detail });
      }
    }
    const fallbackText = mockTranscriptionNotice(language);
    console.error("[transcrajb][stt] all models failed", { mimeType, message: lastErrorMessage });
    return {
      text: `${fallbackText} Fel: ${lastErrorMessage}`,
      confidence: 0.2,
      provider: "mock_stt"
    };
  }
}

declare global {
  var __transcrajbSttService__: SpeechToTextService | undefined;
}

export function getSpeechToTextService(): SpeechToTextService {
  if (!globalThis.__transcrajbSttService__) {
    globalThis.__transcrajbSttService__ = new SpeechToTextService();
  }

  return globalThis.__transcrajbSttService__;
}
