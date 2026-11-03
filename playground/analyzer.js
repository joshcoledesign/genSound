// analyzer.js
// genSound's audio analysis (audio_utils.analyze_audio) ported to JavaScript so a
// browser can analyze a visitor's own file without uploading it. Runs as a Web
// Worker in the page, and can also be loaded in Node for parity tests.
//
// Matches the Python version step for step: RMS loudness and strongest-frequency
// per window, librosa's YIN pitch detection (frame 2048, hop 512, centered), the
// median pitch per window, the 40 dB silence rule, and rank normalization.
// One deliberate difference: the strongest frequency is measured every 10 ms and
// each window takes the nearest measurement, instead of one FFT per window, which
// keeps a 250,000-window analysis to seconds.

const C0 = 440 * Math.pow(2, -4.75);
const FMIN = 32.70319566257483;   // librosa.note_to_hz('C1')
const FMAX = 4186.009044809578;   // librosa.note_to_hz('C8')
const TINY = 2.2250738585072014e-308;

// ---------- radix-2 FFT (in place, complex) ----------
function fftPlan(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
  return { n, rev, cos, sin };
}
function fft(plan, re, im, inverse) {
  const { n, rev, cos, sin } = plan;
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step], wi = inverse ? -sin[k * step] : sin[k * step];
        const a = start + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// ---------- DFT of any length N via Bluestein, two real frames per transform ----------
function bluesteinPlan(N) {
  let M = 1; while (M < 2 * N - 1) M <<= 1;
  const plan = fftPlan(M);
  const wr = new Float64Array(N), wi = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const ang = Math.PI * ((n * n) % (2 * N)) / N;  // keep n^2 small for precision
    wr[n] = Math.cos(ang); wi[n] = -Math.sin(ang);
  }
  const br = new Float64Array(M), bi = new Float64Array(M);
  br[0] = wr[0]; bi[0] = -wi[0];
  for (let n = 1; n < N; n++) { br[n] = br[M - n] = wr[n]; bi[n] = bi[M - n] = -wi[n]; }
  fft(plan, br, bi, false);
  return { N, M, plan, wr, wi, br, bi, ar: new Float64Array(M), ai: new Float64Array(M) };
}
// Computes the DFT of x1 + i*x2 (each length N) into outRe/outIm (length N)
function bluestein(bp, x1, x2, outRe, outIm) {
  const { N, M, plan, wr, wi, br, bi, ar, ai } = bp;
  for (let n = 0; n < N; n++) {
    const xr = x1[n], xi = x2 ? x2[n] : 0;
    ar[n] = xr * wr[n] - xi * wi[n]; ai[n] = xr * wi[n] + xi * wr[n];
  }
  ar.fill(0, N); ai.fill(0, N);
  fft(plan, ar, ai, false);
  for (let k = 0; k < M; k++) {
    const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k];
    ar[k] = r; ai[k] = i;
  }
  fft(plan, ar, ai, true);
  for (let k = 0; k < N; k++) {
    outRe[k] = ar[k] * wr[k] - ai[k] * wi[k]; outIm[k] = ar[k] * wi[k] + ai[k] * wr[k];
  }
}

