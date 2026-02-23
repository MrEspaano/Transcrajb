import { generateArtifacts } from "@/lib/artifact-generator";
import { Meeting, Participant, TranscriptSegment } from "@/lib/types";

function createMeeting(): Meeting {
  const now = new Date().toISOString();
  return {
    id: "m1",
    title: "Sprintmöte",
    language: "sv",
    status: "live",
    startedAt: now,
    participantIds: ["p1", "p2"],
    createdAt: now,
    updatedAt: now
  };
}

function createParticipants(): Participant[] {
  return [
    { id: "p1", name: "Anna", createdAt: new Date().toISOString() },
    { id: "p2", name: "Björn", createdAt: new Date().toISOString() }
  ];
}

function createSegments(): TranscriptSegment[] {
  const now = new Date().toISOString();
  return [
    {
      id: "s1",
      meetingId: "m1",
      participantId: "p1",
      speakerLabel: "Anna",
      text: "Beslut: Vi lanserar funktionen nästa vecka.",
      confidence: 0.94,
      timestampMs: 3000,
      isOverlapping: false,
      createdAt: now
    },
    {
      id: "s2",
      meetingId: "m1",
      participantId: "p2",
      speakerLabel: "Björn",
      text: "Action: Björn ska skriva release notes senast 2026-03-01.",
      confidence: 0.93,
      timestampMs: 5200,
      isOverlapping: false,
      createdAt: now
    },
    {
      id: "s3",
      meetingId: "m1",
      participantId: undefined,
      speakerLabel: "Okänd talare",
      text: "Finns det någon risk att API:t blir för långsamt?",
      confidence: 0.54,
      timestampMs: 6100,
      isOverlapping: true,
      createdAt: now
    }
  ];
}

describe("generateArtifacts", () => {
  it("extracts decisions, actions, open questions, and risks", () => {
    const artifacts = generateArtifacts({
      meeting: createMeeting(),
      participants: createParticipants(),
      segments: createSegments()
    });

    expect(artifacts.decisions.length).toBeGreaterThan(0);
    expect(artifacts.actionItems.length).toBeGreaterThan(0);
    expect(artifacts.openQuestions.length).toBeGreaterThan(0);
    expect(artifacts.risks.length).toBeGreaterThan(0);
    expect(artifacts.protocolDraft).toContain("## Beslut");
  });
});
