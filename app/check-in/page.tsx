"use client";

import { useEffect, useRef, useState } from "react";
import { useEveAgent } from "eve/react";
import { TopBar } from "@/components/TopBar";
import { analyzeVoiceSignals, withSpeechRate, type VoiceSignals } from "@/lib/voice-signals";
import { CONSTRUCT_DISPLAY_NAMES } from "@/lib/physiological-constructs";

type Phase = "loading" | "consent" | "ready" | "recording" | "processing" | "success" | "error";

interface ConstructSummary {
  name: string;
  value: number;
  formula: string;
  confidence: number;
}

const DEFAULT_REPLY = "Logged. Thanks for checking in.";
const MAX_RECORDING_MS = 20_000;
const SIGNALS_TIMEOUT_MS = 1500;
// A turn can hang server-side (stuck tool call, stalled model call) with no
// error ever reaching the client — without this, "processing" is a dead end.
const AGENT_TURN_TIMEOUT_MS = 25_000;

/**
 * Caps how long we'll wait on `promise` before falling back — timer starts
 * immediately (not when this is awaited), so if the caller does other async
 * work first, that time already counts against the budget.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timeout]);
}

/** Shared with onFinish — pulls the plain-text content out of the latest assistant message. */
function extractAssistantText(messages: readonly { role: string; parts: readonly { type: string; text?: string }[] }[]): string {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  return (
    lastAssistant?.parts
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? (part.text ?? "") : ""))
      .join(" ")
      .trim() ?? ""
  );
}

/**
 * Finds complete sentences (ending in ./!/?) within `text`, so streaming text
 * can be spoken sentence-by-sentence instead of waiting for the whole reply.
 * Returns how much of `text` those sentences consumed, so the caller can
 * track what's already been dispatched to TTS.
 */
function splitCompleteSentences(text: string): { sentences: string[]; consumedLength: number } {
  const sentences: string[] = [];
  let consumedLength = 0;
  const pattern = /[^.!?]*[.!?]+(\s+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (sentence) sentences.push(sentence);
    consumedLength = match.index + match[0].length;
  }
  return { sentences, consumedLength };
}

