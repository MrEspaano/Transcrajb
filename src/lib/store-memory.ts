import { createId, nowIso } from "@/lib/id";
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

function applySearch(meetings: Meeting[], query?: MeetingListQuery): Meeting[] {
  if (!query?.search) {
    return meetings;
  }

  const term = query.search.toLowerCase();
  return meetings.filter((meeting) => meeting.title.toLowerCase().includes(term));
}

export class InMemoryMeetingStore implements MeetingStore {
  private participants = new Map<string, Participant>();
  private meetings = new Map<string, Meeting>();
  private segments = new Map<string, TranscriptSegment[]>();
  private artifacts = new Map<string, MeetingArtifacts>();
  private exports = new Map<string, ExportRecord[]>();

  async listParticipants(): Promise<Participant[]> {
    return [...this.participants.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }

  async createParticipant(input: CreateParticipantInput): Promise<Participant> {
    const participant: Participant = {
      id: createId("prt"),
      name: input.name,
      voiceProfile: input.voiceProfile,
      createdAt: nowIso()
    };

    this.participants.set(participant.id, participant);
    return participant;
  }

  async createMeeting(input: CreateMeetingInput): Promise<Meeting> {
    const now = nowIso();
    const meeting: Meeting = {
      id: createId("mtg"),
      title: input.title,
      language: input.language ?? "sv",
      status: "live",
      startedAt: now,
      participantIds: input.participantIds,
      createdAt: now,
      updatedAt: now
    };

    this.meetings.set(meeting.id, meeting);
    this.segments.set(meeting.id, []);
    this.exports.set(meeting.id, []);

    return meeting;
  }

  async listMeetings(query?: MeetingListQuery): Promise<Meeting[]> {
    const meetings = [...this.meetings.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return applySearch(meetings, query);
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    return this.meetings.get(id);
  }

  async updateMeetingStatus(id: string, status: MeetingStatus, patch?: Partial<Meeting>): Promise<Meeting> {
    const meeting = this.meetings.get(id);
    if (!meeting) {
      throw new Error(`Meeting ${id} not found`);
    }

    const updated: Meeting = {
      ...meeting,
      ...patch,
      status,
      updatedAt: nowIso()
    };

    this.meetings.set(id, updated);
    return updated;
  }

  async addSegment(input: AddSegmentInput): Promise<TranscriptSegment> {
    const items = this.segments.get(input.meetingId);

    if (!items) {
      throw new Error(`Meeting ${input.meetingId} not found`);
    }

    const segment: TranscriptSegment = {
      id: createId("seg"),
      meetingId: input.meetingId,
      participantId: input.participantId,
      speakerLabel: input.speakerLabel,
      diarizationLabel: input.diarizationLabel,
      text: input.text,
      confidence: input.confidence,
      timestampMs: input.timestampMs,
      isOverlapping: input.isOverlapping ?? false,
      createdAt: nowIso()
    };

    items.push(segment);
    return segment;
  }

  async listSegments(meetingId: string): Promise<TranscriptSegment[]> {
    return [...(this.segments.get(meetingId) ?? [])];
  }

  async upsertArtifacts(
    meetingId: string,
    payload: Omit<MeetingArtifacts, "id" | "meetingId" | "createdAt" | "updatedAt">
  ): Promise<MeetingArtifacts> {
    const now = nowIso();
    const existing = this.artifacts.get(meetingId);

    const artifact: MeetingArtifacts = existing
      ? {
          ...existing,
          ...payload,
          updatedAt: now
        }
      : {
          id: createId("art"),
          meetingId,
          ...payload,
          createdAt: now,
          updatedAt: now
        };

    this.artifacts.set(meetingId, artifact);
    return artifact;
  }

  async getArtifacts(meetingId: string): Promise<MeetingArtifacts | undefined> {
    return this.artifacts.get(meetingId);
  }

  async createExportRecord(
    meetingId: string,
    payload: Pick<ExportRecord, "provider" | "status" | "retries" | "externalId" | "url" | "errorMessage">
  ): Promise<ExportRecord> {
    const items = this.exports.get(meetingId);
    if (!items) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const record: ExportRecord = {
      id: createId("exp"),
      meetingId,
      provider: payload.provider,
      status: payload.status,
      retries: payload.retries,
      externalId: payload.externalId,
      url: payload.url,
      errorMessage: payload.errorMessage,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    items.push(record);
    return record;
  }

  async updateExportRecord(id: string, patch: Partial<ExportRecord>): Promise<ExportRecord> {
    for (const [meetingId, records] of this.exports.entries()) {
      const idx = records.findIndex((item) => item.id === id);
      if (idx !== -1) {
        const updated: ExportRecord = {
          ...records[idx],
          ...patch,
          updatedAt: nowIso()
        };

        records[idx] = updated;
        this.exports.set(meetingId, records);
        return updated;
      }
    }

    throw new Error(`Export record ${id} not found`);
  }

  async listExports(meetingId: string): Promise<ExportRecord[]> {
    return [...(this.exports.get(meetingId) ?? [])];
  }

  async getMeetingDetails(id: string): Promise<MeetingDetails | undefined> {
    const meeting = this.meetings.get(id);
    if (!meeting) {
      return undefined;
    }

    const participantMap = new Map<string, Participant>();
    for (const participantId of meeting.participantIds) {
      const participant = this.participants.get(participantId);
      if (participant) {
        participantMap.set(participant.id, participant);
      }
    }

    return {
      meeting,
      participants: [...participantMap.values()],
      segments: [...(this.segments.get(id) ?? [])],
      artifacts: this.artifacts.get(id),
      exports: [...(this.exports.get(id) ?? [])]
    };
  }
}
