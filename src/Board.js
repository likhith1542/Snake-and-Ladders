import React, { useState, useEffect, useRef } from "react";
import { motion, animate, useMotionValue } from "framer-motion";

// ─── Base constants (design at 620px, scale down via CSS) ─────────────────────
const CELL = 62;
const COLS = 10;
const ROWS = 10;
const SIZE = CELL * COLS; // 620 — the SVG's intrinsic size

// Default fallback layout (used only if no layout is passed via props)
const DEFAULT_SNAKES = { 99: 21, 95: 75, 87: 24, 62: 19, 54: 34, 17: 7 };
const DEFAULT_LADDERS = {
    4: 14,
    9: 31,
    20: 38,
    28: 84,
    40: 59,
    51: 67,
    63: 81,
    71: 91,
};

export const PLAYER_COLORS = ["#818cf8", "#34d399", "#fbbf24", "#f87171"];
export const PLAYER_DARK = ["#4338ca", "#059669", "#b45309", "#dc2626"];

const STEP_MS = 160;
const SLIDE_MS = 700;

// ─── Coordinate math (always in base 620px space) ────────────────────────────
export function cellCenter(num) {
    const n = Math.max(1, Math.min(100, num ?? 1));
    const idx = n - 1;
    const rowFromBot = Math.floor(idx / COLS);
    const colInRow = idx % COLS;
    const visualCol = rowFromBot % 2 === 0 ? colInRow : COLS - 1 - colInRow;
    const visualRow = ROWS - 1 - rowFromBot;
    return {
        x: visualCol * CELL + CELL / 2,
        y: visualRow * CELL + CELL / 2,
    };
}

function cellNumber(gridIdx) {
    const svgRow = Math.floor(gridIdx / COLS);
    const svgCol = gridIdx % COLS;
    const rowFromBot = ROWS - 1 - svgRow;
    const col = rowFromBot % 2 === 0 ? svgCol : COLS - 1 - svgCol;
    return rowFromBot * COLS + col + 1;
}

// ─── Snake themes ────────────────────────────────────────────────────────────
const SNAKE_THEMES = [
    {
        belly: "#86efac",
        bodyA: "#16a34a",
        bodyB: "#15803d",
        dark: "#14532d",
        scaleA: "#22c55e",
        scaleB: "#4ade80",
        eye: "#fbbf24",
        pupil: "#1a0a00",
        tongue: "#f87171",
    },
    {
        belly: "#fde68a",
        bodyA: "#ca8a04",
        bodyB: "#92400e",
        dark: "#78350f",
        scaleA: "#d97706",
        scaleB: "#f59e0b",
        eye: "#f97316",
        pupil: "#1c0a00",
        tongue: "#fda4af",
    },
    {
        belly: "#bfdbfe",
        bodyA: "#1d4ed8",
        bodyB: "#1e3a8a",
        dark: "#172554",
        scaleA: "#2563eb",
        scaleB: "#3b82f6",
        eye: "#7dd3fc",
        pupil: "#0a0a1a",
        tongue: "#c4b5fd",
    },
    {
        belly: "#fecaca",
        bodyA: "#b91c1c",
        bodyB: "#7f1d1d",
        dark: "#450a0a",
        scaleA: "#dc2626",
        scaleB: "#ef4444",
        eye: "#fbbf24",
        pupil: "#1a0000",
        tongue: "#fb923c",
    },
];

function buildSnakePath(from, to) {
    const { x: hx, y: hy } = cellCenter(from);
    const { x: tx, y: ty } = cellCenter(to);
    const dx = tx - hx,
        dy = ty - hy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const px = -dy / len,
        py = dx / len; // perpendicular unit vector

    // Tight S-curve: max perpendicular bulge = 0.22 cells (≈14px)
    // This keeps the rendered curve within its own cell corridor
    // and prevents visual overlap with adjacent pieces.
    const amp = Math.min(len * 0.09, CELL * 0.22);

    // Classic S: right at 30%, left at 70%
    const c1x = hx + dx * 0.3 + px * amp,
        c1y = hy + dy * 0.3 + py * amp;
    const c2x = hx + dx * 0.7 - px * amp,
        c2y = hy + dy * 0.7 - py * amp;

    return {
        path: `M${hx},${hy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`,
        hx,
        hy,
        tx,
        ty,
        headAngle: (Math.atan2(c1y - hy, c1x - hx) * 180) / Math.PI,
    };
}

