import { Prisma, PrismaClient } from "@prisma/client";

import { MeetingStore } from "@/lib/store";
import {
  AddSegmentInput,
  CreateMeetingInput,
  CreateParticipantInput,
  ExportRecord,
  Meeting,
  MeetingArtifacts,
  MeetingDetails,
  MeetingListQuery,
  MeetingStatus,
  Participant,
  TranscriptSegment
} from "@/lib/types";

function dateToIso(value: Date): string {
  return value.toISOString();
}

function toParticipant(value: {
  id: string;
  name: string;
  voiceProfileJson: Prisma.JsonValue | null;
  createdAt: Date;
}): Participant {
  return {
    id: value.id,
    name: value.name,
    voiceProfile: (value.voiceProfileJson as Participant["voiceProfile"]) ?? undefined,
    createdAt: dateToIso(value.createdAt)
  };
}

function toMeeting(value: {
  id: string;
  title: string;
  language: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  docUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants?: { participantId: string }[];
}): Meeting {
  return {
    id: value.id,
    title: value.title,
    language: value.language,
    status: value.status as MeetingStatus,
    startedAt: dateToIso(value.startedAt),
    endedAt: value.endedAt ? dateToIso(value.endedAt) : undefined,
    docUrl: value.docUrl ?? undefined,
    errorMessage: value.errorMessage ?? undefined,
    participantIds: value.participants?.map((item) => item.participantId) ?? [],
    createdAt: dateToIso(value.createdAt),
    updatedAt: dateToIso(value.updatedAt)
  };
}

