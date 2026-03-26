/**
 * generateLayout.js — SERVER copy (CommonJS)
 * Place in: server/generateLayout.js
 *
 * TWO-CONSTRAINT PLACEMENT
 * =========================
 *   1. No crossing   — line segments must not intersect
 *   2. Midpoint gap  — piece midpoints must be ≥ 2 cells apart
 *                      (prevents parallel pieces running side-by-side)
 *
 * Both checks are O(n) per candidate and take < 2ms per call.
 * 5 snakes + 5 ladders, both freely diagonal.
 * Snakes prefer diagonal (Δx ≥ 2). Ladders go at natural angles.
 */

function _sq2xy(n) {
    const idx = n - 1,
        row = Math.floor(idx / 10);
    return {
        x: (row % 2 === 0 ? idx % 10 : 9 - (idx % 10)) + 0.5,
        y: row + 0.5,
    };
}
const XY = Array.from({ length: 101 }, (_, i) =>
    i === 0 ? { x: 0, y: 0 } : _sq2xy(i),
);

// Precompute candidate lists once at module load
const HEADS = [];
const BASES = [];
const TAIL_FOR = Array.from({ length: 101 }, () => []);
const TOP_FOR = Array.from({ length: 101 }, () => []);

for (let h = 2; h <= 99; h++) {
    const { y: hy, x: hx } = XY[h];
    if (hy >= 4.5) {
        HEADS.push(h);
        const diag = [],
            straight = [];
        for (let t = 2; t < h; t++) {
            const { y: ty, x: tx } = XY[t];
            if (ty > hy - 3 || ty > 5.5 || t === 1) continue;
            (Math.abs(tx - hx) >= 2 ? diag : straight).push(t);
        }
        TAIL_FOR[h] = [...diag, ...straight];
    }
}
for (let b = 2; b <= 99; b++) {
    if (XY[b].y <= 3.5) {
        BASES.push(b);
        for (let t = b + 1; t <= 99; t++) {
            if (XY[t].y >= 6.5) TOP_FOR[b].push(t);
        }
    }
}

function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax,
        ry = by - ay,
        sx = dx - cx,
        sy = dy - cy;
    const rxs = rx * sy - ry * sx;
    if (Math.abs(rxs) < 1e-9) return false;
    const qpx = cx - ax,
        qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / rxs;
    const u = (qpx * ry - qpy * rx) / rxs;
    return t > 0.1 && t < 0.9 && u > 0.1 && u < 0.9;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * i) | 0;
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

function generateLayout({
    numSnakes = 5,
    numLadders = 5,
    maxAttempts = 100,
} = {}) {
    const P = new Float32Array(80); // piece segments x1,y1,x2,y2
    const M = new Float32Array(40); // midpoints mx,my
    const used = new Uint8Array(101);
    let pc = 0,
        mc = 0;

    function tooClose(ax, ay, bx, by) {
        // 1. Check crossing
        for (let i = 0; i < pc; i += 4) {
            if (crosses(ax, ay, bx, by, P[i], P[i + 1], P[i + 2], P[i + 3]))
                return true;
        }
        // 2. Check midpoint proximity (≥ 2 cells apart)
        const mx = (ax + bx) * 0.5,
            my = (ay + by) * 0.5;
        for (let i = 0; i < mc; i += 2) {
            if ((mx - M[i]) ** 2 + (my - M[i + 1]) ** 2 < 4) return true;
        }
        return false;
    }

    for (let att = 0; att < maxAttempts; att++) {
        pc = 0;
        mc = 0;
        used.fill(0);
        used[1] = 1;
        used[100] = 1;
        const snakes = {},
            ladders = {};

        // ── Snakes ─────────────────────────────────────────────────────────────
        const heads = shuffle([...HEADS]);
        let ok = true;

        for (let s = 0; s < numSnakes; s++) {
            let placed = false;
            for (const h of heads) {
                if (used[h]) continue;
                const { x: hx, y: hy } = XY[h];
                const cands = TAIL_FOR[h],
                    off = (Math.random() * cands.length) | 0;
                for (let ci = 0; ci < cands.length; ci++) {
                    const t = cands[(ci + off) % cands.length];
                    if (used[t]) continue;
                    const { x: tx, y: ty } = XY[t];
                    if (tooClose(hx, hy, tx, ty)) continue;
                    snakes[h] = t;
                    used[h] = used[t] = 1;
                    P[pc++] = hx;
                    P[pc++] = hy;
                    P[pc++] = tx;
                    P[pc++] = ty;
                    M[mc++] = (hx + tx) * 0.5;
                    M[mc++] = (hy + ty) * 0.5;
                    placed = true;
                    break;
                }
                if (placed) break;
            }
            if (!placed) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;

        // ── Ladders ────────────────────────────────────────────────────────────
        const bases = shuffle(BASES.filter((n) => !used[n]));

        for (let l = 0; l < numLadders; l++) {
            let placed = false;
            for (const b of bases) {
                if (used[b]) continue;
                const { x: bx, y: by } = XY[b];
                const cands = TOP_FOR[b],
                    off = (Math.random() * cands.length) | 0;
                for (let ci = 0; ci < cands.length; ci++) {
                    const t = cands[(ci + off) % cands.length];
                    if (used[t]) continue;
                    const { x: tx, y: ty } = XY[t];
                    if (tooClose(bx, by, tx, ty)) continue;
                    ladders[b] = t;
                    used[b] = used[t] = 1;
                    P[pc++] = bx;
                    P[pc++] = by;
                    P[pc++] = tx;
                    P[pc++] = ty;
                    M[mc++] = (bx + tx) * 0.5;
                    M[mc++] = (by + ty) * 0.5;
                    placed = true;
                    break;
                }
                if (placed) break;
            }
            if (!placed) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;

        // ── Validate ───────────────────────────────────────────────────────────
        const sh = Object.keys(snakes).map(Number);
        const st = Object.values(snakes).map(Number);
        const lb = Object.keys(ladders).map(Number);
        const lt = Object.values(ladders).map(Number);
        const all = [...sh, ...st, ...lb, ...lt];

        if (new Set(all).size !== all.length) continue;
        if (lt.some((t) => sh.includes(t))) continue;
        if (st.some((t) => lb.includes(t))) continue;
        if (![95, 96, 97, 98, 99].some((n) => !sh.includes(n))) continue;

        return { snakes, ladders };
    }

    console.warn("[generateLayout] fell back to default");
    return {
        snakes: { 99: 21, 95: 75, 87: 24, 62: 19, 54: 34 },
        ladders: { 4: 14, 9: 31, 20: 38, 40: 59, 63: 81 },
    };
}

module.exports = { generateLayout };
