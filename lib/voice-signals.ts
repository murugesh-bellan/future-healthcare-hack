// Lightweight acoustic feature extraction, run client-side against decoded
// PCM from the browser's Web Audio API. Deliberately dependency-free and kept
// cheap (downsampled, short frames, restricted pitch search range) so it can
// run alongside the transcribe network call instead of blocking it — this
// product's whole point right now is not adding latency to the check-in loop.
//
// These are illustrative acoustic signals, not clinically validated
// biomarkers (same caveat as the "Strength Score" elsewhere in this app).
// Some features (energyNormalized calibration, alphaRatioDb band split,
// signalQuality thresholds) are hand-picked approximations, not derived from
// a reference dataset — see inline notes at each constant.

export type SignalQuality = "high" | "medium" | "low";

export interface VoiceSignals {
  meanPitchHz: number | null;
  pitchStdHz: number | null;
  /** Coefficient of variation of pitch (pitchStdHz / meanPitchHz) — unitless, ~0.05-0.2 typical. */
  f0Cv: number | null;
  jitterPercent: number | null;
  shimmerPercent: number | null;
  /** Zero-crossing rate, fraction of adjacent sample pairs that change sign — 0-1, ~0.02-0.15 for voiced speech. */
  zcr: number;
  /** Harmonics-to-noise ratio in dB, from the pitch autocorrelation peak — null when no voiced frames found. */
  hnrDb: number | null;
  /** Spectral tilt: ratio of energy above ~1kHz to below it, in dB (negative — voice energy concentrates low). */
  alphaRatioDb: number;
  meanEnergyRms: number;
  /** meanEnergyRms rescaled to a 0-1 "vocal energy" fraction via a fixed reference level (illustrative calibration). */
  energyNormalized: number;
  pauseRatio: number;
  /** Fraction of frames classified voiced (rms above threshold and a pitch estimate found) — 0-1. */
  voicedRatio: number;
  /** Total decoded recording length, including silence. */
  durationSeconds: number;
  /** Sum of frames classified as voiced — excludes pauses/silence. */
  voicedSegmentDurationSeconds: number;
  speechRateWpm: number | null;
  /** Syllables per second, estimated via vowel-group counting on the transcript. */
  speechRateSyllPerSec: number | null;
  /** Heuristic capture-quality label from voicedRatio + hnrDb, used as a per-check-in confidence proxy. */
  signalQuality: SignalQuality;
}

const ANALYSIS_SAMPLE_RATE = 16000;
const FRAME_SIZE = 1024; // 64ms at 16kHz
const HOP_SIZE = 512; // 32ms — 50% overlap
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;
const VOICED_CORRELATION_THRESHOLD = 0.35;
const SILENCE_RMS_THRESHOLD = 0.015;
// Reference RMS mapped to a mid-scale (~0.55) "vocal energy" fraction — chosen so typical
// conversational speech (RMS ~0.02-0.06 on normalized float PCM) lands near the formula's
// expected center; not derived from a reference dataset.
const ENERGY_REFERENCE_RMS = 0.08;
// One-pole low-pass cutoff separating "low" from "high" band for the spectral-tilt (alpha ratio) estimate.
const ALPHA_SPLIT_HZ = 1000;

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

/** Fraction of adjacent sample pairs whose sign differs. */
export function computeZcr(frame: Float32Array): number {
  if (frame.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) crossings++;
  }
  return crossings / (frame.length - 1);
}

interface Periodicity {
  lagSamples: number;
  correlation: number;
}

/**
 * Core normalized-autocorrelation search: best correlation and its lag over
 * the pitch-range lags. Shared by pitch estimation and HNR (both are derived
 * from the same peak, so this is computed once per frame, not twice).
 *
 * A pure tone correlates almost as strongly at 2x/3x its true period as at the
 * true period itself (harmonically related lags), so picking the single
 * global-max lag flips unpredictably between the fundamental and its
 * subharmonics from frame to frame ("octave errors"). Instead, take the
 * *shortest* lag whose correlation is within 90% of the global best — the
 * true fundamental is always the shortest strong peak.
 */
function bestPeriodicity(frame: Float32Array, sampleRate: number): Periodicity | null {
  const minLag = Math.floor(sampleRate / MAX_PITCH_HZ);
  const maxLag = Math.floor(sampleRate / MIN_PITCH_HZ);
  if (maxLag >= frame.length) return null;

  const correlations: number[] = [];
  let globalBestCorr = 0;
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
    const corr = denom === 0 ? 0 : sum / denom;
    correlations.push(corr);
    if (corr > globalBestCorr) globalBestCorr = corr;
  }

  if (globalBestCorr < VOICED_CORRELATION_THRESHOLD) return null;

  const acceptThreshold = globalBestCorr * 0.9;
  for (let i = 0; i < correlations.length; i++) {
    if (correlations[i] >= acceptThreshold) {
      return { lagSamples: minLag + i, correlation: correlations[i] };
    }
  }
  return null;
}

/** Normalized-autocorrelation pitch estimate. Returns null for unvoiced/silent/noisy frames. */
export function estimatePitchHz(frame: Float32Array, sampleRate: number): number | null {
  const periodicity = bestPeriodicity(frame, sampleRate);
  return periodicity ? sampleRate / periodicity.lagSamples : null;
}

/**
 * Autocorrelation-based harmonics-to-noise ratio in dB (Boersma's formula:
 * HNR = 10·log10(r / (1 − r)), r the normalized-autocorrelation peak).
 * Clamps r away from 1 to avoid a divide-by-zero blowing up to +Infinity.
 */
