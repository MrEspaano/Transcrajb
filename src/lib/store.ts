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

export interface MeetingStore {
  listParticipants(): Promise<Participant[]>;
  createParticipant(input: CreateParticipantInput): Promise<Participant>;

  createMeeting(input: CreateMeetingInput): Promise<Meeting>;
  listMeetings(query?: MeetingListQuery): Promise<Meeting[]>;
  getMeeting(id: string): Promise<Meeting | undefined>;
  updateMeetingStatus(id: string, status: MeetingStatus, patch?: Partial<Meeting>): Promise<Meeting>;

  addSegment(input: AddSegmentInput): Promise<TranscriptSegment>;
  listSegments(meetingId: string): Promise<TranscriptSegment[]>;

  upsertArtifacts(
    meetingId: string,
    payload: Omit<MeetingArtifacts, "id" | "meetingId" | "createdAt" | "updatedAt">
  ): Promise<MeetingArtifacts>;
  getArtifacts(meetingId: string): Promise<MeetingArtifacts | undefined>;

  createExportRecord(
    meetingId: string,
    payload: Pick<ExportRecord, "provider" | "status" | "retries" | "externalId" | "url" | "errorMessage">
  ): Promise<ExportRecord>;
  updateExportRecord(id: string, patch: Partial<ExportRecord>): Promise<ExportRecord>;
  listExports(meetingId: string): Promise<ExportRecord[]>;

  getMeetingDetails(id: string): Promise<MeetingDetails | undefined>;
}
