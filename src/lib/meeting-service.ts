import { setTimeout as sleep } from "node:timers/promises";

import { generateArtifacts } from "@/lib/artifact-generator";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { getGoogleDocsExporter, GoogleDocsExporter } from "@/lib/google-docs";
import { getLiveEventBus } from "@/lib/live-events";
import { getSpeakerMapper, SpeakerMapper } from "@/lib/speaker-mapper";
import { MeetingStore } from "@/lib/store";
import { getStore } from "@/lib/store-singleton";
import { getSpeechToTextService, SpeechToTextService } from "@/lib/stt";
import {
  AudioChunkIngestRequest,
  CreateMeetingInput,
  CreateParticipantInput,
  ExportRecord,
  FinalizeResult,
  IngestResult,
  Meeting,
  MeetingDetails,
  MeetingListQuery,
  Participant
} from "@/lib/types";

const EXPORT_RETRIES = 3;

function clampConfidence(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function toTimestampMs(startedAt: string): number {
  return Math.max(0, Date.now() - new Date(startedAt).getTime());
}

export class MeetingService {
  private liveBus = getLiveEventBus();

  constructor(
    private readonly store: MeetingStore,
    private readonly sttService: SpeechToTextService,
    private readonly speakerMapper: SpeakerMapper,
    private readonly exporter: GoogleDocsExporter
  ) {}

  async listParticipants(): Promise<Participant[]> {
    return this.store.listParticipants();
  }

  async createParticipant(input: CreateParticipantInput): Promise<Participant> {
    const normalizedName = input.name.trim();
    if (normalizedName.length < 2) {
      throw new BadRequestError("Participant name must be at least 2 characters long");
    }

    return this.store.createParticipant({
      ...input,
      name: normalizedName
    });
  }

  async createMeeting(input: CreateMeetingInput): Promise<Meeting> {
    if (!input.participantIds.length) {
      throw new BadRequestError("At least one participant is required");
    }

    const participantSet = new Set((await this.store.listParticipants()).map((participant) => participant.id));
    const invalidParticipantIds = input.participantIds.filter((participantId) => !participantSet.has(participantId));
    if (invalidParticipantIds.length > 0) {
      throw new BadRequestError(`Unknown participant IDs: ${invalidParticipantIds.join(", ")}`);
    }

    const title = input.title.trim() || `Möte ${new Date().toLocaleDateString("sv-SE")}`;

    return this.store.createMeeting({
      ...input,
      title,
      language: input.language ?? "sv"
    });
  }

  async listMeetings(query?: MeetingListQuery): Promise<Meeting[]> {
    return this.store.listMeetings(query);
  }

  async getMeetingDetails(id: string): Promise<MeetingDetails> {
    const details = await this.store.getMeetingDetails(id);

    if (!details) {
      throw new NotFoundError(`Meeting ${id} not found`);
    }

    return details;
  }

  async ingestAudioChunk(meetingId: string, payload: AudioChunkIngestRequest): Promise<IngestResult> {
    const details = await this.getMeetingDetails(meetingId);
    if (details.meeting.status !== "live") {
      throw new BadRequestError("Meeting is not in live status");
    }

    if (!payload.text && !payload.audioBase64) {
      throw new BadRequestError("Either text or audioBase64 must be provided");
    }

    const transcription = await this.sttService.transcribe({
      text: payload.text,
      audioBase64: payload.audioBase64,
      mimeType: payload.mimeType,
      language: details.meeting.language
    });

    const text = transcription.text.trim();
    if (!text) {
      throw new BadRequestError("Could not derive text from chunk");
    }

    const speaker = this.speakerMapper.map({
      meetingId,
      participants: details.participants,
      text,
      speakerHintId: payload.speakerHintId,
      diarizationLabel: payload.diarizationLabel,
      voiceEmbedding: payload.voiceEmbedding
    });

    const segment = await this.store.addSegment({
      meetingId,
      participantId: speaker.participantId,
      speakerLabel: speaker.speakerLabel,
      diarizationLabel: payload.diarizationLabel,
      text,
      confidence: clampConfidence(payload.confidence, transcription.confidence),
      timestampMs: toTimestampMs(details.meeting.startedAt),
      isOverlapping: payload.isOverlapping ?? false
    });

    this.liveBus.emit(meetingId, {
      type: "segment",
      segment
    });

    if (segment.confidence < 0.5) {
      this.liveBus.emit(meetingId, {
        type: "status",
        status: "live",
        message: "Låg ljudkvalitet upptäcktes i senaste segmentet."
      });
    }

    return { segment };
  }

  async finalizeMeeting(meetingId: string): Promise<FinalizeResult> {
    await this.ensureMeetingExists(meetingId);

    await this.store.updateMeetingStatus(meetingId, "processing");
    this.liveBus.emit(meetingId, {
      type: "status",
      status: "processing",
      message: "Mötet efterbearbetas."
    });

    const details = await this.getMeetingDetails(meetingId);
    const artifactsPayload = generateArtifacts({
      meeting: details.meeting,
      segments: details.segments,
      participants: details.participants
    });

    const artifacts = await this.store.upsertArtifacts(meetingId, artifactsPayload);

    const completed = await this.store.updateMeetingStatus(meetingId, "completed", {
      endedAt: new Date().toISOString()
    });

    const exportRecord = await this.exportMeetingNotes(meetingId, artifacts);

    this.liveBus.emit(meetingId, {
      type: "status",
      status: "completed",
      message: exportRecord.status === "success" ? "Mötet är klart och exporterat." : "Mötet är klart men exporten behöver åtgärd."
    });

    return {
      meeting: completed,
      artifacts,
      exportRecord
    };
  }

  async exportToGoogleDoc(meetingId: string): Promise<ExportRecord> {
    const details = await this.getMeetingDetails(meetingId);
    const artifacts = details.artifacts;

    if (!artifacts) {
      throw new BadRequestError("Meeting is not finalized yet; artifacts are missing.");
    }

    return this.exportMeetingNotes(meetingId, artifacts);
  }

  private async exportMeetingNotes(meetingId: string, artifacts: MeetingDetails["artifacts"]): Promise<ExportRecord> {
    const details = await this.getMeetingDetails(meetingId);

    if (!artifacts) {
      throw new BadRequestError("Missing artifacts for export");
    }

    let record = await this.store.createExportRecord(meetingId, {
      provider: "google_docs",
      status: "pending",
      retries: 0
    });

    for (let attempt = 1; attempt <= EXPORT_RETRIES; attempt += 1) {
      try {
        const result = await this.exporter.exportMeeting({
          meeting: details.meeting,
          participants: details.participants,
          artifacts,
          segments: details.segments
        });

        record = await this.store.updateExportRecord(record.id, {
          status: "success",
          retries: attempt - 1,
          externalId: result.externalId,
          url: result.url,
          errorMessage: undefined
        });

        await this.store.updateMeetingStatus(meetingId, details.meeting.status, {
          docUrl: result.url,
          errorMessage: undefined
        });

        return record;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown export error";

        record = await this.store.updateExportRecord(record.id, {
          status: attempt === EXPORT_RETRIES ? "failed" : "pending",
          retries: attempt,
          errorMessage: message
        });

        if (attempt < EXPORT_RETRIES) {
          await sleep(300 * attempt);
        }
      }
    }

    await this.store.updateMeetingStatus(meetingId, details.meeting.status, {
      errorMessage: "Google-export misslyckades efter flera försök."
    });

    return record;
  }

  private async ensureMeetingExists(id: string): Promise<void> {
    const meeting = await this.store.getMeeting(id);
    if (!meeting) {
      throw new NotFoundError(`Meeting ${id} not found`);
    }
  }
}

declare global {
  var __transcrajbMeetingService__: MeetingService | undefined;
}

export function getMeetingService(): MeetingService {
  if (!globalThis.__transcrajbMeetingService__) {
    globalThis.__transcrajbMeetingService__ = new MeetingService(
      getStore(),
      getSpeechToTextService(),
      getSpeakerMapper(),
      getGoogleDocsExporter()
    );
  }

  return globalThis.__transcrajbMeetingService__;
}
