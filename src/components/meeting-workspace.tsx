"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { MeetingDetails } from "@/lib/types";

interface MeetingWorkspaceProps {
  meetingId: string;
}

type LiveEventPayload =
  | { type: "segment"; segment: MeetingDetails["segments"][number] }
  | { type: "status"; status: string; message?: string }
  | { type: "heartbeat"; at: string };

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }

  return payload;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read audio chunk"));
        return;
      }

      const [, base64] = result.split(",");
      resolve(base64 ?? "");
    };

    reader.onerror = () => reject(new Error("Failed to convert audio chunk to base64"));
    reader.readAsDataURL(blob);
  });
}

function formatSecond(timestampMs: number): string {
  return `${Math.floor(timestampMs / 1000)}s`;
}

export function MeetingWorkspace({ meetingId }: MeetingWorkspaceProps): JSX.Element {
  const [details, setDetails] = useState<MeetingDetails | null>(null);
  const [connectionMessage, setConnectionMessage] = useState("Ansluter...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [manualText, setManualText] = useState("");
  const [speakerHintId, setSpeakerHintId] = useState<string>("");

  const [isRecording, setIsRecording] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const participants = details?.participants ?? [];
  const segments = details?.segments ?? [];

  const meetingStatus = details?.meeting.status ?? "live";

  const canFinalize = useMemo(() => meetingStatus === "live" && !isFinalizing, [meetingStatus, isFinalizing]);

  useEffect(() => {
    void refreshDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    const source = new EventSource(`/api/meetings/${meetingId}/live`);

    source.onopen = () => setConnectionMessage("Livekanal ansluten");
    source.onerror = () => setConnectionMessage("Livekanal avbruten, försök igen.");
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as LiveEventPayload;

      if (payload.type === "status") {
        if (payload.message) {
          setConnectionMessage(payload.message);
        }
        setDetails((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            meeting: {
              ...current.meeting,
              status: payload.status as MeetingDetails["meeting"]["status"]
            }
          };
        });
        return;
      }

      if (payload.type === "segment") {
        setDetails((current) => {
          if (!current) {
            return current;
          }

          const alreadyExists = current.segments.some((segment) => segment.id === payload.segment.id);
          if (alreadyExists) {
            return current;
          }

          return {
            ...current,
            segments: [...current.segments, payload.segment]
          };
        });
      }
    };

    return () => {
      source.close();
    };
  }, [meetingId]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshDetails(): Promise<void> {
    try {
      const response = await fetch(`/api/meetings/${meetingId}`, { cache: "no-store" });
      const payload = await parseResponse<MeetingDetails>(response);
      setDetails(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunde inte hämta mötesdata";
      setErrorMessage(message);
    }
  }

  async function sendAudioChunk(blob: Blob): Promise<void> {
    if (blob.size === 0) {
      return;
    }

    const audioBase64 = await blobToBase64(blob);

    const response = await fetch(`/api/meetings/${meetingId}/audio-chunk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type || "audio/webm",
        speakerHintId: speakerHintId || undefined
      })
    });

    if (response.status === 202) {
      return;
    }

    await parseResponse<{ segment: MeetingDetails["segments"][number] }>(response);
  }

  async function startRecording(): Promise<void> {
    try {
      setErrorMessage(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Din browser saknar stöd för mikrofoninspelning");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true
        }
      });

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = preferredTypes.find((candidate) => {
        if (typeof MediaRecorder.isTypeSupported !== "function") {
          return false;
        }

        return MediaRecorder.isTypeSupported(candidate);
      });

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        void sendAudioChunk(event.data).catch((error) => {
          const message = error instanceof Error ? error.message : "Kunde inte skicka ljudchunk";
          setErrorMessage(message);
        });
      };

      recorder.onerror = () => {
        setErrorMessage("Ett fel inträffade under inspelning.");
      };

      recorderRef.current = recorder;
      streamRef.current = stream;

      recorder.start(4000);
      setIsRecording(true);
      setConnectionMessage("Mikrofon inspelning aktiv");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunde inte starta inspelning";
      setErrorMessage(message);
      stopRecording();
    }
  }

  function stopRecording(): void {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    recorderRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    streamRef.current = null;
    setIsRecording(false);
  }

  async function submitManualSegment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      setErrorMessage(null);
      const response = await fetch(`/api/meetings/${meetingId}/audio-chunk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: manualText,
          speakerHintId: speakerHintId || undefined
        })
      });

      await parseResponse<{ segment: MeetingDetails["segments"][number] }>(response);
      setManualText("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunde inte skicka textsegment";
      setErrorMessage(message);
    }
  }

  async function finalizeMeeting(): Promise<void> {
    setIsFinalizing(true);
    setErrorMessage(null);

    try {
      stopRecording();

      const response = await fetch(`/api/meetings/${meetingId}/finalize`, {
        method: "POST"
      });

      await parseResponse<{
        meeting: MeetingDetails["meeting"];
      }>(response);

      await refreshDetails();
      setConnectionMessage("Mötet avslutat och efterbearbetat.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunde inte finalisera mötet";
      setErrorMessage(message);
    } finally {
      setIsFinalizing(false);
    }
  }

  if (!details) {
    return (
      <section className="panel-grid">
        <div className="card">Laddar mötesdata...</div>
      </section>
    );
  }

  return (
    <section className="panel-grid">
      <div className="card wide">
        <div className="row-between">
          <div>
            <p className="eyebrow">Mötesrum</p>
            <h1>{details.meeting.title}</h1>
            <p className="helper">
              Status: {details.meeting.status} • Start: {new Date(details.meeting.startedAt).toLocaleString("sv-SE")}
            </p>
          </div>
          <Link className="button subtle" href="/">
            Till översikt
          </Link>
        </div>

        <p className="status-pill">{connectionMessage}</p>

        <div className="row wrap">
          <button className="button accent" type="button" onClick={() => void startRecording()} disabled={isRecording || meetingStatus !== "live"}>
            {isRecording ? "Inspelning aktiv" : "Starta mikrofon"}
          </button>

          <button className="button" type="button" onClick={stopRecording} disabled={!isRecording}>
            Stoppa mikrofon
          </button>

          <button className="button danger" type="button" onClick={() => void finalizeMeeting()} disabled={!canFinalize}>
            {isFinalizing ? "Efterbearbetar..." : "Finalisera möte"}
          </button>
        </div>

        <div className="stack">
          <label className="label" htmlFor="speaker-hint">
            Valfri talarhint för inkommande segment
          </label>
          <select
            id="speaker-hint"
            className="input"
            value={speakerHintId}
            onChange={(event) => setSpeakerHintId(event.target.value)}
          >
            <option value="">Ingen hint (automatisk mappning)</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
        </div>

        <form className="stack" onSubmit={(event) => void submitManualSegment(event)}>
          <label className="label" htmlFor="manual-text">
            Manuell textinmatning (fallback)
          </label>
          <textarea
            id="manual-text"
            className="textarea"
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="Skriv ett segment om du vill testa utan mikrofon-STT"
            rows={3}
            required
          />
          <button className="button" type="submit" disabled={meetingStatus !== "live"}>
            Skicka segment
          </button>
        </form>

        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </div>

      <div className="card wide transcript-card">
        <h2>Live-transkript</h2>
        <ul className="transcript-list">
          {segments.length === 0 ? <li className="helper">Inga segment ännu.</li> : null}
          {segments.map((segment) => (
            <li key={segment.id} className="segment-row">
              <div className="segment-head">
                <strong>{segment.speakerLabel}</strong>
                <span>{formatSecond(segment.timestampMs)}</span>
                <span className={segment.confidence < 0.5 ? "badge warn" : "badge"}>conf {segment.confidence.toFixed(2)}</span>
              </div>
              <p>{segment.text}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="card wide">
        <h2>Mötesartefakter</h2>
        {details.artifacts ? (
          <div className="stack">
            <article>
              <h3>Sammanfattning</h3>
              <pre className="preformatted">{details.artifacts.summary}</pre>
            </article>

            <article>
              <h3>Protokollutkast</h3>
              <pre className="preformatted">{details.artifacts.protocolDraft}</pre>
            </article>

            {details.meeting.docUrl ? (
              <p>
                <a className="inline-link" href={details.meeting.docUrl} target="_blank" rel="noreferrer">
                  Öppna sparat dokument
                </a>
              </p>
            ) : (
              <p className="helper">Dokumentlänk kommer efter export.</p>
            )}
          </div>
        ) : (
          <p className="helper">Finalisera mötet för att skapa sammanfattning och protokoll.</p>
        )}
      </div>
    </section>
  );
}