// ─── Snake SVG ───────────────────────────────────────────────────────────────
function SnakeSVG({ from, to, themeIdx, id }) {
    const t = SNAKE_THEMES[themeIdx % SNAKE_THEMES.length];
    const { path, hx, hy, tx, ty, headAngle } = buildSnakePath(from, to);
    const HR = 13;
    const patId = `scales-${id}`;
    const gradId = `snakeGrad-${id}`;

    return (
        <g style={{ pointerEvents: "none" }}>
            <defs>
                <linearGradient
                    id={gradId}
                    gradientUnits="userSpaceOnUse"
                    x1={hx}
                    y1={hy}
                    x2={tx}
                    y2={ty}
                >
                    <stop offset="0%" stopColor={t.bodyA} />
                    <stop offset="50%" stopColor={t.bodyB} />
                    <stop offset="100%" stopColor={t.dark} />
                </linearGradient>
                <pattern
                    id={patId}
                    patternUnits="userSpaceOnUse"
                    width="16"
                    height="14"
                >
                    <ellipse
                        cx="8"
                        cy="4"
                        rx="6.5"
                        ry="3.5"
                        fill={t.scaleA}
                        opacity="0.7"
                    />
                    <ellipse
                        cx="8"
                        cy="4"
                        rx="5"
                        ry="2.5"
                        fill={t.scaleB}
                        opacity="0.4"
                    />
                    <ellipse
                        cx="0"
                        cy="11"
                        rx="6.5"
                        ry="3.5"
                        fill={t.scaleA}
                        opacity="0.7"
                    />
                    <ellipse
                        cx="16"
                        cy="11"
                        rx="6.5"
                        ry="3.5"
                        fill={t.scaleA}
                        opacity="0.7"
                    />
                    <ellipse
                        cx="0"
                        cy="11"
                        rx="5"
                        ry="2.5"
                        fill={t.scaleB}
                        opacity="0.4"
                    />
                    <ellipse
                        cx="16"
                        cy="11"
                        rx="5"
                        ry="2.5"
                        fill={t.scaleB}
                        opacity="0.4"
                    />
                    <path
                        d="M1.5,7 Q8,4.5 14.5,7"
                        fill="none"
                        stroke={t.dark}
                        strokeWidth="0.5"
                        opacity="0.5"
                    />
                    <path
                        d="M1.5,14 Q8,11.5 14.5,14"
                        fill="none"
                        stroke={t.dark}
                        strokeWidth="0.5"
                        opacity="0.5"
                    />
                </pattern>
            </defs>
            <path
                d={path}
                fill="none"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={20}
                strokeLinecap="round"
            />
            <path
                d={path}
                fill="none"
                stroke={t.dark}
                strokeWidth={18}
                strokeLinecap="round"
            />
            <path
                d={path}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={15}
                strokeLinecap="round"
            />
            <path
                d={path}
                fill="none"
                stroke={`url(#${patId})`}
                strokeWidth={15}
                strokeLinecap="round"
                opacity={0.85}
            />
            <path
                d={path}
                fill="none"
                stroke={t.belly}
                strokeWidth={5}
                strokeLinecap="round"
                opacity={0.35}
            />
            <path
                d={path}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="12 20"
                strokeDashoffset="6"
            />
            <circle cx={tx} cy={ty} r={5} fill={t.dark} />
            <circle cx={tx} cy={ty} r={3} fill={t.bodyB} opacity={0.6} />
            <g transform={`translate(${hx},${hy}) rotate(${headAngle + 90})`}>
                <ellipse
                    rx={HR + 3}
                    ry={HR + 1}
                    cy={1.5}
                    fill="rgba(0,0,0,0.3)"
                />
                <ellipse rx={HR + 1} ry={HR - 1} fill={t.dark} />
                <ellipse rx={HR - 1} ry={HR - 3} fill={t.bodyA} />
                <ellipse
                    rx={HR - 1}
                    ry={HR - 3}
                    fill={`url(#${patId})`}
                    opacity={0.6}
                />
                <ellipse
                    rx={HR - 3}
                    ry={HR - 7}
                    cy={-(HR - 5)}
                    fill={t.bodyB}
                />
                <ellipse
                    rx={HR - 5}
                    ry={HR - 9}
                    cy={-(HR - 5)}
                    fill={t.scaleB}
                    opacity={0.5}
                />
                {[-6, 6].map((ex, i) => (
                    <g key={i} transform={`translate(${ex}, -4)`}>
                        <ellipse rx={5} ry={4.5} fill={t.dark} />
                        <ellipse rx={4} ry={3.8} fill={t.eye} />
                        <ellipse rx={1.4} ry={3.4} fill={t.pupil} />
                        <ellipse
                            rx={4}
                            ry={3.8}
                            fill="none"
                            stroke={t.dark}
                            strokeWidth={0.6}
                        />
                        <ellipse
                            rx={1.2}
                            ry={0.9}
                            cx={1.2}
                            cy={-1.2}
                            fill="white"
                            opacity={0.7}
                        />
                    </g>
                ))}
                <ellipse
                    rx={1.2}
                    ry={0.7}
                    cx={-3.5}
                    cy={-(HR - 3)}
                    fill={t.dark}
                    opacity={0.7}
                />
                <ellipse
                    rx={1.2}
                    ry={0.7}
                    cx={3.5}
                    cy={-(HR - 3)}
                    fill={t.dark}
                    opacity={0.7}
                />
                <path
                    d={`M0,${HR + 1} L0,${HR + 8} L-4,${HR + 13} M0,${HR + 8} L4,${HR + 13}`}
                    stroke={t.tongue}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    fill="none"
                />
            </g>
        </g>
    );
}

