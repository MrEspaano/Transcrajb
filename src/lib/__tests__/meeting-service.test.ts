import { MeetingService } from "@/lib/meeting-service";
import { GoogleDocsExporter } from "@/lib/google-docs";
import { SpeakerMapper } from "@/lib/speaker-mapper";
import { InMemoryMeetingStore } from "@/lib/store-memory";
import { SpeechToTextService } from "@/lib/stt";

class MockGoogleExporter extends GoogleDocsExporter {
  async exportMeeting() {
    return {
      externalId: "doc-123",
      url: "https://docs.google.com/document/d/doc-123/edit",
      mode: "google" as const
    };
  }
}

describe("MeetingService", () => {
  it("creates meeting, ingests segment, finalizes, and exports", async () => {
    const service = new MeetingService(
      new InMemoryMeetingStore(),
      new SpeechToTextService(undefined),
      new SpeakerMapper(),
      new MockGoogleExporter()
    );

    const participant = await service.createParticipant({ name: "Anna" });

    const meeting = await service.createMeeting({
      title: "Planeringsmöte",
      language: "sv",
      participantIds: [participant.id]
    });

    const ingest = await service.ingestAudioChunk(meeting.id, {
      text: "Anna: Beslut att vi prioriterar API-förbättringen."
    });

    expect(ingest.segment.text).toContain("Beslut");

    const finalized = await service.finalizeMeeting(meeting.id);

    expect(finalized.meeting.status).toBe("completed");
    expect(finalized.artifacts.summary.length).toBeGreaterThan(0);
    expect(finalized.exportRecord.status).toBe("success");

    const details = await service.getMeetingDetails(meeting.id);
    expect(details.meeting.docUrl).toContain("docs.google.com");
  });
});
