import { createId } from "@/lib/id";
import {
  ActionItem,
  Decision,
  Meeting,
  OpenQuestion,
  Participant,
  RiskItem,
  TranscriptSegment
} from "@/lib/types";

const SWEDISH_STOPWORDS = new Set([
  "att",
  "det",
  "som",
  "och",
  "för",
  "med",
  "inte",
  "är",
  "vi",
  "ni",
  "de",
  "han",
  "hon",
  "jag",
  "du",
  "på",
  "en",
  "ett",
  "till",
  "från",
  "har",
  "ska",
  "kan",
  "om",
  "hur",
  "var",
  "vad",
  "detta",
  "den",
  "det",
  "sig",
  "då",
  "men",
  "så",
  "också",
  "eller",
  "hos",
  "inom",
  "mötet",
  "möte"
]);

function normalizeLine(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function extractKeyTopics(segments: TranscriptSegment[]): string[] {
  const frequencies = new Map<string, number>();

  for (const segment of segments) {
    const tokens = segment.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3 && !SWEDISH_STOPWORDS.has(token));

    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }

  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function topSummaryLines(segments: TranscriptSegment[]): string[] {
  const ranked = [...segments]
    .filter((segment) => segment.text.length > 30)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 5)
    .map((segment) => `- ${segment.speakerLabel}: ${normalizeLine(segment.text)}`);

  if (ranked.length > 0) {
    return ranked;
  }

  return segments.slice(0, 5).map((segment) => `- ${segment.speakerLabel}: ${normalizeLine(segment.text)}`);
}

function findOwner(participants: Participant[], line: string): string | undefined {
  const lowered = line.toLowerCase();
  const matchedParticipant = participants.find((participant) => lowered.includes(participant.name.toLowerCase()));
  if (matchedParticipant) {
    return matchedParticipant.name;
  }

  const ownerPattern = line.match(/^([\p{L} .'-]{2,40}) ska/iu);
  return ownerPattern?.[1]?.trim();
}

function findDueDate(line: string): string | undefined {
  const isoDate = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDate?.[1]) {
    return isoDate[1];
  }

  const slashDate = line.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (slashDate?.[1]) {
    return slashDate[1];
  }

  const weekPattern = line.match(/\bv(?:ecka)?\s?(\d{1,2})\b/i);
  if (weekPattern?.[1]) {
    return `vecka ${weekPattern[1]}`;
  }

  return undefined;
}

function pushUnique<T extends { text: string }>(target: T[], candidate: T): void {
  const exists = target.some((item) => item.text.toLowerCase() === candidate.text.toLowerCase());
  if (!exists) {
    target.push(candidate);
  }
}

function extractStructuredItems(
  segments: TranscriptSegment[],
  participants: Participant[]
): {
  actionItems: ActionItem[];
  decisions: Decision[];
  openQuestions: OpenQuestion[];
  risks: RiskItem[];
} {
  const actionItems: ActionItem[] = [];
  const decisions: Decision[] = [];
  const openQuestions: OpenQuestion[] = [];
  const risks: RiskItem[] = [];

  for (const segment of segments) {
    const line = normalizeLine(segment.text);

    if (/\b(beslut|beslutar|vi bestämmer|godkänns)\b/i.test(line)) {
      pushUnique(decisions, {
        id: createId("dec"),
        text: line,
        references: [segment.id]
      });
    }

    const actionMatch =
      /\b(action|att göra|todo|to-do|åtgärd|ska\s+[^.?!]{3,})\b/i.test(line) ||
      /\bvi behöver\b/i.test(line);

    if (actionMatch) {
      pushUnique(actionItems, {
        id: createId("act"),
        text: line,
        owner: findOwner(participants, line),
        dueDate: findDueDate(line),
        references: [segment.id]
      });
    }

    if (line.includes("?") || /\b(fråga|oklart|behöver utredas)\b/i.test(line)) {
      pushUnique(openQuestions, {
        id: createId("q"),
        text: line,
        references: [segment.id]
      });
    }

    if (/\b(risk|problem|blocker|osäkerhet|beroende)\b/i.test(line)) {
      pushUnique(risks, {
        id: createId("risk"),
        text: line,
        references: [segment.id]
      });
    }

    if (segment.isOverlapping) {
      pushUnique(risks, {
        id: createId("risk"),
        text: `Överlappande tal upptäcktes kring tidsstämpel ${Math.floor(segment.timestampMs / 1000)}s.`,
        references: [segment.id]
      });
    }
  }

  return {
    actionItems,
    decisions,
    openQuestions,
    risks
  };
}

export function buildProtocolDraft(input: {
  meeting: Meeting;
  keyTopics: string[];
  summaryLines: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  openQuestions: OpenQuestion[];
  risks: RiskItem[];
}): string {
  const sections = [
    `# Protokollutkast: ${input.meeting.title}`,
    "",
    `- Start: ${new Date(input.meeting.startedAt).toLocaleString("sv-SE")}`,
    `- Språk: ${input.meeting.language}`,
    "",
    "## Sammanfattning",
    ...input.summaryLines,
    "",
    "## Nyckelämnen",
    ...input.keyTopics.map((topic) => `- ${topic}`),
    "",
    "## Beslut",
    ...(input.decisions.length > 0
      ? input.decisions.map((item) => `- ${item.text}`)
      : ["- Inga tydliga beslut extraherades."]),
    "",
    "## Action items",
    ...(input.actionItems.length > 0
      ? input.actionItems.map((item) => {
          const owner = item.owner ? ` | Ägare: ${item.owner}` : "";
          const due = item.dueDate ? ` | Deadline: ${item.dueDate}` : "";
          return `- ${item.text}${owner}${due}`;
        })
      : ["- Inga tydliga action items extraherades."]),
    "",
    "## Öppna frågor",
    ...(input.openQuestions.length > 0
      ? input.openQuestions.map((item) => `- ${item.text}`)
      : ["- Inga öppna frågor extraherades."]),
    "",
    "## Risker",
    ...(input.risks.length > 0 ? input.risks.map((item) => `- ${item.text}`) : ["- Inga tydliga risker extraherades."])
  ];

  return sections.join("\n");
}

export function generateArtifacts(input: {
  meeting: Meeting;
  segments: TranscriptSegment[];
  participants: Participant[];
}): Omit<
  ReturnType<typeof createArtifactsPayload>,
  "protocolDraft"
> & { protocolDraft: string } {
  return createArtifactsPayload(input.meeting, input.segments, input.participants);
}

function createArtifactsPayload(meeting: Meeting, segments: TranscriptSegment[], participants: Participant[]) {
  const summaryLines = topSummaryLines(segments);
  const keyTopics = extractKeyTopics(segments);
  const structured = extractStructuredItems(segments, participants);

  const summary = summaryLines.join("\n");

  const protocolDraft = buildProtocolDraft({
    meeting,
    keyTopics,
    summaryLines,
    decisions: structured.decisions,
    actionItems: structured.actionItems,
    openQuestions: structured.openQuestions,
    risks: structured.risks
  });

  return {
    summary,
    protocolDraft,
    keyTopics,
    actionItems: structured.actionItems,
    decisions: structured.decisions,
    openQuestions: structured.openQuestions,
    risks: structured.risks
  };
}