// ---------- librosa.yin, ported from librosa 0.10 (pitch.py) ----------
function yinTrack(y, sr, progress) {
  const frameLength = 2048, winLength = 1024, hop = 512;
  // center=True pads frame_length // 2 zeros on both sides
  const padded = new Float32Array(y.length + frameLength);
  padded.set(y, frameLength / 2);
  const nFrames = 1 + Math.floor((padded.length - frameLength) / hop);
  const minPeriod = Math.floor(sr / FMAX);
  const maxPeriod = Math.min(Math.ceil(sr / FMIN), frameLength - winLength - 1);
  const plan = fftPlan(frameLength);
  const re = new Float64Array(frameLength), im = new Float64Array(frameLength);
  const pr = new Float64Array(frameLength), pi = new Float64Array(frameLength);
  const acf = new Float64Array(winLength), energy = new Float64Array(winLength), cs = new Float64Array(frameLength);
  const d = new Float64Array(winLength), count = maxPeriod - minPeriod + 1;
  const cmndf = new Float64Array(count), out = new Float64Array(nFrames);

  for (let f = 0; f < nFrames; f++) {
    const off = f * hop;
    // Autocorrelation: rfft(frame) * rfft(frame[win_length:0:-1]), both zero-padded
    // to frame_length, packed into one complex FFT and separated afterwards
    for (let j = 0; j < frameLength; j++) { re[j] = padded[off + j]; im[j] = j < winLength ? padded[off + winLength - j] : 0; }
    fft(plan, re, im, false);
    for (let k = 0; k < frameLength; k++) {
      const k2 = (frameLength - k) % frameLength;
      const ar = (re[k] + re[k2]) / 2, ai = (im[k] - im[k2]) / 2;       // A = FFT(frame)
      const br = (im[k] + im[k2]) / 2, bi = (re[k2] - re[k]) / 2;       // B = FFT(reversed)
      pr[k] = ar * br - ai * bi; pi[k] = ar * bi + ai * br;
    }
    fft(plan, pr, pi, true);
    for (let t = 0; t < winLength; t++) { const v = pr[winLength + t]; acf[t] = Math.abs(v) < 1e-6 ? 0 : v; }

    // Energy terms: cumsum(frame^2)[win_length:] - cumsum(frame^2)[:-win_length]
    let sum = 0;
    for (let j = 0; j < frameLength; j++) { const v = padded[off + j]; sum += v * v; cs[j] = sum; }
    for (let t = 0; t < winLength; t++) { const v = cs[winLength + t] - cs[t]; energy[t] = Math.abs(v) < 1e-6 ? 0 : v; }

    // Difference function and its cumulative mean normalization
    for (let t = 0; t < winLength; t++) d[t] = energy[0] + energy[t] - 2 * acf[t];
    let running = 0;
    for (let tau = 1; tau <= maxPeriod; tau++) {
      running += d[tau];
      if (tau >= minPeriod) {
        const den = running / tau;
        cmndf[tau - minPeriod] = d[tau] / (den + TINY);
      }
    }

    // Smallest local minimum below 0.1, otherwise the global minimum
    let pick = -1, globalMin = 0;
    for (let i = 0; i < count; i++) {
      if (cmndf[i] < cmndf[globalMin]) globalMin = i;
      if (pick < 0 && cmndf[i] < 0.1) {
        const trough = i === 0 ? cmndf[0] < cmndf[1]
          : i === count - 1 ? cmndf[i] < cmndf[i - 1]
          : cmndf[i] < cmndf[i - 1] && cmndf[i] <= cmndf[i + 1];
        if (trough) pick = i;
      }
    }
    if (pick < 0) pick = globalMin;

    // Parabolic interpolation (0 at the edges, or when the shift would exceed one bin)
    let shift = 0;
    if (pick > 0 && pick < count - 1) {
      const a = cmndf[pick + 1] + cmndf[pick - 1] - 2 * cmndf[pick];
      const b = (cmndf[pick + 1] - cmndf[pick - 1]) / 2;
      shift = Math.abs(b) >= Math.abs(a) ? 0 : -b / a;
    }
    out[f] = sr / (minPeriod + pick + shift);
    if (progress && f % 2000 === 0) progress(f / nFrames);
  }
  return out;
}

// Python's round() rounds halves to even; match it so note names agree
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function rankNormalize(values, mask) {
  const ids = [];
  for (let i = 0; i < values.length; i++) if (mask[i]) ids.push(i);
  ids.sort((a, b) => values[a] - values[b]);
  const out = new Float32Array(values.length), last = Math.max(ids.length - 1, 1);
  if (ids.length < 2) return out;
  for (let s = 0; s < ids.length;) {
    let e = s; while (e + 1 < ids.length && values[ids[e + 1]] === values[ids[s]]) e++;
    const r = (s + e) / 2 / last;
    for (let k = s; k <= e; k++) out[ids[k]] = r;
    s = e + 1;
  }
  return out;
}