export default function CheckInPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [statusText, setStatusText] = useState("Tap to speak");
  const [replyText, setReplyText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [barHeights, setBarHeights] = useState([16, 32, 48, 24, 40]);
  const [constructs, setConstructs] = useState<ConstructSummary[] | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const agentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the direct-save request kicked off alongside the agent's turn —
  // awaited in handleAgentReply so we never show "Logged!" for a save that
  // actually failed, regardless of which one finishes first.
  const savePromiseRef = useRef<Promise<{ ok: boolean; error?: string }> | null>(null);
  // How much of the streamed reply has already been dispatched to TTS, so we
  // only speak each sentence once as more text streams in.
  const spokenUpToRef = useRef("");
  // Chains sentence playback so clips play in order, one at a time, instead
  // of overlapping — each enqueue appends onto whatever's already pending.
  const audioQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Identifies the current recording/reply cycle. Captured by enqueueSpeech
  // at call time and checked before every side effect in speakSentence, so a
  // new recording never plays or fetches audio left over from a previous one
  // — resetFlow/startRecording bump this and abort anything still in flight.
  const currentTurnRef = useRef({ id: 0, controller: new AbortController() });

  function clearAgentTimeout() {
    if (agentTimeoutRef.current) {
      clearTimeout(agentTimeoutRef.current);
      agentTimeoutRef.current = null;
    }
  }

  /** Stops whatever's playing/queued/in-flight and starts a fresh turn. */
  function beginNewTurn() {
    currentTurnRef.current.controller.abort();
    currentTurnRef.current = { id: currentTurnRef.current.id + 1, controller: new AbortController() };
    spokenUpToRef.current = "";
    audioQueueRef.current = Promise.resolve();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
  }

  /** Best-effort: a failed sentence never blocks the rest of the queue. */
  async function speakSentence(sentence: string, turn: typeof currentTurnRef.current) {
    if (turn.id !== currentTurnRef.current.id) return;
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: sentence }),
        signal: turn.controller.signal,
      });
      if (turn.id !== currentTurnRef.current.id) return;
      if (!res.ok || !audioRef.current) return;
      const audioBlob = await res.blob();
      if (turn.id !== currentTurnRef.current.id) return;
      const url = URL.createObjectURL(audioBlob);
      const audio = audioRef.current;
      audio.src = url;
      await new Promise<void>((resolve) => {
        const onEnded = () => {
          audio.removeEventListener("ended", onEnded);
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.addEventListener("ended", onEnded);
        void audio.play().catch(onEnded);
      });
    } catch {
      // Voice playback is best-effort (and abort is expected on a new turn) —
      // the written reply is already shown either way.
    }
  }

  /** Queues a sentence to speak after whatever's already playing finishes. */
  function enqueueSpeech(sentence: string) {
    const turn = currentTurnRef.current;
    audioQueueRef.current = audioQueueRef.current.then(() => speakSentence(sentence, turn));
  }

  const agent = useEveAgent({
    onFinish: (snapshot) => {
      clearAgentTimeout();
      const text = extractAssistantText(snapshot.data.messages);
      void handleAgentReply(text || DEFAULT_REPLY);
    },
    onError: (err) => {
      clearAgentTimeout();
      setErrorText(err.message);
      setPhase("error");
    },
  });

  // Belt-and-braces: clear any pending timeout if the page unmounts mid-turn.
  useEffect(() => clearAgentTimeout, []);

  // Live-updating reply text as the model streams it — the whole point is to
  // stop showing a static "Processing…" for the entire turn.
  const liveReplyText = agent.status === "streaming" ? extractAssistantText(agent.data.messages) : "";

  // Speak each sentence as soon as it completes, instead of waiting for the
  // full reply — playback starts while the model is still generating the rest.
  useEffect(() => {
    if (!liveReplyText) return;
    const newPortion = liveReplyText.slice(spokenUpToRef.current.length);
    const { sentences, consumedLength } = splitCompleteSentences(newPortion);
    if (sentences.length === 0) return;
    spokenUpToRef.current = liveReplyText.slice(0, spokenUpToRef.current.length + consumedLength);
    for (const sentence of sentences) enqueueSpeech(sentence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveReplyText]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/consent")
      .then((res) => res.json())
      .then((data: { consented?: boolean }) => {
        if (cancelled) return;
        setPhase(data.consented ? "ready" : "consent");
      })
      .catch(() => {
        if (!cancelled) setPhase("consent");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Animate the waveform only while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const interval = setInterval(() => {
      setBarHeights((prev) => prev.map(() => Math.floor(Math.random() * 40) + 8));
    }, 100);
    return () => clearInterval(interval);
  }, [phase]);

  // Auto-stop after the suggested recording length.
  useEffect(() => {
    if (phase !== "recording") return;
    const autoStop = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
    return () => clearTimeout(autoStop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function acceptConsent() {
    setPhase("loading");
    try {
      await fetch("/api/consent", { method: "POST" });
      setPhase("ready");
    } catch {
      setErrorText("Could not save your consent. Try again.");
      setPhase("error");
    }
  }

  async function startRecording() {
    beginNewTurn();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void processRecording();
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setPhase("recording");
      setStatusText("Listening… tap to finish");
    } catch {
      setErrorText("Microphone access is required for voice check-ins.");
      setPhase("error");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      setPhase("processing");
      setStatusText("Processing...");
    }
  }

  async function processRecording() {
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });

      // Runs concurrently with transcription — acoustic analysis is
      // best-effort and must never add to the wait, so it's capped at
      // SIGNALS_TIMEOUT_MS starting from right now. Its result feeds the
      // save below, not the agent, so it must not delay agent.send either
      // (that was the bug: awaiting this before agent.send could add up to
      // the full timeout to first streamed text, on top of transcription).
      const signalsPromise = withTimeout(analyzeAudioBlob(blob), SIGNALS_TIMEOUT_MS, null);

      const formData = new FormData();
      formData.append("audio", blob, "check-in.webm");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Transcription failed.");
      if (!body.text?.trim()) throw new Error("Didn't catch that — try again.");

      // Same key sent to both the direct save below and the agent's
      // clientContext — a unique constraint on check_ins.idempotency_key
      // means that if the agent also calls save_check_in despite
      // `already_saved` (see agent/instructions.md), that insert hits the
      // constraint instead of creating a second row. Prompt instructions
      // alone can't guarantee that; this can.
      const idempotencyKey = crypto.randomUUID();

      // Save directly (fast, independent DB round trip) instead of routing
      // the write through the agent's tool-calling loop — that loop was the
      // biggest measured chunk of check-in latency (transcript received →
      // model decides to call a tool → tool executes → model resumes →
      // *then* generates a reply). The agent now only has to produce the
      // reply, and never touches persistence for web. This waits on
      // signalsPromise internally so *this* is delayed by slow analysis,
      // never agent.send below.
      savePromiseRef.current = signalsPromise
        .then((signals) => {
          const voiceSignals = signals ? withSpeechRate(signals, body.text) : null;
          return fetch("/api/check-in", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: body.text,
              idempotencyKey,
              ...(voiceSignals ? { voiceSignals } : {}),
            }),
          });
        })
        .then(async (res) => {
          if (res.ok) return { ok: true as const };
          const errBody = await res.json().catch(() => ({}));
          return { ok: false as const, error: errBody.error ?? "Could not save your check-in." };
        })
        .catch(() => ({ ok: false as const, error: "Could not save your check-in." }));

      // `agent.send` resolving only means the turn started, not that it
      // finished — `onFinish` is the real completion signal. Guard against a
      // turn that hangs server-side (stuck tool call, stalled model call)
      // with no error ever reaching the client.
      clearAgentTimeout();
      agentTimeoutRef.current = setTimeout(() => {
        agent.stop();
        setErrorText("That's taking longer than expected. Please try again.");
        setPhase("error");
      }, AGENT_TURN_TIMEOUT_MS);

      // Fires immediately after transcription — doesn't wait on signal
      // analysis or the save above, both of which run independently.
      // `already_saved` tells the model not to call `save_check_in` itself;
      // `idempotency_key` is the real backstop if it does anyway.
      await agent.send({
        message: body.text,
        clientContext: { already_saved: true, idempotency_key: idempotencyKey },
      });
    } catch (err) {
      clearAgentTimeout();
      setErrorText(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    }
  }

  /** Best-effort: a failed decode/analysis must never block the check-in. */
  async function analyzeAudioBlob(blob: Blob): Promise<VoiceSignals | null> {
    let audioContext: AudioContext | null = null;
    try {
      const AudioContextClass =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioContextClass();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const samples = audioBuffer.getChannelData(0);
      return analyzeVoiceSignals(samples, audioBuffer.sampleRate);
    } catch {
      return null;
    } finally {
      // Always release the context — repeated failed decodes would otherwise
      // leak AudioContext instances and exhaust the browser's audio resources.
      void audioContext?.close();
    }
  }

  async function handleAgentReply(text: string) {
    const saveResult = savePromiseRef.current ? await savePromiseRef.current : { ok: true as const };
    if (!saveResult.ok) {
      setErrorText(saveResult.error ?? "Could not save your check-in. Please try again.");
      setPhase("error");
      return;
    }

    setReplyText(text);
    setPhase("success");
    void loadLatestBreakdown();

    // Speak whatever's left after the sentences already queued during
    // streaming — covers a trailing fragment with no terminal punctuation,
    // or the whole reply if nothing was spoken yet (e.g. onFinish fired
    // before any complete sentence had streamed in).
    const remaining = text.slice(spokenUpToRef.current.length).trim();
    if (remaining) {
      spokenUpToRef.current = text;
      enqueueSpeech(remaining);
    }
  }

  /**
   * Fetches the just-saved check-in's physiological-construct breakdown.
   * Best-effort: the tool that saves a check-in returns a chat reply, not
   * structured data, so this is a separate round trip — if it's slow or
   * fails, the "Logged!" screen still stands on its own.
   */
  async function loadLatestBreakdown() {
    try {
      const res = await fetch("/api/checkins/latest");
      const body = await res.json();
      setConstructs(body.constructs?.length > 0 ? body.constructs : null);
    } catch {
      setConstructs(null);
    }
  }

  function resetFlow() {
    clearAgentTimeout();
    beginNewTurn();
    savePromiseRef.current = null;
    setPhase("ready");
    setStatusText("Tap to speak");
    setReplyText("");
    setConstructs(null);
    setShowBreakdown(false);
  }

  return (
    <>
      <TopBar title="Daily Check-in" onBack="/" />
      <main className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden px-container-margin pt-20 pb-safe">
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 opacity-40 blur-[40px]" />

        {phase === "loading" ? <p className="z-10 text-body-md text-on-surface-variant">Loading…</p> : null}

        {phase === "consent" ? (
          <section className="z-10 flex max-w-md flex-col items-center gap-stack-md rounded-lg border border-white/5 bg-surface-container p-stack-lg text-center shadow-lg">
            <span className="material-symbols-outlined text-[32px] text-primary">shield</span>
            <h2 className="text-headline-md text-on-surface">Before we start</h2>
            <p className="text-body-md text-on-surface-variant">
              Undertone logs your check-ins to track wellness trends over time. It doesn&apos;t diagnose or replace
              your care team. Do you agree to start tracking?
            </p>
            <button
              onClick={acceptConsent}
              className="w-full rounded-full bg-primary px-6 py-3 text-label-md font-semibold text-on-primary transition-transform active:scale-95"
            >
              I agree, start tracking
            </button>
          </section>
        ) : null}

        {phase === "error" ? (
          <section className="z-10 flex max-w-md flex-col items-center gap-stack-sm text-center">
            <span className="material-symbols-outlined text-[32px] text-error">error</span>
            <p className="text-body-md text-on-surface">{errorText}</p>
            <button onClick={resetFlow} className="text-label-md text-primary">
              Try again
            </button>
          </section>
        ) : null}

        {(phase === "ready" || phase === "recording" || phase === "processing") && !liveReplyText ? (
          <section className="z-10 flex flex-col items-center gap-stack-lg text-center">
            <div className="relative flex h-48 w-48 items-center justify-center">
              {phase !== "recording" ? (
                <div className="absolute h-32 w-32 rounded-full bg-primary/20">
                  <div className="h-24 w-24 rounded-full bg-primary/40 blur-md" />
                </div>
              ) : (
                <div className="flex h-12 items-end gap-1">
                  {barHeights.map((h, i) => (
                    <div key={i} className="w-1 rounded-full bg-primary transition-[height] duration-100" style={{ height: `${h}px` }} />
                  ))}
                </div>
              )}
            </div>
            <div className="max-w-md space-y-stack-sm">
              <h2 className="text-headline-xl-mobile leading-tight text-on-background">How&apos;s your energy today?</h2>
              <p className="px-8 text-body-md text-on-surface-variant">
                I&apos;m listening. Tell me how you&apos;re feeling, what you ate, or any symptoms.
              </p>
            </div>

            <div className="flex flex-col items-center gap-4">
              <button
                onClick={phase === "recording" ? stopRecording : startRecording}
                disabled={phase === "processing"}
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_0_40px_rgba(184,218,215,0.4)] transition-transform active:scale-90 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-4xl">{phase === "recording" ? "stop" : "mic"}</span>
                {phase === "recording" ? <span className="absolute inset-0 animate-ping rounded-full bg-primary/50" /> : null}
              </button>
              <p className="text-label-md tracking-wide text-on-surface-variant">{statusText}</p>
            </div>
          </section>
        ) : null}

        {phase === "processing" && liveReplyText ? (
          <section className="z-10 flex w-full max-w-md flex-col items-center">
            <div className="relative w-full overflow-hidden rounded-lg border border-white/5 bg-surface-container p-stack-lg shadow-lg">
              <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
              <div className="flex flex-col items-start gap-stack-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                  <span className="material-symbols-outlined animate-pulse">graphic_eq</span>
                </div>
                <p className="leading-relaxed text-body-md text-on-surface">{liveReplyText}</p>
              </div>
            </div>
          </section>
        ) : null}

        {phase === "success" ? (
          <section className="z-10 flex w-full max-w-md flex-col items-center">
            <div className="relative w-full overflow-hidden rounded-lg border border-white/5 bg-surface-container p-stack-lg shadow-lg">
              <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
              <div className="flex flex-col items-start gap-stack-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                  <span className="material-symbols-outlined">check_circle</span>
                </div>
                <div className="space-y-stack-sm text-left">
                  <h3 className="text-headline-md text-primary">Logged!</h3>
                  <p className="leading-relaxed text-body-md text-on-surface">{replyText}</p>
                </div>

                {constructs && constructs.length > 0 ? (
                  <div className="w-full">
                    <button
                      onClick={() => setShowBreakdown((v) => !v)}
                      className="flex w-full items-center justify-between rounded-md bg-surface-container-low/80 px-3 py-2 text-label-sm text-on-surface-variant transition-colors active:bg-surface-container-low"
                    >
                      <span>See what we&apos;re assessing</span>
                      <span className="material-symbols-outlined text-[18px]">
                        {showBreakdown ? "expand_less" : "expand_more"}
                      </span>
                    </button>
                    {showBreakdown ? (
                      <div className="mt-2 space-y-3 rounded-md bg-surface-container-low/80 p-3">
                        <p className="text-label-sm text-on-surface-variant/80">
                          Illustrative acoustic signals for your wellness trend — not a medical reading.
                        </p>
                        {constructs.map((c) => (
                          <div key={c.name} className="border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                            <div className="flex items-center justify-between">
                              <span className="text-body-md text-on-surface">
                                {CONSTRUCT_DISPLAY_NAMES[c.name] ?? c.name}
                              </span>
                              <span className="text-label-md font-semibold text-primary">{c.value}/100</span>
                            </div>
                            <p className="mt-0.5 text-label-sm text-on-surface-variant/80">{c.formula}</p>
                            {c.confidence < 1 ? (
                              <p className="mt-0.5 text-label-sm text-on-surface-variant/60">
                                Based on partial data for this recording.
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  onClick={resetFlow}
                  className="mt-4 rounded-full bg-secondary-container px-6 py-3 text-label-md text-on-secondary-container transition-transform active:scale-95"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <audio ref={audioRef} className="hidden" />
      </main>
    </>
  );
}
