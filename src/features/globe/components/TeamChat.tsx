"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { askTeam } from "../ask-client";
import { splitVoice, SUGGESTED_QUESTIONS } from "../ask-questions";
import { askByVoice } from "../voice-client";
import { createSpeaker, MAX_RECORD_SECONDS, speakAnswer, startRecording, voiceSupported, type Recording } from "../voice";

interface Turn {
  question: string;
  answer: string;
  state: "streaming" | "done" | "error";
  /** Asked by voice: the question is the transcript, and the answer is read aloud when it is complete. */
  voice?: boolean;
}

/** Examples in the other two languages, so people see they can ask in them. */
const OTHER_LANGUAGE_EXAMPLES = ["बांकुरा में कौन-कौन काम करता है?", "কোন জেলায় সবচেয়ে কম লোক কাজ করে?"];


/** **bold** inside a line, rendered as React (no HTML is ever injected). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** A small, safe subset of markdown: paragraphs, "- " bullets, "1. " numbered lines, **bold**. */
function Answer({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-6 text-ink">
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
        const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-muted" />
              <span>{inline(bullet[1])}</span>
            </p>
          );
        }
        if (numbered) {
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-ink-muted">{numbered[1]}.</span>
              <span>{inline(numbered[2])}</span>
            </p>
          );
        }
        return line.trim() ? <p key={i}>{inline(line)}</p> : <div key={i} className="h-1" />;
      })}
    </div>
  );
}

/**
 * Ask about the sales team: click a suggested question or type one, and the answer appears line by line. Answers come
 * only from the area-mapping sheet (with Google Gemini when the server has an AI key, from a built-in engine otherwise).
 */
