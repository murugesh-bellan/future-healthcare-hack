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
  /** Total decoded recording length, including silence. */
  durationSeconds: number;
  /** Sum of frames classified as voiced (rms above threshold and a pitch estimate found) — excludes pauses/silence. */
  voicedSegmentDurationSeconds: number;
  speechRateWpm: number | null;
  /** Harmonics-to-noise ratio, dB (Boersma method: 10*log10(r/(1-r)) from mean voiced-frame autocorrelation). Lower = breathier/rougher. */
  hnrDb: number | null;
  /** Ratio of 50-1000 Hz to 1000-5000 Hz spectral energy, dB. A resonance/vocal-tract-quality measure. */
  alphaRatioDb: number | null;
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

/**
 * Normalized-autocorrelation pitch estimate. Returns null for unvoiced/silent/noisy frames.
 *
 * A pure tone correlates almost as strongly at 2x/3x its true period as at the
 * true period itself (harmonically related lags), so picking the single
 * global-max lag flips unpredictably between the fundamental and its
 * subharmonics from frame to frame ("octave errors"). Instead, take the
 * *shortest* lag whose correlation is within 90% of the global best — the
 * true fundamental is always the shortest strong peak.
 *
 * Also returns the peak correlation strength alongside the frequency — the
 * same value the pitch decision was based on, and (via `frameCorrelation`
 * below) the raw material for HNR, so the expensive autocorrelation loop
 * only runs once per frame instead of twice.
 */
export function estimatePitch(frame: Float32Array, sampleRate: number): { hz: number; correlation: number } | null {
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
      return { hz: sampleRate / (minLag + i), correlation: correlations[i] };
    }
  }
  return null;
}

/** In-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Ratio of 50-1000 Hz to 1000-5000 Hz energy, in dB, for one voiced frame. */
function frameAlphaRatioDb(frame: Float32Array, sampleRate: number): number | null {
  const size = 1 << Math.ceil(Math.log2(frame.length));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < frame.length; i++) {
    // Hann window to limit spectral leakage.
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frame.length - 1)));
    re[i] = frame[i] * w;
  }
  fft(re, im);

  const binHz = sampleRate / size;
  let lowTotal = 0;
  let highTotal = 0;
  for (let bin = 1; bin < size / 2; bin++) {
    const hz = bin * binHz;
    const power = re[bin] * re[bin] + im[bin] * im[bin];
    if (hz >= 50 && hz < 1000) lowTotal += power;
    else if (hz >= 1000 && hz <= 5000) highTotal += power;
  }
  if (lowTotal <= 0 || highTotal <= 0) return null;
  return 10 * Math.log10(lowTotal / highTotal);
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
  const voicedCorrelations: number[] = [];
  const alphaRatiosDb: number[] = [];

  for (let start = 0; start + FRAME_SIZE <= analysis.length; start += HOP_SIZE) {
    const frame = analysis.subarray(start, start + FRAME_SIZE);
    const rms = computeRms(frame);
    frameRms.push(rms);

    if (rms < SILENCE_RMS_THRESHOLD) continue;
    const pitch = estimatePitch(frame, analysisRate);
    if (pitch !== null) {
      voicedPitchesHz.push(pitch.hz);
      voicedAmplitudes.push(rms);
      voicedCorrelations.push(pitch.correlation);
      const alpha = frameAlphaRatioDb(frame, analysisRate);
      if (alpha !== null) alphaRatiosDb.push(alpha);
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
  // Each voiced frame contributes one non-overlapping HOP_SIZE-wide slice of audio.
  const voicedSegmentDurationSeconds = (voicedPitchesHz.length * HOP_SIZE) / analysisRate;

  // HNR from the mean peak autocorrelation across voiced frames (Boersma method).
  let hnrDb: number | null = null;
  if (voicedCorrelations.length > 0) {
    const rMean = mean(voicedCorrelations);
    const rClamped = Math.min(Math.max(rMean, 1e-6), 0.999999);
    hnrDb = 10 * Math.log10(rClamped / (1 - rClamped));
  }
  const alphaRatioDb = alphaRatiosDb.length > 0 ? mean(alphaRatiosDb) : null;

  return {
    meanPitchHz,
    pitchStdHz,
    jitterPercent,
    shimmerPercent,
    meanEnergyRms,
    pauseRatio,
    durationSeconds,
    voicedSegmentDurationSeconds,
    speechRateWpm: null,
    hnrDb,
    alphaRatioDb,
  };
}

export function withSpeechRate(signals: VoiceSignals, transcript: string): VoiceSignals {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  const minutes = signals.durationSeconds / 60;
  const speechRateWpm = minutes > 0 ? Math.round(wordCount / minutes) : null;
  return { ...signals, speechRateWpm };
}