// y: Float32Array mono samples, sr: sample rate, nWindows: windows spread over the track
function analyze(y, sr, nWindows, onProgress) {
  const report = onProgress || (() => {});
  const window = Math.max(1, Math.floor(sr * 100 / 1000));
  const span = Math.max(y.length - window, 0);
  const starts = new Float64Array(nWindows);
  for (let i = 0; i < nWindows; i++) starts[i] = roundHalfEven(nWindows > 1 ? span * i / (nWindows - 1) : 0);
  const padded = new Float32Array(y.length + Math.max(window, 2048));
  padded.set(y);

  // Loudness: RMS of each window, from a running sum of squares
  report('Measuring loudness', 0);
  const sq = new Float64Array(padded.length + 1);
  for (let i = 0; i < padded.length; i++) sq[i + 1] = sq[i] + padded[i] * padded[i];
  const loud = new Float64Array(nWindows);
  for (let i = 0; i < nWindows; i++) loud[i] = Math.sqrt(Math.max(0, sq[starts[i] + window] - sq[starts[i]]) / window);

  // Strongest frequency at or above 20 Hz, measured every 10 ms
  const freqHop = Math.max(1, Math.round(sr / 100));
  const nFreq = Math.floor(span / freqHop) + 1;
  const peaks = new Float64Array(nFreq);
  const bp = bluesteinPlan(window);
  const outRe = new Float64Array(window), outIm = new Float64Array(window);
  const kMin = Math.ceil(20 * window / sr), kMax = Math.floor(window / 2);
  const x1 = new Float64Array(window), x2 = new Float64Array(window);
  for (let f = 0; f < nFreq; f += 2) {
    for (let j = 0; j < window; j++) { x1[j] = padded[f * freqHop + j]; x2[j] = f + 1 < nFreq ? padded[(f + 1) * freqHop + j] : 0; }
    bluestein(bp, x1, x2, outRe, outIm);
    for (let side = 0; side < 2 && f + side < nFreq; side++) {
      let best = -1, bestMag = 0;
      for (let k = kMin; k <= kMax; k++) {
        const k2 = (window - k) % window;
        // Separate the two real frames packed into one transform
        const r = side === 0 ? (outRe[k] + outRe[k2]) / 2 : (outIm[k] + outIm[k2]) / 2;
        const i = side === 0 ? (outIm[k] - outIm[k2]) / 2 : (outRe[k2] - outRe[k]) / 2;
        const mag = r * r + i * i;
        if (mag > bestMag) { bestMag = mag; best = k; }
      }
      peaks[f + side] = best < 0 ? 0 : best * sr / window;
    }
    if (f % 400 === 0) report('Finding frequencies', f / nFreq);
  }
  const freq = new Float64Array(nWindows);
  for (let i = 0; i < nWindows; i++) freq[i] = peaks[Math.min(nFreq - 1, Math.round(starts[i] / freqHop))];

  // Pitch: YIN once over the track, then the median of the frames centered in each window
  const track = yinTrack(padded, sr, p => report('Detecting pitch', p));
  const perWindow = Math.max(1, Math.ceil(window / 512));
  const pitch = new Float64Array(nWindows), buf = new Float64Array(perWindow);
  for (let i = 0; i < nWindows; i++) {
    const first = Math.ceil(starts[i] / 512);
    for (let k = 0; k < perWindow; k++) buf[k] = track[Math.min(first + k, track.length - 1)];
    buf.sort();
    const m = perWindow >> 1;
    let p = perWindow % 2 ? buf[m] : (buf[m - 1] + buf[m]) / 2;
    if (p > FMAX) p = 0;  // YIN reports a pitch above fmax when it finds none
    pitch[i] = p;
  }

  // Silence: more than 40 dB below the loudest window, or no pitch
  report('Finishing', 1);
  let peak = 0;
  for (let i = 0; i < nWindows; i++) if (loud[i] > peak) peak = loud[i];
  const threshold = peak * Math.pow(10, -40 / 20);
  const voiced = new Uint8Array(nWindows), noteIndex = new Uint8Array(nWindows), midi = new Float32Array(nWindows);
  for (let i = 0; i < nWindows; i++) {
    if (loud[i] < threshold || pitch[i] <= 0) continue;
    voiced[i] = 1;
    noteIndex[i] = roundHalfEven(12 * Math.log2(pitch[i] / C0)) + 1;
    midi[i] = 69 + 12 * Math.log2(pitch[i] / 440);
  }
  return {
    duration: y.length / sr, sampleRate: sr,
    loudness: rankNormalize(loud, voiced), frequency: rankNormalize(freq, voiced),
    noteIndex, midi, voiced,
  };
}

if (typeof module !== 'undefined') module.exports = { analyze, yinTrack, rankNormalize };

// Web Worker entry: receives { samples, sampleRate, nWindows }, posts progress and the result
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof module === 'undefined') {
  self.onmessage = e => {
    try {
      const { samples, sampleRate, nWindows } = e.data;
      const result = analyze(samples, sampleRate, nWindows, (stage, fraction) => self.postMessage({ type: 'progress', stage, fraction }));
      self.postMessage({ type: 'done', result }, [result.loudness.buffer, result.frequency.buffer, result.noteIndex.buffer, result.midi.buffer, result.voiced.buffer]);
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
  };
}
