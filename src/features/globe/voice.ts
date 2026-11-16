/**
 * Browser-only voice helpers for the team assistant: record a question from this site's microphone as a 16 kHz mono
 * WAV, and play spoken answers one part after another. The only module that touches the microphone or plays audio.
 */

import { fetchSpeech } from "./speak-client";

const RATE = 16_000;
export const MAX_RECORD_SECONDS = 45;

export interface Recording {
  /** Stops recording and returns the question as base64 WAV (null if nothing usable was recorded). */
  stop(): Promise<string | null>;
  /** Stops and throws the recording away. */
  cancel(): void;
}

export const voiceSupported = () =>
  typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  const parts: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) parts.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start();
  const release = () => stream.getTracks().forEach((track) => track.stop());
  return {
    async stop() {
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      release();
      const blob = new Blob(parts, { type: recorder.mimeType });
      if (blob.size < 1000) return null;
      return toWavBase64(await blob.arrayBuffer());
    },
    cancel() {
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}

/** Decodes whatever the browser recorded (webm, mp4 …), mixes to mono at 16 kHz, and writes a 16-bit WAV, base64. */
async function toWavBase64(data: ArrayBuffer): Promise<string | null> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(data);
  } catch {
    return null;
  } finally {
    void context.close();
  }
  const seconds = Math.min(decoded.duration, MAX_RECORD_SECONDS);
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * RATE)), RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Splits an answer into short spoken parts. The first part is the first sentence alone, so speech can start as soon as
 * possible; later parts group a sentence or two.
 */
export function speechParts(answer: string): string[] {
  const plain = answer
    .replace(/\*\*/g, "")
    .replace(/^\s*[-•*]\s+/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const sentences = plain.flatMap((line) => line.match(/[^.!?।]+[.!?।]+["')]*|[^.!?।]+$/g) ?? [line]).map((s) => s.trim()).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const limit = parts.length === 0 ? 0 : 240;
    if (current && (current + " " + sentence).length > limit) {
      parts.push(current);
      current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) parts.push(current);
  return parts.map((p) => p.slice(0, 1200));
}

export interface Speaker {
  /** The answer so far; `done` once it is complete. Parts are spoken as soon as they are complete. */
  update(text: string, done: boolean): void;
  stop(): void;
}

/**
 * Speaks an answer while it is still arriving: each complete part is turned into audio and played in order, the next
 * part being prepared while one plays. `onState(false)` is called when it has finished or was stopped.
 */
export function createSpeaker(onState: (speaking: boolean) => void): Speaker {
  const controller = new AbortController();
  const audio = new Audio();
  let stopped = false;
  let text = "";
  let done = false;
  let wake: (() => void) | null = null;
  const fetches = new Map<number, Promise<Blob | null>>();
  // A part is ready when a later part has started (it can no longer grow), or when the answer is complete.
  const ready = () => {
    const parts = speechParts(text);
    const settled = done ? parts : parts.slice(0, -1);
    return { parts, count: settled.length };
  };
  const get = (i: number, parts: string[]) => {
    if (!fetches.has(i)) fetches.set(i, fetchSpeech(parts[i], controller.signal).catch(() => null));
    return fetches.get(i)!;
  };
  const playBlob = (blob: Blob) =>
    new Promise<void>((resolve) => {
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.onended = audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.play().catch(() => resolve());
    });
  void (async () => {
    onState(true);
    for (let i = 0; !stopped; i++) {
      let state = ready();
      while (!stopped && i >= state.count && !(done && i >= state.parts.length)) {
        await new Promise<void>((resolve) => (wake = resolve));
        state = ready();
      }
      if (stopped || i >= state.count) break;
      const blob = await get(i, state.parts);
      if (i + 1 < state.count) void get(i + 1, state.parts); // prepare the next part while this one plays
      if (!stopped && blob) await playBlob(blob);
    }
    if (!stopped) onState(false);
  })();
  return {
    update(next, isDone) {
      text = next;
      done = isDone;
      wake?.();
    },
    stop() {
      stopped = true;
      controller.abort();
      audio.pause();
      wake?.();
      onState(false);
    },
  };
}

/** Speaks a complete answer. */
export function speakAnswer(answer: string, onState: (speaking: boolean) => void): { stop(): void } {
  const speaker = createSpeaker(onState);
  speaker.update(answer, true);
  return speaker;
}
