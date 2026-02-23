import { Participant } from "@/lib/types";

export interface SpeakerMappingInput {
  meetingId: string;
  participants: Participant[];
  text: string;
  speakerHintId?: string;
  diarizationLabel?: string;
  voiceEmbedding?: number[];
}

export interface SpeakerMappingResult {
  participantId?: string;
  speakerLabel: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return -1;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let idx = 0; idx < a.length; idx += 1) {
    dot += a[idx] * b[idx];
    normA += a[idx] ** 2;
    normB += b[idx] ** 2;
  }

  if (normA === 0 || normB === 0) {
    return -1;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class SpeakerMapper {
  private diarizationMemory = new Map<string, Map<string, string>>();

  map(input: SpeakerMappingInput): SpeakerMappingResult {
    const participantsById = new Map(input.participants.map((participant) => [participant.id, participant]));

    if (input.speakerHintId) {
      const hinted = participantsById.get(input.speakerHintId);
      if (hinted) {
        this.remember(input.meetingId, input.diarizationLabel, hinted.id);
        return { participantId: hinted.id, speakerLabel: hinted.name };
      }
    }

    if (input.diarizationLabel) {
      const rememberedId = this.diarizationMemory.get(input.meetingId)?.get(input.diarizationLabel);
      if (rememberedId) {
        const rememberedParticipant = participantsById.get(rememberedId);
        if (rememberedParticipant) {
          return { participantId: rememberedParticipant.id, speakerLabel: rememberedParticipant.name };
        }
      }
    }

    const byName = this.matchByNamePrefix(input.text, input.participants);
    if (byName) {
      this.remember(input.meetingId, input.diarizationLabel, byName.id);
      return { participantId: byName.id, speakerLabel: byName.name };
    }

    const byEmbedding = this.matchByEmbedding(input.voiceEmbedding, input.participants);
    if (byEmbedding) {
      this.remember(input.meetingId, input.diarizationLabel, byEmbedding.id);
      return { participantId: byEmbedding.id, speakerLabel: byEmbedding.name };
    }

    return {
      speakerLabel: "Okänd talare"
    };
  }

  private remember(meetingId: string, diarizationLabel: string | undefined, participantId: string): void {
    if (!diarizationLabel) {
      return;
    }

    const meetingMap = this.diarizationMemory.get(meetingId) ?? new Map<string, string>();
    meetingMap.set(diarizationLabel, participantId);
    this.diarizationMemory.set(meetingId, meetingMap);
  }

  private matchByNamePrefix(text: string, participants: Participant[]): Participant | undefined {
    const normalized = text.trim();
    const prefixMatch = normalized.match(/^([\p{L} .'-]{2,40}):/u);
    const prefix = prefixMatch?.[1]?.trim().toLowerCase();

    if (prefix) {
      const exact = participants.find((participant) => participant.name.toLowerCase() === prefix);
      if (exact) {
        return exact;
      }

      const startsWith = participants.find((participant) => participant.name.toLowerCase().startsWith(prefix));
      if (startsWith) {
        return startsWith;
      }
    }

    return undefined;
  }

  private matchByEmbedding(embedding: number[] | undefined, participants: Participant[]): Participant | undefined {
    if (!embedding || embedding.length === 0) {
      return undefined;
    }

    let bestParticipant: Participant | undefined;
    let bestScore = -1;

    for (const participant of participants) {
      const candidate = participant.voiceProfile?.embedding;
      if (!candidate) {
        continue;
      }

      const score = cosineSimilarity(embedding, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestParticipant = participant;
      }
    }

    if (bestScore < 0.82) {
      return undefined;
    }

    return bestParticipant;
  }
}

declare global {
  var __transcrajbSpeakerMapper__: SpeakerMapper | undefined;
}

export function getSpeakerMapper(): SpeakerMapper {
  if (!globalThis.__transcrajbSpeakerMapper__) {
    globalThis.__transcrajbSpeakerMapper__ = new SpeakerMapper();
  }

  return globalThis.__transcrajbSpeakerMapper__;
}
