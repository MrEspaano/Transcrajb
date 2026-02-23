export type MeetingStatus = "live" | "processing" | "completed" | "failed";

export type ExportStatus = "pending" | "success" | "failed";

export interface User {
  id: string;
  name: string;
  email?: string;
  createdAt: string;
}

export interface VoiceProfile {
  embedding?: number[];
  notes?: string;
}

export interface Participant {
  id: string;
  name: string;
  voiceProfile?: VoiceProfile;
  createdAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  language: string;
  status: MeetingStatus;
  startedAt: string;
  endedAt?: string;
  docUrl?: string;
  errorMessage?: string;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  participantId?: string;
  speakerLabel: string;
  diarizationLabel?: string;
  text: string;
  confidence: number;
  timestampMs: number;
  isOverlapping: boolean;
  createdAt: string;
}

export interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  references: string[];
}

export interface Decision {
  id: string;
  text: string;
  references: string[];
}

export interface OpenQuestion {
  id: string;
  text: string;
  references: string[];
}

export interface RiskItem {
  id: string;
  text: string;
  references: string[];
}

export interface MeetingArtifacts {
  id: string;
  meetingId: string;
  summary: string;
  protocolDraft: string;
  keyTopics: string[];
  actionItems: ActionItem[];
  decisions: Decision[];
  openQuestions: OpenQuestion[];
  risks: RiskItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ExportRecord {
  id: string;
  meetingId: string;
  provider: "google_docs";
  status: ExportStatus;
  externalId?: string;
  url?: string;
  errorMessage?: string;
  retries: number;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingDetails {
  meeting: Meeting;
  participants: Participant[];
  segments: TranscriptSegment[];
  artifacts?: MeetingArtifacts;
  exports: ExportRecord[];
}

export interface CreateParticipantInput {
  name: string;
  voiceProfile?: VoiceProfile;
}

export interface CreateMeetingInput {
  title: string;
  language?: string;
  participantIds: string[];
}

export interface AddSegmentInput {
  meetingId: string;
  participantId?: string;
  speakerLabel: string;
  diarizationLabel?: string;
  text: string;
  confidence: number;
  timestampMs: number;
  isOverlapping?: boolean;
}

export interface MeetingListQuery {
  search?: string;
}

export interface AudioChunkIngestRequest {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  speakerHintId?: string;
  diarizationLabel?: string;
  voiceEmbedding?: number[];
  confidence?: number;
  isOverlapping?: boolean;
}

export interface IngestResult {
  segment: TranscriptSegment;
}

export interface FinalizeResult {
  meeting: Meeting;
  artifacts: MeetingArtifacts;
  exportRecord: ExportRecord;
}
