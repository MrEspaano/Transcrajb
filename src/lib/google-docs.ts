import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { google } from "googleapis";

import { Meeting, MeetingArtifacts, Participant, TranscriptSegment } from "@/lib/types";

export interface GoogleDocExportInput {
  meeting: Meeting;
  participants: Participant[];
  artifacts: MeetingArtifacts;
  segments: TranscriptSegment[];
}

export interface GoogleDocExportResult {
  externalId: string;
  url: string;
  mode: "google" | "mock";
  localPath?: string;
}

function formatTranscript(segments: TranscriptSegment[]): string {
  if (segments.length === 0) {
    return "(Inga segment tillgängliga)";
  }

  return segments
    .map((segment) => {
      const seconds = Math.floor(segment.timestampMs / 1000)
        .toString()
        .padStart(4, "0");
      return `[${seconds}s] ${segment.speakerLabel}: ${segment.text}`;
    })
    .join("\n");
}

function buildDocumentBody(input: GoogleDocExportInput): string {
  const participants = input.participants.length
    ? input.participants.map((participant) => participant.name).join(", ")
    : "Ej specificerade";

  const actionItems =
    input.artifacts.actionItems.length > 0
      ? input.artifacts.actionItems
          .map((item) => {
            const owner = item.owner ? ` (ägare: ${item.owner})` : "";
            const due = item.dueDate ? ` (deadline: ${item.dueDate})` : "";
            return `- ${item.text}${owner}${due}`;
          })
          .join("\n")
      : "- Inga action items identifierades.";

  const decisions =
    input.artifacts.decisions.length > 0
      ? input.artifacts.decisions.map((item) => `- ${item.text}`).join("\n")
      : "- Inga beslut identifierades.";

  const openQuestions =
    input.artifacts.openQuestions.length > 0
      ? input.artifacts.openQuestions.map((item) => `- ${item.text}`).join("\n")
      : "- Inga öppna frågor identifierades.";

  const risks =
    input.artifacts.risks.length > 0
      ? input.artifacts.risks.map((item) => `- ${item.text}`).join("\n")
      : "- Inga risker identifierades.";

  return [
    `Möte: ${input.meeting.title}`,
    `Start: ${new Date(input.meeting.startedAt).toLocaleString("sv-SE")}`,
    `Slut: ${input.meeting.endedAt ? new Date(input.meeting.endedAt).toLocaleString("sv-SE") : "Pågående"}`,
    `Deltagare: ${participants}`,
    "",
    "=== Sammanfattning ===",
    input.artifacts.summary,
    "",
    "=== Nyckelämnen ===",
    ...input.artifacts.keyTopics.map((topic) => `- ${topic}`),
    "",
    "=== Beslut ===",
    decisions,
    "",
    "=== Action items ===",
    actionItems,
    "",
    "=== Öppna frågor ===",
    openQuestions,
    "",
    "=== Risker ===",
    risks,
    "",
    "=== Protokollutkast ===",
    input.artifacts.protocolDraft,
    "",
    "=== Rå transkribering ===",
    formatTranscript(input.segments)
  ].join("\n");
}

async function runMockExport(body: string, meetingId: string): Promise<GoogleDocExportResult> {
  const directory = path.join(process.cwd(), ".exports");
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, `${meetingId}.txt`);

  await writeFile(outputPath, body, "utf8");

  return {
    externalId: `mock-${meetingId}`,
    url: `mock://google-docs/${meetingId}`,
    mode: "mock",
    localPath: outputPath
  };
}

function shouldUseMockGoogleExport(): boolean {
  if (process.env.TRANSCRAJB_USE_MOCK_GOOGLE === "true") {
    return true;
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return true;
  }

  return false;
}

export class GoogleDocsExporter {
  async exportMeeting(input: GoogleDocExportInput): Promise<GoogleDocExportResult> {
    const body = buildDocumentBody(input);

    if (shouldUseMockGoogleExport()) {
      return runMockExport(body, input.meeting.id);
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!email || !privateKey) {
      return runMockExport(body, input.meeting.id);
    }

    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive"
      ]
    });

    const docs = google.docs({ version: "v1", auth });
    const drive = google.drive({ version: "v3", auth });

    const title = `${input.meeting.title} - ${new Date(input.meeting.startedAt).toLocaleDateString("sv-SE")}`;

    const created = await docs.documents.create({
      requestBody: {
        title
      }
    });

    const docId = created.data.documentId;
    if (!docId) {
      throw new Error("Google Docs returned no document ID");
    }

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: body
            }
          }
        ]
      }
    });

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (folderId) {
      await drive.files.update({
        fileId: docId,
        addParents: folderId,
        fields: "id, parents"
      });
    }

    return {
      externalId: docId,
      url: `https://docs.google.com/document/d/${docId}/edit`,
      mode: "google"
    };
  }
}

declare global {
  var __transcrajbGoogleExporter__: GoogleDocsExporter | undefined;
}

export function getGoogleDocsExporter(): GoogleDocsExporter {
  if (!globalThis.__transcrajbGoogleExporter__) {
    globalThis.__transcrajbGoogleExporter__ = new GoogleDocsExporter();
  }

  return globalThis.__transcrajbGoogleExporter__;
}
