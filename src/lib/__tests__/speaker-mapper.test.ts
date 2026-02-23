import { SpeakerMapper } from "@/lib/speaker-mapper";
import { Participant } from "@/lib/types";

function createParticipant(id: string, name: string): Participant {
  return {
    id,
    name,
    createdAt: new Date().toISOString()
  };
}

describe("SpeakerMapper", () => {
  it("uses explicit speaker hint when provided", () => {
    const mapper = new SpeakerMapper();
    const participants = [createParticipant("p1", "Anna"), createParticipant("p2", "Björn")];

    const mapped = mapper.map({
      meetingId: "m1",
      participants,
      text: "Vi borde prioritera backloggen",
      speakerHintId: "p2"
    });

    expect(mapped.participantId).toBe("p2");
    expect(mapped.speakerLabel).toBe("Björn");
  });

  it("maps by name prefix in transcript text", () => {
    const mapper = new SpeakerMapper();
    const participants = [createParticipant("p1", "Anna"), createParticipant("p2", "Björn")];

    const mapped = mapper.map({
      meetingId: "m1",
      participants,
      text: "Anna: Jag tar actionen till fredag"
    });

    expect(mapped.participantId).toBe("p1");
    expect(mapped.speakerLabel).toBe("Anna");
  });

  it("falls back to unknown speaker when no signal exists", () => {
    const mapper = new SpeakerMapper();

    const mapped = mapper.map({
      meetingId: "m1",
      participants: [createParticipant("p1", "Anna")],
      text: "Diskussionen fortsätter"
    });

    expect(mapped.participantId).toBeUndefined();
    expect(mapped.speakerLabel).toBe("Okänd talare");
  });
});
