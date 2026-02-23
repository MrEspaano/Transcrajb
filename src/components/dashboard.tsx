"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Meeting, Participant } from "@/lib/types";

interface ParticipantsResponse {
  participants: Participant[];
}

interface MeetingsResponse {
  meetings: Meeting[];
}

interface CreateParticipantResponse {
  participant: Participant;
}

interface CreateMeetingResponse {
  meeting: Meeting;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }

  return payload;
}

export function Dashboard(): JSX.Element {
  const router = useRouter();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const [participantName, setParticipantName] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [submittingParticipant, setSubmittingParticipant] = useState(false);
  const [submittingMeeting, setSubmittingMeeting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canCreateMeeting = useMemo(() => selectedParticipantIds.length > 0 && !submittingMeeting, [selectedParticipantIds, submittingMeeting]);

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshAll(): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [participantsRes, meetingsRes] = await Promise.all([
        fetch("/api/participants", { cache: "no-store" }),
        fetch(`/api/meetings${search ? `?search=${encodeURIComponent(search)}` : ""}`, {
          cache: "no-store"
        })
      ]);

      const participantsPayload = await parseResponse<ParticipantsResponse>(participantsRes);
      const meetingsPayload = await parseResponse<MeetingsResponse>(meetingsRes);

      setParticipants(participantsPayload.participants);
      setMeetings(meetingsPayload.meetings);

      setSelectedParticipantIds((current) => {
        const validIds = new Set(participantsPayload.participants.map((participant) => participant.id));
        return current.filter((id) => validIds.has(id));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunde inte ladda data";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  async function onCreateParticipant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmittingParticipant(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/participants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: participantName })
      });

      const payload = await parseResponse<CreateParticipantResponse>(response);
      setParticipantName("");
      setParticipants((current) => [...current, payload.participant].sort((a, b) => a.name.localeCompare(b.name, "sv")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunde inte skapa deltagare";
      setErrorMessage(message);
    } finally {
      setSubmittingParticipant(false);
    }
  }

  async function onCreateMeeting(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmittingMeeting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: meetingTitle.trim() || `Möte ${new Date().toLocaleDateString("sv-SE")}`,
          language: "sv",
          participantIds: selectedParticipantIds
        })
      });

      const payload = await parseResponse<CreateMeetingResponse>(response);
      setMeetingTitle("");
      router.push(`/meetings/${payload.meeting.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunde inte skapa möte";
      setErrorMessage(message);
    } finally {
      setSubmittingMeeting(false);
    }
  }

  function toggleParticipant(id: string): void {
    setSelectedParticipantIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      if (current.length >= 5) {
        return current;
      }

      return [...current, id];
    });
  }

  return (
    <section className="panel-grid">
      <header className="hero-card">
        <p className="eyebrow">Transcrajb V1</p>
        <h1>Live-transkribera möten och spara protokoll automatiskt</h1>
        <p>
          Starta ett möte i webben, få löpande transkript med talar-taggar och exportera sammanfattning + protokollutkast
          till Google Docs.
        </p>
      </header>

      <div className="card">
        <h2>Deltagare</h2>
        <form onSubmit={onCreateParticipant} className="stack">
          <label className="label" htmlFor="participant-name">
            Lägg till deltagare
          </label>
          <input
            id="participant-name"
            className="input"
            value={participantName}
            onChange={(event) => setParticipantName(event.target.value)}
            placeholder="Ex: Anna"
            required
            minLength={2}
            maxLength={80}
          />
          <button className="button" type="submit" disabled={submittingParticipant}>
            {submittingParticipant ? "Sparar..." : "Skapa deltagare"}
          </button>
        </form>

        <ul className="list">
          {participants.length === 0 ? <li>Inga deltagare ännu.</li> : null}
          {participants.map((participant) => (
            <li key={participant.id}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedParticipantIds.includes(participant.id)}
                  onChange={() => toggleParticipant(participant.id)}
                />
                <span>{participant.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="helper">Valda deltagare: {selectedParticipantIds.length}/5</p>
      </div>

      <div className="card">
        <h2>Nytt möte</h2>
        <form onSubmit={onCreateMeeting} className="stack">
          <label className="label" htmlFor="meeting-title">
            Mötestitel
          </label>
          <input
            id="meeting-title"
            className="input"
            value={meetingTitle}
            onChange={(event) => setMeetingTitle(event.target.value)}
            placeholder="Ex: Veckoplanering Produktteam"
            required
            maxLength={160}
          />

          <button className="button accent" type="submit" disabled={!canCreateMeeting}>
            {submittingMeeting ? "Startar..." : "Skapa och öppna möte"}
          </button>
        </form>

        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </div>

      <div className="card wide">
        <div className="row-between">
          <h2>Möteshistorik</h2>
          <button className="button subtle" type="button" onClick={() => void refreshAll()} disabled={loading}>
            {loading ? "Laddar..." : "Uppdatera"}
          </button>
        </div>

        <form
          className="search-row"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshAll();
          }}
        >
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Sök på mötestitel"
            maxLength={80}
          />
          <button className="button" type="submit">
            Sök
          </button>
        </form>

        <ul className="list">
          {meetings.length === 0 ? <li>Inga möten hittades.</li> : null}
          {meetings.map((meeting) => (
            <li key={meeting.id} className="meeting-item">
              <div>
                <p className="meeting-title">{meeting.title}</p>
                <p className="helper">
                  {new Date(meeting.startedAt).toLocaleString("sv-SE")} • Status: {meeting.status}
                </p>
                {meeting.docUrl ? (
                  <a className="inline-link" href={meeting.docUrl} target="_blank" rel="noreferrer">
                    Öppna dokument
                  </a>
                ) : null}
              </div>

              <Link className="button subtle" href={`/meetings/${meeting.id}`}>
                Öppna
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
