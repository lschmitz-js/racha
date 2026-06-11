const VEST_ORDER = ['white', 'black', 'green'];
export function calcScore(skills) {
    return Math.round((skills.reduce((a, b) => a + b, 0) / skills.length) * 2) / 2;
}
export function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
    return a;
}
export function balanceTeams(players, randomize, mode = 'normal') {
    if (players.length < 6) {
        throw new Error('Need at least 6 players for 3 teams');
    }
    const scored = players.map((p) => ({
        ...p,
        score: calcScore(p.skills),
    }));
    const teams = [[], [], []];
    const totals = [0, 0, 0];
    if (mode === 'dropin-split') {
        const sortOrShuffle = (arr) => {
            if (!randomize)
                return [...arr].sort((a, b) => b.score - a.score);
            const buckets = {};
            arr.forEach((p) => {
                const k = Math.round(p.score * 2);
                (buckets[k] = buckets[k] || []).push(p);
            });
            return Object.keys(buckets)
                .sort((a, b) => Number(b) - Number(a))
                .flatMap((k) => shuffle(buckets[Number(k)]));
        };
        const dropins = sortOrShuffle(scored.filter((p) => p.type === 'dropin'));
        const seasons = sortOrShuffle(scored.filter((p) => p.type === 'season'));
        const maxPerTeam = Math.ceil(scored.length / 3);
        const dropinTeam = dropins.slice(0, maxPerTeam);
        const dropinSpill = dropins.slice(maxPerTeam);
        dropinTeam.forEach((p) => {
            teams[2].push(p);
            totals[2] += p.score;
        });
        const remaining = sortOrShuffle([...seasons, ...dropinSpill]);
        remaining.forEach((p) => {
            const mi = (totals[0] ?? 0) <= (totals[1] ?? 0) ? 0 : 1;
            teams[mi].push(p);
            totals[mi] += p.score;
        });
    }
    else {
        let sorted;
        if (randomize) {
            const byScore = [...scored].sort((a, b) => b.score - a.score);
            const third = Math.ceil(byScore.length / 3);
            const top = shuffle(byScore.slice(0, third));
            const mid = shuffle(byScore.slice(third, third * 2));
            const bot = shuffle(byScore.slice(third * 2));
            sorted = [...top, ...mid, ...bot];
        }
        else {
            sorted = [...scored].sort((a, b) => b.score - a.score);
        }
        // Matches are 5v5, so with 10+ players white and black always get exactly
        // 5 and green takes the remainder (the rotating bench squad). Below 10,
        // fall back to an even split.
        const n = scored.length;
        let caps;
        if (n >= 10) {
            caps = [5, 5, n - 10];
        }
        else {
            const base = Math.floor(n / 3);
            const rem = n % 3;
            caps = [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base];
        }
        // Greedy toward each team's share of the total score (proportional to its
        // size), so the small green squad still lands near the overall average
        // instead of hoarding the strongest players.
        const totalScore = scored.reduce((s, p) => s + p.score, 0);
        const targets = caps.map((cap) => (totalScore * cap) / n);
        sorted.forEach((p) => {
            let mi = -1;
            let bestDeficit = -Infinity;
            for (let i = 0; i < 3; i++) {
                if (teams[i].length >= caps[i])
                    continue;
                const deficit = targets[i] - totals[i];
                if (deficit > bestDeficit) {
                    bestDeficit = deficit;
                    mi = i;
                }
            }
            teams[mi].push(p);
            totals[mi] += p.score;
        });
    }
    return teams.map((team, i) => ({
        vest: VEST_ORDER[i],
        players: [...team].sort((a, b) => b.score - a.score),
        total: totals[i],
        avg: team.length ? Math.round((totals[i] / team.length) * 10) / 10 : 0,
    }));
}