function toSegment(value: {
  id: string;
  meetingId: string;
  participantId: string | null;
  speakerLabel: string;
  diarizationLabel: string | null;
  text: string;
  confidence: number;
  timestampMs: number;
  isOverlapping: boolean;
  createdAt: Date;
}): TranscriptSegment {
  return {
    id: value.id,
    meetingId: value.meetingId,
    participantId: value.participantId ?? undefined,
    speakerLabel: value.speakerLabel,
    diarizationLabel: value.diarizationLabel ?? undefined,
    text: value.text,
    confidence: value.confidence,
    timestampMs: value.timestampMs,
    isOverlapping: value.isOverlapping,
    createdAt: dateToIso(value.createdAt)
  };
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function jsonObjectArray<T extends object>(value: Prisma.JsonValue): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is T => typeof item === "object" && item !== null) as T[];
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toArtifacts(value: {
  id: string;
  meetingId: string;
  summary: string;
  protocolDraft: string;
  keyTopicsJson: Prisma.JsonValue;
  actionItemsJson: Prisma.JsonValue;
  decisionsJson: Prisma.JsonValue;
  openQuestionsJson: Prisma.JsonValue;
  risksJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): MeetingArtifacts {
  return {
    id: value.id,
    meetingId: value.meetingId,
    summary: value.summary,
    protocolDraft: value.protocolDraft,
    keyTopics: jsonStringArray(value.keyTopicsJson),
    actionItems: jsonObjectArray<MeetingArtifacts["actionItems"][number]>(value.actionItemsJson),
    decisions: jsonObjectArray<MeetingArtifacts["decisions"][number]>(value.decisionsJson),
    openQuestions: jsonObjectArray<MeetingArtifacts["openQuestions"][number]>(value.openQuestionsJson),
    risks: jsonObjectArray<MeetingArtifacts["risks"][number]>(value.risksJson),
    createdAt: dateToIso(value.createdAt),
    updatedAt: dateToIso(value.updatedAt)
  };
}

function toExportRecord(value: {
  id: string;
  meetingId: string;
  provider: string;
  status: string;
  externalId: string | null;
  url: string | null;
  errorMessage: string | null;
  retries: number;
  createdAt: Date;
  updatedAt: Date;
}): ExportRecord {
  return {
    id: value.id,
    meetingId: value.meetingId,
    provider: value.provider as ExportRecord["provider"],
    status: value.status as ExportRecord["status"],
    externalId: value.externalId ?? undefined,
    url: value.url ?? undefined,
    errorMessage: value.errorMessage ?? undefined,
    retries: value.retries,
    createdAt: dateToIso(value.createdAt),
    updatedAt: dateToIso(value.updatedAt)
  };
}

export class PrismaMeetingStore implements MeetingStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listParticipants(): Promise<Participant[]> {
    const participants = await this.prisma.participant.findMany({
      orderBy: {
        name: "asc"
      }
    });

    return participants.map(toParticipant);
  }

  async createParticipant(input: CreateParticipantInput): Promise<Participant> {
    const participant = await this.prisma.participant.create({
      data: {
        name: input.name,
        voiceProfileJson: input.voiceProfile as Prisma.InputJsonValue | undefined
      }
    });

    return toParticipant(participant);
  }

  async createMeeting(input: CreateMeetingInput): Promise<Meeting> {
    const meeting = await this.prisma.meeting.create({
      data: {
        title: input.title,
        language: input.language ?? "sv",
        status: "live",
        participants: {
          createMany: {
            data: input.participantIds.map((participantId) => ({ participantId }))
          }
        }
      },
      include: {
        participants: true
      }
    });

    return toMeeting(meeting);
  }

  async listMeetings(query?: MeetingListQuery): Promise<Meeting[]> {
    const meetings = await this.prisma.meeting.findMany({
      where: query?.search
        ? {
            title: {
              contains: query.search,
              mode: "insensitive"
            }
          }
        : undefined,
      orderBy: {
        startedAt: "desc"
      },
      include: {
        participants: {
          select: {
            participantId: true
          }
        }
      }
    });

    return meetings.map(toMeeting);
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        participants: {
          select: {
            participantId: true
          }
        }
      }
    });

    return meeting ? toMeeting(meeting) : undefined;
  }

  async updateMeetingStatus(id: string, status: MeetingStatus, patch?: Partial<Meeting>): Promise<Meeting> {
    const meeting = await this.prisma.meeting.update({
      where: { id },
      data: {
        status,
        title: patch?.title,
        language: patch?.language,
        endedAt: patch?.endedAt ? new Date(patch.endedAt) : patch?.endedAt === undefined ? undefined : null,
        docUrl: patch?.docUrl,
        errorMessage: patch?.errorMessage
      },
      include: {
        participants: {
          select: {
            participantId: true
          }
        }
      }
    });

    return toMeeting(meeting);
  }

  async addSegment(input: AddSegmentInput): Promise<TranscriptSegment> {
    const segment = await this.prisma.transcriptSegment.create({
      data: {
        meetingId: input.meetingId,
        participantId: input.participantId,
        speakerLabel: input.speakerLabel,
        diarizationLabel: input.diarizationLabel,
        text: input.text,
        confidence: input.confidence,
        timestampMs: input.timestampMs,
        isOverlapping: input.isOverlapping ?? false
      }
    });

    return toSegment(segment);
  }

  async listSegments(meetingId: string): Promise<TranscriptSegment[]> {
    const segments = await this.prisma.transcriptSegment.findMany({
      where: { meetingId },
      orderBy: {
        timestampMs: "asc"
      }
    });

    return segments.map(toSegment);
  }

  async upsertArtifacts(
    meetingId: string,
    payload: Omit<MeetingArtifacts, "id" | "meetingId" | "createdAt" | "updatedAt">
  ): Promise<MeetingArtifacts> {
    const artifacts = await this.prisma.meetingArtifact.upsert({
      where: { meetingId },
      update: {
        summary: payload.summary,
        protocolDraft: payload.protocolDraft,
        keyTopicsJson: toInputJson(payload.keyTopics),
        actionItemsJson: toInputJson(payload.actionItems),
        decisionsJson: toInputJson(payload.decisions),
        openQuestionsJson: toInputJson(payload.openQuestions),
        risksJson: toInputJson(payload.risks)
      },
      create: {
        meetingId,
        summary: payload.summary,
        protocolDraft: payload.protocolDraft,
        keyTopicsJson: toInputJson(payload.keyTopics),
        actionItemsJson: toInputJson(payload.actionItems),
        decisionsJson: toInputJson(payload.decisions),
        openQuestionsJson: toInputJson(payload.openQuestions),
        risksJson: toInputJson(payload.risks)
      }
    });

    return toArtifacts(artifacts);
  }

  async getArtifacts(meetingId: string): Promise<MeetingArtifacts | undefined> {
    const artifacts = await this.prisma.meetingArtifact.findUnique({
      where: { meetingId }
    });

    return artifacts ? toArtifacts(artifacts) : undefined;
  }

  async createExportRecord(
    meetingId: string,
    payload: Pick<ExportRecord, "provider" | "status" | "retries" | "externalId" | "url" | "errorMessage">
  ): Promise<ExportRecord> {
    const exportRecord = await this.prisma.export.create({
      data: {
        meetingId,
        provider: payload.provider,
        status: payload.status,
        retries: payload.retries,
        externalId: payload.externalId,
        url: payload.url,
        errorMessage: payload.errorMessage
      }
    });

    return toExportRecord(exportRecord);
  }

  async updateExportRecord(id: string, patch: Partial<ExportRecord>): Promise<ExportRecord> {
    const exportRecord = await this.prisma.export.update({
      where: { id },
      data: {
        provider: patch.provider,
        status: patch.status,
        retries: patch.retries,
        externalId: patch.externalId,
        url: patch.url,
        errorMessage: patch.errorMessage
      }
    });

    return toExportRecord(exportRecord);
  }

  async listExports(meetingId: string): Promise<ExportRecord[]> {
    const exports = await this.prisma.export.findMany({
      where: { meetingId },
      orderBy: {
        createdAt: "asc"
      }
    });

    return exports.map(toExportRecord);
  }

  async getMeetingDetails(id: string): Promise<MeetingDetails | undefined> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            participant: true
          }
        },
        segments: {
          orderBy: {
            timestampMs: "asc"
          }
        },
        artifact: true,
        exports: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    if (!meeting) {
      return undefined;
    }

    return {
      meeting: toMeeting(meeting),
      participants: meeting.participants.map((item) => toParticipant(item.participant)),
      segments: meeting.segments.map(toSegment),
      artifacts: meeting.artifact ? toArtifacts(meeting.artifact) : undefined,
      exports: meeting.exports.map(toExportRecord)
    };
  }
}
