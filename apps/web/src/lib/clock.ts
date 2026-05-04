import { useEffect, useState } from 'react';

export interface ClockState {
  status: 'pending' | 'running' | 'paused' | 'done';
  started_at: number | null;
  elapsed_ms: number;
}

export function computeClockMs(state: ClockState, now: number = Date.now()): number {
  if (state.status === 'running' && state.started_at) {
    return state.elapsed_ms + (now - state.started_at);
  }
  return state.elapsed_ms;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60).toString().padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

// Re-render every animation frame while running so the clock display stays
// smooth without depending on setInterval (which iOS Safari throttles when the
// tab is backgrounded).
export function useClock(state: ClockState | null | undefined): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (!state) return;
    if (state.status !== 'running') return;
    let raf = 0;
    const tick = () => {
      force((n) => (n + 1) & 0xffff);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state?.status]);
  return state ? computeClockMs(state) : 0;
}
