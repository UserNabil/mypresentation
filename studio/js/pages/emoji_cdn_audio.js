const SFX_RATE = 22050;
const SFX_MAX_S = 3;
const SILENCE = 0.003;
const TARGET_RMS = 0.16;
const PEAK_MAX = 0.89;
const GAIN_MAX = 8;

function level(pcm) {
  let peak = 0, sum = 0;
  for (let i = 0; i < pcm.length; i++) { const x = Math.abs(pcm[i]); if (x > peak) peak = x; sum += pcm[i] * pcm[i]; }
  const rms = Math.sqrt(sum / Math.max(1, pcm.length));
  if (peak < 1e-4 || rms < 1e-5) return { gain: 1, pcm };
  const gain = Math.min(TARGET_RMS / rms, PEAK_MAX / peak, GAIN_MAX);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * gain;
  return { gain, pcm: out };
}

function trim(pcm) {
  let a = 0, b = pcm.length;
  while (a < b && Math.abs(pcm[a]) < SILENCE) a++;
  while (b > a && Math.abs(pcm[b - 1]) < SILENCE) b--;
  return a < b ? pcm.subarray(a, b) : pcm.subarray(0, Math.min(pcm.length, 1));
}

function wav16(pcm, rate) {
  const n = pcm.length, out = new ArrayBuffer(44 + n * 2), v = new DataView(out);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
  }
  return out;
}

export async function decodeToWav(data, opts) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || !window.OfflineAudioContext) throw new Error('this window has no audio decoder');
  const ac = new AC();
  let audio;
  try {
    audio = await ac.decodeAudioData(data.slice(0));
  } catch (e) {
    throw new Error('this file could not be decoded (not a readable WAV, MP3, OGG, FLAC or M4A)');
  } finally {
    try { ac.close(); } catch (e) { }
  }
  const len = Math.max(1, Math.ceil(audio.duration * SFX_RATE));
  const off = new OfflineAudioContext(1, len, SFX_RATE);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  let pcm = trim(out.getChannelData(0));
  const seconds = pcm.length / SFX_RATE;
  if (seconds > SFX_MAX_S + 0.01) throw new Error(`${seconds.toFixed(1)} s long, ${SFX_MAX_S} s max: trim it first`);
  let gain = 1;
  if (!opts || opts.level !== false) ({ gain, pcm } = level(pcm));
  return { wav: wav16(pcm, SFX_RATE), seconds, gain, source: { rate: audio.sampleRate, channels: audio.numberOfChannels, seconds: audio.duration } };
}

export function wavName(name) {
  const i = name.lastIndexOf('.');
  return (i > 0 ? name.slice(0, i) : name) + '.wav';
}
