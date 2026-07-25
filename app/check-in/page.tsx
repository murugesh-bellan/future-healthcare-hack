"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEveAgent } from "eve/react";
import { TopBar } from "@/components/TopBar";
import { analyzeVoiceSignals, withSpeechRate, type VoiceSignals } from "@/lib/voice-signals";

type Phase = "loading" | "consent" | "ready" | "recording" | "processing" | "success" | "error";

const DEFAULT_REPLY = "Logged. Thanks for checking in.";
const MAX_RECORDING_MS = 20_000;
const SIGNALS_TIMEOUT_MS = 1500;

/**
 * Caps how long we'll wait on `promise` before falling back — timer starts
 * immediately (not when this is awaited), so if the caller does other async
 * work first, that time already counts against the budget.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timeout]);
}

/** Calm, non-clinical labels for the post-check-in "what we heard" summary. */
function formatSignalSummary(signals: VoiceSignals): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (signals.meanPitchHz !== null) {
    rows.push({ label: "Pitch", value: `${Math.round(signals.meanPitchHz)} Hz` });
  }
  if (signals.pauseRatio !== null && Number.isFinite(signals.pauseRatio)) {
    rows.push({ label: "Pause ratio", value: `${Math.round(signals.pauseRatio * 100)}%` });
  }
  if (signals.speechRateWpm !== null) {
    rows.push({ label: "Speech rate", value: `${signals.speechRateWpm} wpm` });
  }
  if (signals.jitterPercent !== null) {
    rows.push({ label: "Jitter", value: `${signals.jitterPercent.toFixed(1)}%` });
  }
  if (signals.shimmerPercent !== null) {
    rows.push({ label: "Shimmer", value: `${signals.shimmerPercent.toFixed(1)}%` });
  }
  if (signals.durationSeconds > 0) {
    rows.push({ label: "Duration", value: `${signals.durationSeconds.toFixed(1)}s` });
  }
  return rows;
}

export default function CheckInPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [statusText, setStatusText] = useState("Tap to speak");
  const [replyText, setReplyText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [barHeights, setBarHeights] = useState([16, 32, 48, 24, 40]);
  const [heardSignals, setHeardSignals] = useState<VoiceSignals | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Keep latest signals for onFinish without re-binding the agent each turn.
  const pendingSignalsRef = useRef<VoiceSignals | null>(null);

  const agent = useEveAgent({
    onFinish: (snapshot) => {
      const lastAssistant = [...snapshot.data.messages].reverse().find((m) => m.role === "assistant");
      const text =
        lastAssistant?.parts
          .filter((part) => part.type === "text")
          .map((part) => ("text" in part ? part.text : ""))
          .join(" ")
          .trim() ?? "";
      setHeardSignals(pendingSignalsRef.current);
      void handleAgentReply(text || DEFAULT_REPLY);
    },
    onError: (err) => {
      setErrorText(err.message);
      setPhase("error");
    },
  });

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

      // Decode + analyze runs concurrently with the transcribe network call —
      // acoustic analysis is best-effort and must never add to the wait, so
      // it's capped at SIGNALS_TIMEOUT_MS starting from right now (not from
      // whenever we get around to awaiting it below).
      const signalsPromise = withTimeout(analyzeAudioBlob(blob), SIGNALS_TIMEOUT_MS, null);

      const formData = new FormData();
      formData.append("audio", blob, "check-in.webm");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Transcription failed.");
      if (!body.text?.trim()) throw new Error("Didn't catch that — try again.");

      const signals = await signalsPromise;
      const voiceSignals = signals ? withSpeechRate(signals, body.text) : null;
      pendingSignalsRef.current = voiceSignals;

      await agent.send({
        message: body.text,
        ...(voiceSignals
          ? { clientContext: { voice_signals: { ...voiceSignals } as Record<string, number | null> } }
          : {}),
      });
    } catch (err) {
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
    setReplyText(text);
    setPhase("success");
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok && audioRef.current) {
        const audioBlob = await res.blob();
        audioRef.current.src = URL.createObjectURL(audioBlob);
        void audioRef.current.play();
      }
    } catch {
      // Voice playback is best-effort — the written reply is already shown.
    }
  }

  function resetFlow() {
    setPhase("ready");
    setStatusText("Tap to speak");
    setReplyText("");
    setHeardSignals(null);
    pendingSignalsRef.current = null;
  }

  const signalRows = heardSignals ? formatSignalSummary(heardSignals) : [];

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

        {phase === "ready" || phase === "recording" || phase === "processing" ? (
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

                {signalRows.length > 0 ? (
                  <div className="w-full space-y-2 rounded-md bg-surface-container-low/80 p-3">
                    <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">What we heard</p>
                    <p className="text-label-sm text-on-surface-variant/80">
                      Illustrative acoustic signals for your wellness trend — not a medical reading.
                    </p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1">
                      {signalRows.map((row) => (
                        <div key={row.label} className="flex flex-col">
                          <dt className="text-label-sm text-on-surface-variant">{row.label}</dt>
                          <dd className="text-body-md text-on-surface">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                <div className="mt-2 flex w-full flex-col gap-2">
                  <Link
                    href="/"
                    className="rounded-full bg-primary px-6 py-3 text-center text-label-md font-semibold text-on-primary transition-transform active:scale-95"
                  >
                    See Strength Score
                  </Link>
                  <Link
                    href="/trends"
                    className="rounded-full bg-secondary-container px-6 py-3 text-center text-label-md text-on-secondary-container transition-transform active:scale-95"
                  >
                    View trends
                  </Link>
                  <button onClick={resetFlow} className="py-2 text-label-md text-on-surface-variant">
                    Check in again
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <audio ref={audioRef} className="hidden" />
      </main>
    </>
  );
}