export function TeamChat({ aiEnabled }: { aiEnabled: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const controller = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState<{ rec: Recording; seconds: number } | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [micError, setMicError] = useState("");
  // This component renders only in the browser (the globe is loaded with ssr: false), so this can be read once.
  const [canVoice] = useState(() => aiEnabled && voiceSupported());
  const finishRef = useRef<() => void>(() => {});
  const speech = useRef<{ stop(): void } | null>(null);
  const busy = turns.at(-1)?.state === "streaming";

  useEffect(
    () => () => {
      controller.current?.abort();
      speech.current?.stop();
    },
    [],
  );

  const stopSpeaking = () => {
    speech.current?.stop();
    speech.current = null;
    setSpeaking(null);
  };
  const say = (index: number, text: string) => {
    stopSpeaking();
    setSpeaking(index);
    speech.current = speakAnswer(text, (on) => {
      if (!on) setSpeaking((current) => (current === index ? null : current));
    });
  };

  // Recording: count the seconds, and stop by itself at the limit.
  const recordingRec = recording?.rec ?? null;
  useEffect(() => {
    if (!recordingRec) return;
    const tick = setInterval(() => setRecording((r) => (r ? { ...r, seconds: r.seconds + 1 } : r)), 1000);
    const limit = setTimeout(() => finishRef.current(), MAX_RECORD_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(limit);
    };
  }, [recordingRec]);

  const startMic = async () => {
    if (busy || recording) return;
    setMicError("");
    stopSpeaking();
    try {
      setRecording({ rec: await startRecording(), seconds: 0 });
    } catch {
      setMicError("The microphone could not be used. Allow microphone access for this site and try again.");
    }
  };

  async function finishRecording() {
    const current = recording;
    if (!current) return;
    setRecording(null);
    const audio = await current.rec.stop();
    if (!audio) {
      setMicError("Nothing was heard. Hold the phone or laptop closer and try again.");
      return;
    }
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    const index = turns.length;
    let raw = "";
    setTurns((t) => [...t, { question: "…", answer: "", state: "streaming", voice: true }]);
    // Speak while the answer is still arriving: the first sentence starts as soon as it is complete.
    stopSpeaking();
    setSpeaking(index);
    const speaker = createSpeaker((on) => {
      if (!on) setSpeaking((current) => (current === index ? null : current));
    });
    speech.current = speaker;
    const update = (fn: (turn: Turn) => Turn) => setTurns((t) => [...t.slice(0, -1), fn(t[t.length - 1])]);
    askByVoice(
      audio,
      (text) => {
        raw += text;
        const parts = splitVoice(raw);
        speaker.update(parts.answer, false);
        update((turn) => ({ ...turn, question: parts.question || turn.question, answer: parts.answer }));
      },
      ctl.signal,
    ).then(
      () => {
        const { answer } = splitVoice(raw);
        update((turn) => ({ ...turn, state: "done" }));
        speaker.update(answer, true);
      },
      (error: unknown) => {
        speaker.stop();
        if (ctl.signal.aborted) return;
        update((turn) => ({ ...turn, state: "error", answer: error instanceof Error ? error.message : "The assistant could not hear the question." }));
      },
    );
  }
  useEffect(() => {
    const list = endRef.current?.parentElement;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns]);

  useEffect(() => {
    finishRef.current = () => void finishRecording();
  });

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || busy || recording) return;
    stopSpeaking();
    setDraft("");
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setTurns((t) => [...t, { question: q, answer: "", state: "streaming" }]);
    const update = (fn: (turn: Turn) => Turn) => setTurns((t) => [...t.slice(0, -1), fn(t[t.length - 1])]);
    askTeam(q, (text) => update((turn) => ({ ...turn, answer: turn.answer + text })), ctl.signal).then(
      () => update((turn) => ({ ...turn, state: "done" })),
      (error: unknown) => {
        if (ctl.signal.aborted) return;
        update((turn) => ({ ...turn, state: "error", answer: error instanceof Error ? error.message : "The assistant could not answer." }));
      },
    );
  };

  return (
    <section aria-labelledby="team-chat-title" className="mt-4 rounded-card bg-surface p-4 shadow-card" data-testid="team-chat">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="team-chat-title" className="text-base font-semibold text-ink">
            Ask about your sales team
          </h2>
          <p className="text-xs text-ink-muted">
            {canVoice ? "Type or speak in English, हिन्दी or বাংলা — " : aiEnabled ? "Ask in English, हिन्दी or বাংলা — " : ""}answers come only from the area-mapping sheet.
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", aiEnabled ? "bg-primary-soft text-primary-ink" : "bg-surface-muted text-ink-muted")} data-testid="team-chat-mode">
          {aiEnabled ? canVoice ? "AI assistant (Gemini) · voice" : "AI assistant (Gemini)" : "Built-in assistant"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[...SUGGESTED_QUESTIONS, ...(aiEnabled ? OTHER_LANGUAGE_EXAMPLES : [])].map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => ask(q)}
            className="rounded-full bg-white px-3 py-1.5 text-left text-sm text-ink ring-1 ring-line hover:ring-primary disabled:opacity-50"
            data-testid="team-chat-suggestion"
          >
            {q}
          </button>
        ))}
      </div>

      {turns.length ? (
        <div className="mt-3 max-h-[28rem] space-y-4 overflow-y-auto rounded-xl bg-surface-muted p-3" aria-live="polite" data-testid="team-chat-log">
          {turns.map((turn, i) => (
            <div key={i} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-white" data-testid="team-chat-question">
                {turn.voice ? (
                  <span aria-label="Spoken question" className="mr-1.5">
                    🎤
                  </span>
                ) : null}
                {turn.question === "…" ? "Listening…" : turn.question}
              </p>
              <div className={cn("max-w-[95%] rounded-2xl rounded-bl-md bg-white px-3 py-2 ring-1 ring-line", turn.state === "error" && "text-warn-ink")} data-state={turn.state} data-testid="team-chat-answer">
                {turn.answer ? <Answer text={turn.answer} /> : <p className="text-sm text-ink-muted">Thinking…</p>}
                {turn.state === "streaming" && turn.answer ? <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-ink-muted align-middle" /> : null}
                {canVoice && turn.state === "done" && turn.answer ? (
                  <button
                    type="button"
                    onClick={() => (speaking === i ? stopSpeaking() : say(i, turn.answer))}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-soft"
                    data-testid="team-chat-listen"
                  >
                    <span aria-hidden="true">{speaking === i ? "■" : "🔊"}</span>
                    {speaking === i ? "Stop" : "Listen"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="team-chat-input" className="sr-only">
          Your question
        </label>
        <input
          id="team-chat-input"
          value={draft}
          maxLength={300}
          onChange={(event) => setDraft(event.target.value)}
          placeholder='Ask anything, e.g. "Who works in Patrasayer?"'
          className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm text-ink ring-1 ring-line placeholder:text-ink-subtle"
        />
        {canVoice ? (
          <button
            type="button"
            onClick={() => (recording ? void finishRecording() : void startMic())}
            disabled={busy && !recording}
            aria-label={recording ? "Stop recording and ask" : "Ask by voice"}
            title={recording ? "Stop and ask" : "Ask by voice"}
            className={cn(
              "flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:opacity-50",
              recording ? "animate-pulse bg-[#c62828] text-white" : "bg-white text-ink ring-1 ring-line hover:ring-primary",
            )}
            data-testid="team-chat-mic"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="7" y="2.5" width="6" height="10" rx="3" />
              <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
            </svg>
            {recording ? `Stop · ${recording.seconds}s` : null}
          </button>
        ) : null}
        <button type="submit" disabled={busy || !!recording || !draft.trim()} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
          Ask
        </button>
      </form>
      {recording ? <p className="mt-2 text-xs font-medium text-[#c62828]" role="status">Listening… speak your question, then press Stop.</p> : null}
      {micError ? <p className="mt-2 text-xs text-warn-ink" role="alert">{micError}</p> : null}
    </section>
  );
}