// ─── Ladder SVG ───────────────────────────────────────────────────────────────
function LadderSVG({ from, to }) {
    const { x: bx, y: by } = cellCenter(from);
    const { x: tx, y: ty } = cellCenter(to);
    const dx = tx - bx,
        dy = ty - by;
    const len = Math.sqrt(dx * dx + dy * dy);
    const px = (-dy / len) * 11,
        py = (dx / len) * 11;
    const n = Math.max(3, Math.round(len / 36));
    const rungs = Array.from({ length: n }, (_, i) => {
        const t2 = (i + 1) / (n + 1);
        return { x: bx + dx * t2, y: by + dy * t2 };
    });

    return (
        <g style={{ pointerEvents: "none" }}>
            <defs>
                <linearGradient
                    id={`lg-${from}`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                >
                    <stop offset="0%" stopColor="#78350f" />
                    <stop offset="40%" stopColor="#d97706" />
                    <stop offset="60%" stopColor="#fcd34d" />
                    <stop offset="100%" stopColor="#92400e" />
                </linearGradient>
            </defs>
            {[px, -px].map((ox, i) => {
                const oy = py * (i === 0 ? 1 : -1);
                return (
                    <g key={i}>
                        <line
                            x1={bx + ox + 2}
                            y1={by + oy + 2}
                            x2={tx + ox + 2}
                            y2={ty + oy + 2}
                            stroke="rgba(0,0,0,0.25)"
                            strokeWidth={7}
                            strokeLinecap="round"
                        />
                        <line
                            x1={bx + ox}
                            y1={by + oy}
                            x2={tx + ox}
                            y2={ty + oy}
                            stroke="#78350f"
                            strokeWidth={8}
                            strokeLinecap="round"
                        />
                        <line
                            x1={bx + ox}
                            y1={by + oy}
                            x2={tx + ox}
                            y2={ty + oy}
                            stroke={`url(#lg-${from})`}
                            strokeWidth={5}
                            strokeLinecap="round"
                        />
                        <line
                            x1={bx + ox}
                            y1={by + oy}
                            x2={tx + ox}
                            y2={ty + oy}
                            stroke="rgba(255,255,255,0.15)"
                            strokeWidth={1.5}
                            strokeLinecap="round"
                        />
                    </g>
                );
            })}
            {rungs.map((r, i) => (
                <g key={i}>
                    <line
                        x1={r.x + px + 1.5}
                        y1={r.y + py + 1.5}
                        x2={r.x - px + 1.5}
                        y2={r.y - py + 1.5}
                        stroke="rgba(0,0,0,0.25)"
                        strokeWidth={6}
                        strokeLinecap="round"
                    />
                    <line
                        x1={r.x + px}
                        y1={r.y + py}
                        x2={r.x - px}
                        y2={r.y - py}
                        stroke="#92400e"
                        strokeWidth={6}
                        strokeLinecap="round"
                    />
                    <line
                        x1={r.x + px}
                        y1={r.y + py}
                        x2={r.x - px}
                        y2={r.y - py}
                        stroke="#fde68a"
                        strokeWidth={4}
                        strokeLinecap="round"
                    />
                    <line
                        x1={r.x + px}
                        y1={r.y + py}
                        x2={r.x - px}
                        y2={r.y - py}
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                    />
                </g>
            ))}
        </g>
    );
}

// ─── Player Token ────────────────────────────────────────────────────────────
function PlayerToken({
    player,
    index,
    total,
    lastRoll,
    onMoveStart,
    onMoveEnd,
}) {
    const targetPos = Math.max(1, player.pos ?? 1);
    const [displayPos, setDisplayPos] = useState(targetPos);
    const [sliding, setSliding] = useState(false);
    const animRef = useRef(null);
    const prevTarget = useRef(targetPos);

    const mx = useMotionValue(cellCenter(targetPos).x);
    const my = useMotionValue(cellCenter(targetPos).y);

    const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
    const spread = total > 1 ? 13 : 0;
    const ox = Math.cos(angle) * spread;
    const oy = Math.sin(angle) * spread;

    const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
    const dark = PLAYER_DARK[index % PLAYER_DARK.length];

    useEffect(() => {
        if (targetPos === prevTarget.current) return;
        const from = prevTarget.current;
        const to = targetPos;
        prevTarget.current = to;
        if (animRef.current) animRef.current();
        onMoveStart?.();

        const diceLand = Math.min(100, from + (lastRoll || to - from));

        let cancelled = false;
        animRef.current = () => {
            cancelled = true;
        };

        const stepCells = [];
        if (from !== diceLand) {
            const dir = diceLand > from ? 1 : -1;
            for (
                let p2 = from + dir;
                dir > 0 ? p2 <= diceLand : p2 >= diceLand;
                p2 += dir
            )
                stepCells.push(p2);
        }

        const doSlide = () => {
            if (cancelled) return;
            if (diceLand === to) {
                onMoveEnd?.();
                return;
            }
            setSliding(true);
            const { x: ex, y: ey } = cellCenter(to);
            const { x: sx2, y: sy2 } = cellCenter(diceLand);
            mx.set(sx2 + ox);
            my.set(sy2 + oy);
            const t1 = setTimeout(() => {
                if (cancelled) return;
                animate(mx, ex + ox, {
                    duration: SLIDE_MS / 1000,
                    ease: [0.4, 0, 0.2, 1],
                });
                animate(my, ey + oy, {
                    duration: SLIDE_MS / 1000,
                    ease: [0.4, 0, 0.2, 1],
                });
                const t2 = setTimeout(() => {
                    if (cancelled) return;
                    setDisplayPos(to);
                    setSliding(false);
                    onMoveEnd?.();
                }, SLIDE_MS + 60);
                animRef.current = () => {
                    cancelled = true;
                    clearTimeout(t2);
                };
            }, 220);
            animRef.current = () => {
                cancelled = true;
                clearTimeout(t1);
            };
        };

        if (stepCells.length === 0) {
            doSlide();
            return;
        }

        let stepIdx = 0;
        const doStep = () => {
            if (cancelled) return;
            if (stepIdx >= stepCells.length) {
                doSlide();
                return;
            }
            const cell = stepCells[stepIdx++];
            setDisplayPos(cell);
            const { x: cx, y: cy } = cellCenter(cell);
            animate(mx, cx + ox, { duration: STEP_MS / 1000, ease: "easeOut" });
            animate(my, cy + oy, { duration: STEP_MS / 1000, ease: "easeOut" });
            const tid = setTimeout(doStep, STEP_MS);
            animRef.current = () => {
                cancelled = true;
                clearTimeout(tid);
            };
        };

        const { x: sx, y: sy } = cellCenter(from);
        mx.set(sx + ox);
        my.set(sy + oy);
        doStep();
        return () => {
            cancelled = true;
        };
    }, [targetPos]);

    useEffect(() => {
        const { x, y } = cellCenter(displayPos);
        animate(mx, x + ox, { duration: 0.2 });
        animate(my, y + oy, { duration: 0.2 });
    }, [ox, oy]);

    return (
        <motion.g style={{ x: mx, y: my }}>
            <motion.circle
                r={22}
                fill={color}
                animate={{ opacity: [0.04, 0.18, 0.04], r: [20, 25, 20] }}
                transition={{
                    repeat: Infinity,
                    duration: 2.5,
                    ease: "easeInOut",
                }}
            />
            <ellipse rx={14} ry={5} cy={20} fill="rgba(0,0,0,0.4)" />
            <circle r={17} fill={dark} />
            <circle r={15} fill={color} />
            <circle r={10} cx={-2} cy={-4} fill="rgba(255,255,255,0.15)" />
            <circle r={5} cx={-5} cy={-6} fill="rgba(255,255,255,0.3)" />
            {sliding && (
                <motion.circle
                    r={17}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    animate={{ r: [17, 26, 17], opacity: [0.8, 0, 0.8] }}
                    transition={{ repeat: Infinity, duration: 0.5 }}
                />
            )}
            <text
                textAnchor="middle"
                dominantBaseline="central"
                dy={1}
                fontSize={13}
                fontWeight="900"
                fill="white"
                fontFamily="Georgia,serif"
                style={{ userSelect: "none" }}
            >
                {player.name?.[0]?.toUpperCase() ?? "?"}
            </text>
        </motion.g>
    );
}

// ─── Cell fill ────────────────────────────────────────────────────────────────
function getCellFill(num, light, snakes, ladders) {
    if (num in snakes) return light ? "#fee2e2" : "#f8b4b4";
    if (num in ladders) return light ? "#dcfce7" : "#86efac";
    return light ? "#fef8e8" : "#e8cb78";
}

// ─── Board ────────────────────────────────────────────────────────────────────
// `boardSize` prop: the rendered pixel width/height (CSS). SVG stays at SIZE=620
// internally; we CSS-scale it so all coordinate math is unchanged.
const Board = ({
    players = [],
    lastRoll = 0,
    boardSize = SIZE,
    compact = false,
    snakes = DEFAULT_SNAKES,
    ladders = DEFAULT_LADDERS,
    onMoveStart,
    onMoveEnd,
}) => {
    const scale = boardSize / SIZE;
    const FRAME = 10; // wooden frame padding (each side)
    const TITLE = 20; // title strip height
    const BORDER = 3; // inner border
    // outerW/H = exactly boardSize + 2*FRAME (the SVG area is boardSize, frame wraps it)
    const outerW = boardSize + FRAME * 2;
    const outerH = boardSize + FRAME * 2 + TITLE;

    return (
        <div
            style={{
                width: outerW,
                borderRadius: 20,
                background: "linear-gradient(145deg,#92400e,#78350f)",
                padding: FRAME,
                paddingTop: 6,
                boxShadow: compact
                    ? "0 0 0 2px #d97706,0 0 0 5px #78350f,0 4px 20px rgba(0,0,0,0.6)"
                    : "0 0 0 2px #d97706,0 0 0 5px #78350f,0 0 0 7px #d97706,0 20px 60px rgba(0,0,0,0.7)",
                position: "relative",
                flexShrink: 0,
                boxSizing: "border-box",
            }}
        >
            {/* Corner inlays */}
            {[
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
            ].map(([sx, sy], i) => (
                <div
                    key={i}
                    style={{
                        position: "absolute",
                        top: sy < 0 ? 4 : "auto",
                        bottom: sy > 0 ? 4 : "auto",
                        left: sx < 0 ? 4 : "auto",
                        right: sx > 0 ? 4 : "auto",
                        width: 14,
                        height: 14,
                        border: "2px solid #d97706",
                        borderRadius: 3,
                        opacity: 0.6,
                    }}
                />
            ))}

            {/* Title */}
            <div
                style={{
                    textAlign: "center",
                    fontFamily: "Georgia,serif",
                    color: "#fde68a",
                    fontSize: Math.max(8, Math.round(11 * Math.min(scale, 1))),
                    fontWeight: "bold",
                    letterSpacing: "0.3em",
                    padding: "2px 0 6px",
                    textTransform: "uppercase",
                    textShadow: "0 1px 6px rgba(0,0,0,0.8)",
                }}
            >
                🐍 Snakes &amp; Ladders 🪜
            </div>

            {/* Board surface — CSS-scaled SVG */}
            <div
                style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "2px solid #b45309",
                    boxShadow: "inset 0 0 30px rgba(0,0,0,0.4)",
                    width: boardSize,
                    height: boardSize,
                }}
            >
                {/* transformOrigin top-left so it fills the container exactly */}
                <div
                    style={{
                        width: SIZE,
                        height: SIZE,
                        transform: `scale(${scale})`,
                        transformOrigin: "0 0",
                    }}
                >
                    <svg
                        width={SIZE}
                        height={SIZE}
                        style={{ display: "block" }}
                    >
                        <defs>
                            <radialGradient id="vig" cx="50%" cy="50%" r="70%">
                                <stop offset="0%" stopColor="transparent" />
                                <stop
                                    offset="100%"
                                    stopColor="rgba(0,0,0,0.28)"
                                />
                            </radialGradient>
                        </defs>

                        {/* Cells */}
                        {[...Array(100)].map((_, gi) => {
                            const num = cellNumber(gi);
                            const sr = Math.floor(gi / COLS),
                                sc = gi % COLS;
                            const light = (sr + sc) % 2 === 0;
                            const fill = getCellFill(
                                num,
                                light,
                                snakes,
                                ladders,
                            );
                            const x = sc * CELL,
                                y = sr * CELL;
                            return (
                                <g key={gi}>
                                    <rect
                                        x={x}
                                        y={y}
                                        width={CELL}
                                        height={CELL}
                                        fill={fill}
                                        stroke="rgba(0,0,0,0.08)"
                                        strokeWidth={0.5}
                                    />
                                    <rect
                                        x={x + 1}
                                        y={y + 1}
                                        width={CELL - 2}
                                        height={CELL - 2}
                                        fill="none"
                                        stroke="rgba(255,255,255,0.08)"
                                        strokeWidth={0.5}
                                    />
                                    <text
                                        x={x + 3}
                                        y={y + 11}
                                        fontSize={9}
                                        fontWeight="800"
                                        fill={light ? "#a07830" : "#6b3e10"}
                                        fontFamily="Georgia,serif"
                                        opacity={0.85}
                                    >
                                        {num}
                                    </text>
                                    {num === 1 && (
                                        <>
                                            <rect
                                                x={x + 2}
                                                y={y + 2}
                                                width={CELL - 4}
                                                height={CELL - 4}
                                                rx={5}
                                                fill="rgba(34,197,94,0.12)"
                                                stroke="#22c55e"
                                                strokeWidth={1.5}
                                                strokeDasharray="4 3"
                                                opacity={0.7}
                                            />
                                            <text
                                                x={x + CELL / 2}
                                                y={y + CELL / 2 + 2}
                                                textAnchor="middle"
                                                fontSize={22}
                                            >
                                                🏁
                                            </text>
                                            <text
                                                x={x + CELL / 2}
                                                y={y + CELL - 5}
                                                textAnchor="middle"
                                                fontSize={7}
                                                fill="#15803d"
                                                fontWeight="900"
                                                fontFamily="Georgia,serif"
                                                letterSpacing="1"
                                            >
                                                START
                                            </text>
                                        </>
                                    )}
                                    {num === 100 && (
                                        <>
                                            <rect
                                                x={x + 2}
                                                y={y + 2}
                                                width={CELL - 4}
                                                height={CELL - 4}
                                                rx={5}
                                                fill="rgba(234,179,8,0.12)"
                                                stroke="#eab308"
                                                strokeWidth={1.5}
                                                strokeDasharray="4 3"
                                                opacity={0.75}
                                            />
                                            <text
                                                x={x + CELL / 2}
                                                y={y + CELL / 2 + 2}
                                                textAnchor="middle"
                                                fontSize={22}
                                            >
                                                🏆
                                            </text>
                                            <text
                                                x={x + CELL / 2}
                                                y={y + CELL - 5}
                                                textAnchor="middle"
                                                fontSize={7}
                                                fill="#a16207"
                                                fontWeight="900"
                                                fontFamily="Georgia,serif"
                                                letterSpacing="1"
                                            >
                                                WIN!
                                            </text>
                                        </>
                                    )}
                                </g>
                            );
                        })}

                        {Object.entries(ladders).map(([f, t]) => (
                            <LadderSVG key={`L${f}`} from={+f} to={+t} />
                        ))}
                        {Object.entries(snakes).map(([f, t], i) => (
                            <SnakeSVG
                                key={`S${f}`}
                                from={+f}
                                to={+t}
                                themeIdx={i}
                                id={`${f}`}
                            />
                        ))}
                        <rect
                            width={SIZE}
                            height={SIZE}
                            fill="url(#vig)"
                            style={{ pointerEvents: "none" }}
                        />
                        {players.map((p, i) => (
                            <PlayerToken
                                key={p.id}
                                player={p}
                                index={i}
                                total={players.length}
                                lastRoll={lastRoll}
                                onMoveStart={onMoveStart}
                                onMoveEnd={onMoveEnd}
                            />
                        ))}
                    </svg>
                </div>
            </div>
        </div>
    );
};

export default Board;
