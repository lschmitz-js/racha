import type { EventType } from '@racha/shared';

// Lightweight Web Audio synth: distinct sound per match event, no assets needed.
// Toggle persists in localStorage so the mute survives reloads.

const STORAGE_KEY = 'racha.soundEnabled';

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    // Resume on user gesture (event taps already are gestures, so this is safe).
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORAGE_KEY) !== '0';
}

export function setSoundEnabled(b: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, b ? '1' : '0');
}

interface Note {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function playNotes(notes: Note[]) {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime;
  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    osc.connect(gain).connect(c.destination);
    const startAt = t0 + n.start;
    const endAt = startAt + n.duration;
    const peak = n.gain ?? 0.3;
    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, endAt);
    osc.start(startAt);
    osc.stop(endAt + 0.05);
  }
}

function playSweep(
  fromFreq: number,
  toFreq: number,
  duration: number,
  type: OscillatorType = 'sine',
  peak = 0.3
) {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(toFreq, t0 + duration);
  osc.connect(g).connect(c.destination);
  g.gain.setValueAtTime(0.001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

// LFO-modulated low sawtooth → raspberry / fart-ish buzz for the cagada.
function playRaspberry() {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 90;
  lfo.frequency.value = 28;
  lfoGain.gain.value = 35;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.connect(gain).connect(c.destination);
  gain.gain.setValueAtTime(0.001, t0);
  gain.gain.exponentialRampToValueAtTime(0.45, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + 0.6);
  lfo.stop(t0 + 0.6);
}

export function playEventSound(type: EventType) {
  switch (type) {
    case 'goal':
      // Three-note rising fanfare.
      playNotes([
        { freq: 523, start: 0,    duration: 0.12, type: 'square', gain: 0.25 },
        { freq: 659, start: 0.12, duration: 0.12, type: 'square', gain: 0.25 },
        { freq: 784, start: 0.24, duration: 0.45, type: 'square', gain: 0.3 },
      ]);
      return;
    case 'assist':
      playNotes([
        { freq: 659, start: 0,    duration: 0.20, type: 'triangle', gain: 0.25 },
        { freq: 880, start: 0,    duration: 0.20, type: 'triangle', gain: 0.20 },
      ]);
      return;
    case 'beautiful':
      // Cascade of high notes — applause-ish.
      playNotes([
        { freq: 1046, start: 0,    duration: 0.08, type: 'sine', gain: 0.2 },
        { freq: 1318, start: 0.08, duration: 0.08, type: 'sine', gain: 0.2 },
        { freq: 1568, start: 0.16, duration: 0.08, type: 'sine', gain: 0.2 },
        { freq: 2093, start: 0.24, duration: 0.20, type: 'sine', gain: 0.25 },
      ]);
      return;
    case 'save':
      // Quick whistle.
      playSweep(660, 880, 0.25, 'triangle', 0.25);
      return;
    case 'bad':
      playRaspberry();
      return;
    case 'caneta':
      // Mischievous chirp up.
      playSweep(440, 1320, 0.22, 'sine', 0.25);
      return;
    case 'quasegol':
      // Disappointed descending sigh.
      playSweep(660, 220, 0.5, 'sine', 0.28);
      return;
    default:
      return;
  }
}

// Match-clock buzzer at the 5-minute mark.
export function playBuzzer() {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = 660;
  osc.connect(gain).connect(c.destination);
  gain.gain.setValueAtTime(0.001, t0);
  gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
  osc.start(t0);
  osc.stop(t0 + 0.6);
}
