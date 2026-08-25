export interface StatRow {
  id: string;
  name: string;
  goals: number;
  assists: number;
  beautiful: number;
  bad: number;
  saves: number;
  canetas: number;
  quasegols: number;
}

// Player-of-the-day formula: 2G + 1A + 0.25✨ − 0.25💩 + 1🧤 + 0.25🪡 − 0.25😱
export const POINTS_WEIGHTS = {
  goal: 2,
  assist: 1,
  beautiful: 0.25,
  bad: -0.25,
  save: 1,
  caneta: 0.25,
  quasegol: -0.25,
} as const;

export function calcPoints(r: StatRow): number {
  return (
    r.goals * POINTS_WEIGHTS.goal +
    r.assists * POINTS_WEIGHTS.assist +
    r.beautiful * POINTS_WEIGHTS.beautiful +
    r.bad * POINTS_WEIGHTS.bad +
    r.saves * POINTS_WEIGHTS.save +
    (r.canetas ?? 0) * POINTS_WEIGHTS.caneta +
    (r.quasegols ?? 0) * POINTS_WEIGHTS.quasegol
  );
}

export function fmtPoints(n: number): string {
  // 1-decimal max, drop trailing .0
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

type Category =
  | 'mvp'
  | 'goals'
  | 'assists'
  | 'beautiful'
  | 'bad'
  | 'saves'
  | 'canetas'
  | 'quasegols';

export interface BestEntry {
  category: Category;
  players: StatRow[]; // everyone tied at the top value
  value: number;
}

// Returns the top entry per category. mvp uses points; the rest use raw counts.
// Ties are kept — all players sharing the top value are listed.
// A category is omitted if no player has any value > 0 (or, for bad, > 0 howlers).
export function bestOfEachCategory(rows: StatRow[]): BestEntry[] {
  if (rows.length === 0) return [];
  const out: BestEntry[] = [];
  const pick = (category: Category, valueOf: (r: StatRow) => number) => {
    const bestVal = Math.max(...rows.map(valueOf));
    if (bestVal <= 0) return;
    const players = rows
      .filter((r) => valueOf(r) === bestVal)
      .sort((a, b) => a.name.localeCompare(b.name));
    out.push({ category, players, value: bestVal });
  };
  pick('mvp', calcPoints);
  pick('goals', (r) => r.goals);
  pick('assists', (r) => r.assists);
  pick('beautiful', (r) => r.beautiful);
  pick('bad', (r) => r.bad);
  pick('saves', (r) => r.saves);
  pick('canetas', (r) => r.canetas ?? 0);
  pick('quasegols', (r) => r.quasegols ?? 0);
  return out;
}
