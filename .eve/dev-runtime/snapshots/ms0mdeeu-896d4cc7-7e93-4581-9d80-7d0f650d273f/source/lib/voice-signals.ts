// Lightweight acoustic feature extraction, run client-side against decoded
// PCM from the browser's Web Audio API. Deliberately dependency-free and kept
// cheap (downsampled, short frames, restricted pitch search range) so it can
// run alongside the transcribe network call instead of blocking it — this
// product's whole point right now is not adding latency to the check-in loop.
//
// These are illustrative acoustic signals, not clinically validated
// biomarkers (same caveat as the "Strength Score" elsewhere in this app).

export interface VoiceSignals {
  meanPitchHz: number | null;
  pitchStdHz: number | null;
  jitterPercent: number | null;
  shimmerPercent: number | null;
  meanEnergyRms: number;
  pauseRatio: number;
  durationSeconds: number;
  speechRateWpm: number | null;
}

const ANALYSIS_SAMPLE_RATE = 16000;
const FRAME_SIZE = 1024; // 64ms at 16kHz
const HOP_SIZE = 512; // 32ms — 50% overlap
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;
const VOICED_CORRELATION_THRESHOLD = 0.35;
const SILENCE_RMS_THRESHOLD = 0.015;

/** Nearest-neighbor decimation — good enough for pitch/energy estimation, not for audio fidelity. */
function downsample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return samples;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    out[i] = samples[Math.floor(i * ratio)];
  }
  return out;
}

export function computeRms(frame: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < frame.length; i++) sumSquares += frame[i] * frame[i];
  return Math.sqrt(sumSquares / frame.length);
}

/** Normalized-autocorrelation pitch estimate. Returns null for unvoiced/silent/noisy frames. */
export function estimatePitchHz(frame: Float32Array, sampleRate: number): number | null {
  const minLag = Math.floor(sampleRate / MAX_PITCH_HZ);
  const maxLag = Math.floor(sampleRate / MIN_PITCH_HZ);
  if (maxLag >= frame.length) return null;

  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let energyA = 0;
    let energyB = 0;
    const limit = frame.length - lag;
    for (let i = 0; i < limit; i++) {
      sum += frame[i] * frame[i + lag];
      energyA += frame[i] * frame[i];
      energyB += frame[i + lag] * frame[i + lag];
    }
    const denom = Math.sqrt(energyA * energyB);
    if (denom === 0) continue;
    const corr = sum / denom;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorr < VOICED_CORRELATION_THRESHOLD) return null;
  return sampleRate / bestLag;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Mean absolute relative change between consecutive values, as a percentage. */
function relativeVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  let total = 0;
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev === 0) continue;
    total += Math.abs(curr - prev) / Math.abs(prev);
    count++;
  }
  return count > 0 ? (total / count) * 100 : null;
}

export function analyzeVoiceSignals(samples: Float32Array, sampleRate: number): VoiceSignals {
  const durationSeconds = samples.length / sampleRate;
  const analysis = downsample(samples, sampleRate, ANALYSIS_SAMPLE_RATE);
  const analysisRate = Math.min(sampleRate, ANALYSIS_SAMPLE_RATE);

  const frameRms: number[] = [];
  const voicedPitchesHz: number[] = [];
  const voicedAmplitudes: number[] = [];

  for (let start = 0; start + FRAME_SIZE <= analysis.length; start += HOP_SIZE) {
    const frame = analysis.subarray(start, start + FRAME_SIZE);
    const rms = computeRms(frame);
    frameRms.push(rms);

    if (rms < SILENCE_RMS_THRESHOLD) continue;
    const pitch = estimatePitchHz(frame, analysisRate);
    if (pitch !== null) {
      voicedPitchesHz.push(pitch);
      voicedAmplitudes.push(rms);
    }
  }

  const meanPitchHz = voicedPitchesHz.length > 0 ? mean(voicedPitchesHz) : null;
  const pitchStdHz = meanPitchHz !== null ? stdDev(voicedPitchesHz, meanPitchHz) : null;
  // Jitter is conventionally expressed in terms of period (1/f0), not frequency.
  const jitterPercent = relativeVariation(voicedPitchesHz.map((hz) => 1 / hz));
  const shimmerPercent = relativeVariation(voicedAmplitudes);
  const meanEnergyRms = frameRms.length > 0 ? mean(frameRms) : 0;
  const silentFrames = frameRms.filter((rms) => rms < SILENCE_RMS_THRESHOLD).length;
  const pauseRatio = frameRms.length > 0 ? silentFrames / frameRms.length : 0;

  return {
    meanPitchHz,
    pitchStdHz,
    jitterPercent,
    shimmerPercent,
    meanEnergyRms,
    pauseRatio,
    durationSeconds,
    speechRateWpm: null,
  };
}

export function withSpeechRate(signals: VoiceSignals, transcript: string): VoiceSignals {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  const minutes = signals.durationSeconds / 60;
  const speechRateWpm = minutes > 0 ? Math.round(wordCount / minutes) : null;
  return { ...signals, speechRateWpm };
}