function correlationToHnrDb(r: number): number {
  const clamped = Math.min(r, 0.999999);
  return 10 * Math.log10(clamped / (1 - clamped));
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

/**
 * Spectral tilt: RMS energy above ALPHA_SPLIT_HZ relative to below it, in dB.
 * Uses a single-pole low-pass filter over the whole buffer (the low band),
 * with the high band taken as the residual (signal minus low band) — a cheap
 * approximation, not a brick-wall filter, consistent with this module's
 * "kept cheap" DSP elsewhere.
 */
function computeAlphaRatioDb(samples: Float32Array, sampleRate: number): number {
  const rc = 1 / (2 * Math.PI * ALPHA_SPLIT_HZ);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);

  let low = 0;
  let lowSumSquares = 0;
  let highSumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    low = low + alpha * (samples[i] - low);
    const high = samples[i] - low;
    lowSumSquares += low * low;
    highSumSquares += high * high;
  }
  const lowRms = Math.sqrt(lowSumSquares / samples.length);
  const highRms = Math.sqrt(highSumSquares / samples.length);
  if (lowRms === 0) return 0;
  return 20 * Math.log10(highRms / lowRms);
}

/** Heuristic capture-quality label — not a measured SNR, just a proxy from what we can estimate cheaply. */
function classifySignalQuality(voicedRatio: number, hnrDb: number | null): SignalQuality {
  if (voicedRatio >= 0.5 && hnrDb !== null && hnrDb >= 15) return "high";
  if (voicedRatio >= 0.25) return "medium";
  return "low";
}

export function analyzeVoiceSignals(samples: Float32Array, sampleRate: number): VoiceSignals {
  const durationSeconds = samples.length / sampleRate;
  const analysis = downsample(samples, sampleRate, ANALYSIS_SAMPLE_RATE);
  const analysisRate = Math.min(sampleRate, ANALYSIS_SAMPLE_RATE);

  const frameRms: number[] = [];
  const frameZcr: number[] = [];
  const voicedPitchesHz: number[] = [];
  const voicedAmplitudes: number[] = [];
  const voicedCorrelations: number[] = [];

  for (let start = 0; start + FRAME_SIZE <= analysis.length; start += HOP_SIZE) {
    const frame = analysis.subarray(start, start + FRAME_SIZE);
    const rms = computeRms(frame);
    frameRms.push(rms);
    frameZcr.push(computeZcr(frame));

    if (rms < SILENCE_RMS_THRESHOLD) continue;
    const periodicity = bestPeriodicity(frame, analysisRate);
    if (periodicity !== null) {
      voicedPitchesHz.push(analysisRate / periodicity.lagSamples);
      voicedAmplitudes.push(rms);
      voicedCorrelations.push(periodicity.correlation);
    }
  }

  const meanPitchHz = voicedPitchesHz.length > 0 ? mean(voicedPitchesHz) : null;
  const pitchStdHz = meanPitchHz !== null ? stdDev(voicedPitchesHz, meanPitchHz) : null;
  const f0Cv = meanPitchHz !== null && pitchStdHz !== null && meanPitchHz !== 0 ? pitchStdHz / meanPitchHz : null;
  // Jitter is conventionally expressed in terms of period (1/f0), not frequency.
  const jitterPercent = relativeVariation(voicedPitchesHz.map((hz) => 1 / hz));
  const shimmerPercent = relativeVariation(voicedAmplitudes);
  const zcr = frameZcr.length > 0 ? mean(frameZcr) : 0;
  const hnrDb = voicedCorrelations.length > 0 ? mean(voicedCorrelations.map(correlationToHnrDb)) : null;
  const alphaRatioDb = computeAlphaRatioDb(analysis, analysisRate);
  const meanEnergyRms = frameRms.length > 0 ? mean(frameRms) : 0;
  const energyNormalized = Math.max(0, Math.min(1, meanEnergyRms / ENERGY_REFERENCE_RMS));
  const silentFrames = frameRms.filter((rms) => rms < SILENCE_RMS_THRESHOLD).length;
  const pauseRatio = frameRms.length > 0 ? silentFrames / frameRms.length : 0;
  const voicedRatio = frameRms.length > 0 ? voicedPitchesHz.length / frameRms.length : 0;
  // Each voiced frame contributes one non-overlapping HOP_SIZE-wide slice of audio.
  const voicedSegmentDurationSeconds = (voicedPitchesHz.length * HOP_SIZE) / analysisRate;

  return {
    meanPitchHz,
    pitchStdHz,
    f0Cv,
    jitterPercent,
    shimmerPercent,
    zcr,
    hnrDb,
    alphaRatioDb,
    meanEnergyRms,
    energyNormalized,
    pauseRatio,
    voicedRatio,
    durationSeconds,
    voicedSegmentDurationSeconds,
    speechRateWpm: null,
    speechRateSyllPerSec: null,
    signalQuality: classifySignalQuality(voicedRatio, hnrDb),
  };
}

/** Crude vowel-group heuristic — not a real syllabifier, but standard for lightweight NLP. Minimum 1 per word. */
function estimateSyllableCount(word: string): number {
  const matches = word.toLowerCase().match(/[aeiouy]+/g);
  return Math.max(1, matches?.length ?? 1);
}

export function withSpeechRate(signals: VoiceSignals, transcript: string): VoiceSignals {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const minutes = signals.durationSeconds / 60;
  const speechRateWpm = minutes > 0 ? Math.round(wordCount / minutes) : null;
  const syllableCount = words.reduce((sum, w) => sum + estimateSyllableCount(w), 0);
  const speechRateSyllPerSec = signals.durationSeconds > 0 ? syllableCount / signals.durationSeconds : null;
  return { ...signals, speechRateWpm, speechRateSyllPerSec };
}
