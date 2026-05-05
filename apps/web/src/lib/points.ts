export interface StatRow {
  id: string;
  name: string;
  role?: 'player' | 'gk';
  goals: number;
  assists: number;
  beautiful: number;
  bad: number;
  saves: number;
}

// Player-of-the-day formula: 2G + 1A + 0.25✨ − 0.25💩 + 1🧤
export const POINTS_WEIGHTS = {
  goal: 2,
  assist: 1,
  beautiful: 0.25,
  bad: -0.25,
  save: 1,
} as const;

export function calcPoints(r: StatRow): number {
  return (
    r.goals * POINTS_WEIGHTS.goal +
    r.assists * POINTS_WEIGHTS.assist +
    r.beautiful * POINTS_WEIGHTS.beautiful +
    r.bad * POINTS_WEIGHTS.bad +
    r.saves * POINTS_WEIGHTS.save
  );
}

export function fmtPoints(n: number): string {
  // 1-decimal max, drop trailing .0
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

type Category = 'mvp' | 'goals' | 'assists' | 'beautiful' | 'bad' | 'saves';

export interface BestEntry {
  category: Category;
  player: StatRow;
  value: number;
}

// Returns the top entry per category. mvp uses points; the rest use raw counts.
// A category is omitted if no player has any value > 0 (or, for bad, > 0 howlers).
export function bestOfEachCategory(rows: StatRow[]): BestEntry[] {
  if (rows.length === 0) return [];
  const out: BestEntry[] = [];
  const pick = (
    category: Category,
    valueOf: (r: StatRow) => number,
    tieBreak?: (r: StatRow) => number
  ) => {
    let best: StatRow | null = null;
    let bestVal = -Infinity;
    let bestTb = -Infinity;
    for (const r of rows) {
      const v = valueOf(r);
      const tb = tieBreak ? tieBreak(r) : 0;
      if (v > bestVal || (v === bestVal && tb > bestTb)) {
        best = r;
        bestVal = v;
        bestTb = tb;
      }
    }
    if (best && bestVal > 0) {
      out.push({ category, player: best, value: bestVal });
    }
  };
  pick(
    'mvp',
    calcPoints,
    (r) => r.goals * 100 + r.assists * 10 + r.saves
  );
  pick('goals', (r) => r.goals, (r) => r.assists);
  pick('assists', (r) => r.assists, (r) => r.goals);
  pick('beautiful', (r) => r.beautiful);
  pick('bad', (r) => r.bad);
  pick('saves', (r) => r.saves);
  return out;
}
