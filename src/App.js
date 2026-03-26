import React, { useState, useEffect, useCallback, useRef } from "react";
import io from "socket.io-client";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "framer-motion";
import Board, { PLAYER_COLORS, PLAYER_DARK } from "./Board";
import { generateLayout } from "./generateLayout";

// Fallback layout for toast detection before game data arrives
const FALLBACK = generateLayout();

const socket = io("http://localhost:3001");

// ─── Window size hook ─────────────────────────────────────────────────────────
function useWindowSize() {
    const [size, setSize] = useState({
        w: window.innerWidth,
        h: window.innerHeight,
    });
    useEffect(() => {
        const handler = () =>
            setSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, []);
    return size;
}

// ─── Breakpoints ──────────────────────────────────────────────────────────────
// mobile  : w < 640
// tablet  : 640 <= w < 1100
// desktop : w >= 1100
function useLayout() {
    const { w, h } = useWindowSize();
    // Board size: fill available space intelligently
    // Desktop: board = 560, sidebars 210 + 220 + 260 chat = 950 + gaps
    // Tablet:  board = min(w - 48, 480)
    // Mobile:  board = w - 32 (full width minus padding)
    let boardSize, layout;
    if (w >= 1100) {
        boardSize = Math.min(560, w - 980); // room for 3 sidebars
        boardSize = Math.max(420, boardSize);
        layout = "desktop";
    } else if (w >= 640) {
        boardSize = Math.min(w - 72, 500);
        boardSize = Math.max(300, boardSize);
        layout = "tablet";
    } else {
        // Board outer = boardSize + frame(12)*2 + border(3)*2 = boardSize+30
        // Page padding = 10px each side = 20px. Total = boardSize+50 <= w
        boardSize = w - 52;
        boardSize = Math.max(280, boardSize);
        layout = "mobile";
    }
    return { layout, boardSize, w, h };
}

// ─── Dice pips ────────────────────────────────────────────────────────────────
const PIPS = {
    0: [],
    1: [[50, 50]],
    2: [
        [30, 30],
        [70, 70],
    ],
    3: [
        [30, 30],
        [50, 50],
        [70, 70],
    ],
    4: [
        [30, 30],
        [70, 30],
        [30, 70],
        [70, 70],
    ],
    5: [
        [30, 30],
        [70, 30],
        [50, 50],
        [30, 70],
        [70, 70],
    ],
    6: [
        [30, 30],
        [70, 30],
        [30, 50],
        [70, 50],
        [30, 70],
        [70, 70],
    ],
};

function Dice({ value = 0, rolling, size = 80 }) {
    const pips = PIPS[Math.max(0, Math.min(6, value))] || [];
    return (
        <motion.div
            animate={
                rolling
                    ? {
                          rotateY: [0, 180, 360, 540],
                          rotateX: [0, 90, 0, -90, 0],
                          scale: [1, 0.8, 1.05, 0.95, 1],
                      }
                    : {}
            }
            transition={{ duration: 0.65, ease: "easeInOut" }}
            style={{
                width: size,
                height: size,
                borderRadius: size * 0.22,
                background: "linear-gradient(145deg,#f8f4ed,#d8cdb8)",
                boxShadow:
                    "inset 0 -6px 12px rgba(0,0,0,0.14),inset 0 3px 5px rgba(255,255,255,0.85),0 12px 35px rgba(0,0,0,0.55)",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <svg
                viewBox="0 0 100 100"
                width={size}
                height={size}
                style={{ position: "absolute" }}
            >
                {pips.map(([cx, cy], i) => (
                    <g key={i}>
                        <circle
                            cx={cx + 0.8}
                            cy={cy + 0.8}
                            r={10}
                            fill="rgba(0,0,0,0.1)"
                        />
                        <circle cx={cx} cy={cy} r={9.5} fill="#1e1340" />
                        <circle
                            cx={cx - 2.5}
                            cy={cy - 2.5}
                            r={3.5}
                            fill="rgba(255,255,255,0.14)"
                        />
                    </g>
                ))}
            </svg>
        </motion.div>
    );
}

// ─── Roll button ──────────────────────────────────────────────────────────────
function RollButton({
    active,
    color,
    dark,
    rolling,
    moving,
    onClick,
    size = 110,
}) {
    const disabled = !active || rolling || moving;
    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            whileHover={!disabled ? { scale: 1.07 } : {}}
            whileTap={!disabled ? { scale: 0.91 } : {}}
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                background: !disabled
                    ? `radial-gradient(circle at 36% 30%,${color}f0,${dark})`
                    : "radial-gradient(circle at 36% 30%,#2a2244,#16132b)",
                border: `3.5px solid ${!disabled ? color : "rgba(255,255,255,0.05)"}`,
                color: !disabled ? "white" : "#2e2850",
                fontSize: size * 0.12,
                fontWeight: "900",
                fontFamily: "Georgia,serif",
                letterSpacing: "0.07em",
                cursor: !disabled ? "pointer" : "default",
                boxShadow: !disabled
                    ? `0 0 0 8px ${color}1a,0 0 36px ${color}50,0 12px 32px rgba(0,0,0,0.55),inset 0 2px 0 rgba(255,255,255,0.28)`
                    : "0 4px 14px rgba(0,0,0,0.3)",
                transition: "all 0.3s",
                outline: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 3,
                position: "relative",
                overflow: "hidden",
            }}
        >
            {!disabled && (
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                        repeat: Infinity,
                        duration: 4,
                        ease: "linear",
                    }}
                    style={{
                        position: "absolute",
                        inset: -2,
                        borderRadius: "50%",
                        background: `conic-gradient(transparent 80%,${color}80 100%)`,
                        pointerEvents: "none",
                    }}
                />
            )}
            <span style={{ fontSize: size * 0.22, position: "relative" }}>
                🎲
            </span>
            <span style={{ fontSize: size * 0.12, position: "relative" }}>
                {rolling ? "…" : moving ? "MOVING" : !active ? "WAIT" : "ROLL"}
            </span>
        </motion.button>
    );
}

// ─── Player card ──────────────────────────────────────────────────────────────
function PlayerCard({ player, idx, isActive, isMe, compact }) {
    const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    const dark = PLAYER_DARK[idx % PLAYER_DARK.length];
    return (
        <motion.div
            layout
            animate={{ scale: isActive ? 1.02 : 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            style={{
                background: isActive
                    ? `linear-gradient(120deg,${color}18,${color}08)`
                    : "rgba(255,255,255,0.025)",
                border: `2px solid ${isActive ? color + "90" : "rgba(255,255,255,0.06)"}`,
                borderRadius: compact ? 12 : 16,
                padding: compact ? "8px 10px" : "11px 14px",
                display: "flex",
                alignItems: "center",
                gap: compact ? 8 : 12,
                position: "relative",
                overflow: "hidden",
                boxShadow: isActive ? `0 4px 20px ${color}22` : "none",
                transition: "border-color 0.3s,background 0.3s",
            }}
        >
            {isActive && (
                <motion.div
                    animate={{ x: [-240, 240] }}
                    transition={{
                        repeat: Infinity,
                        duration: 2.4,
                        ease: "linear",
                    }}
                    style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        width: 80,
                        background: `linear-gradient(90deg,transparent,${color}28,transparent)`,
                        pointerEvents: "none",
                    }}
                />
            )}
            <div
                style={{
                    width: compact ? 30 : 38,
                    height: compact ? 30 : 38,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: `linear-gradient(135deg,${color},${dark})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "900",
                    fontSize: compact ? 14 : 17,
                    color: "white",
                    boxShadow: isActive
                        ? `0 0 18px ${color}`
                        : "0 2px 8px rgba(0,0,0,0.3)",
                    border: isActive
                        ? "2px solid rgba(255,255,255,0.3)"
                        : "2px solid transparent",
                }}
            >
                {player.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontWeight: "bold",
                        fontSize: compact ? 12 : 14,
                        color: isActive ? "#fff" : "#9a8a7a",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {player.name}
                    {isMe && (
                        <span
                            style={{
                                fontSize: 8,
                                color,
                                background: `${color}22`,
                                border: `1px solid ${color}44`,
                                borderRadius: 4,
                                padding: "0 4px",
                                fontWeight: "bold",
                                flexShrink: 0,
                            }}
                        >
                            YOU
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 10, color: "#5a4a5a", marginTop: 1 }}>
                    Sq{" "}
                    <span
                        style={{
                            color: isActive ? color : "#7a6a7a",
                            fontWeight: "bold",
                        }}
                    >
                        {player.pos ?? 1}
                    </span>
                </div>
            </div>
            {isActive && (
                <motion.div
                    animate={{ scale: [1, 1.6, 1], opacity: [1, 0.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                    }}
                />
            )}
        </motion.div>
    );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, emoji, color, sub }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            style={{
                background: `linear-gradient(120deg,${color}18,${color}0c)`,
                border: `1.5px solid ${color}60`,
                borderRadius: 14,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: `0 8px 32px ${color}22`,
                width: "100%",
                boxSizing: "border-box",
            }}
        >
            <span style={{ fontSize: 22, flexShrink: 0 }}>{emoji}</span>
            <div style={{ minWidth: 0 }}>
                <div
                    style={{
                        color: "#e8dcc8",
                        fontSize: 13,
                        fontWeight: "bold",
                    }}
                >
                    {msg}
                </div>
                {sub && (
                    <div style={{ color, fontSize: 11, marginTop: 1 }}>
                        {sub}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────
function ChatBubble({ msg, isMe, playerIdx }) {
    const color =
        playerIdx >= 0 ? PLAYER_COLORS[playerIdx % PLAYER_COLORS.length] : null;
    if (msg.type === "system")
        return (
            <div style={{ textAlign: "center", padding: "3px 0" }}>
                <span
                    style={{
                        fontSize: 11,
                        color: "#4a3a6a",
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: 10,
                        padding: "3px 10px",
                    }}
                >
                    {msg.text}
                </span>
            </div>
        );
    if (msg.type === "event")
        return (
            <div style={{ textAlign: "center", padding: "3px 0" }}>
                <span
                    style={{
                        fontSize: 12,
                        color: "#8a7a6a",
                        fontStyle: "italic",
                    }}
                >
                    {msg.text}
                </span>
            </div>
        );
    return (
        <div
            style={{
                display: "flex",
                flexDirection: isMe ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: 5,
                marginBottom: 2,
            }}
        >
            <div
                style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: color || "#555",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: "bold",
                    color: "white",
                }}
            >
                {msg.senderName?.[0]?.toUpperCase()}
            </div>
            <div style={{ maxWidth: "74%" }}>
                {!isMe && (
                    <div
                        style={{
                            fontSize: 10,
                            color: color || "#888",
                            fontWeight: "bold",
                            marginBottom: 2,
                            marginLeft: 4,
                        }}
                    >
                        {msg.senderName}
                    </div>
                )}
                <div
                    style={{
                        background: isMe
                            ? `linear-gradient(135deg,${color}cc,${color}99)`
                            : "rgba(255,255,255,0.07)",
                        border: `1px solid ${isMe ? color + "60" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: isMe
                            ? "14px 14px 4px 14px"
                            : "14px 14px 14px 4px",
                        padding: "7px 11px",
                        fontSize: 13,
                        color: "#e8dcc8",
                        wordBreak: "break-word",
                        lineHeight: 1.4,
                        boxShadow: isMe ? `0 2px 12px ${color}30` : "none",
                    }}
                >
                    {msg.text}
                </div>
                <div
                    style={{
                        fontSize: 9,
                        color: "#3a2a4a",
                        marginTop: 2,
                        textAlign: isMe ? "right" : "left",
                        [isMe ? "marginRight" : "marginLeft"]: 4,
                    }}
                >
                    {new Date(msg.ts).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Chat panel ───────────────────────────────────────────────────────────────
function ChatPanel({ messages, onSend, myId, players, height = 480 }) {
    const [text, setText] = useState("");
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const submit = () => {
        const t = text.trim();
        if (!t) return;
        onSend(t);
        setText("");
        inputRef.current?.focus();
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                background: "linear-gradient(160deg,#14102a 0%,#0d0b1c 100%)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 22,
                overflow: "hidden",
                height,
                width: "100%",
            }}
        >
            <div
                style={{
                    padding: "12px 14px 8px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                }}
            >
                <span style={{ fontSize: 15 }}>💬</span>
                <span
                    style={{
                        color: "#3a2a5a",
                        fontSize: 10,
                        fontWeight: "bold",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                    }}
                >
                    Chat
                </span>
                <div
                    style={{
                        marginLeft: "auto",
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#22c55e",
                        boxShadow: "0 0 8px #22c55e",
                    }}
                />
            </div>
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "10px 10px 4px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                    scrollbarWidth: "thin",
                    scrollbarColor: "#2a1a4a transparent",
                }}
            >
                {messages.length === 0 && (
                    <div
                        style={{
                            textAlign: "center",
                            color: "#3a2a5a",
                            fontSize: 12,
                            marginTop: 16,
                        }}
                    >
                        No messages yet.
                        <br />
                        Say hello! 👋
                    </div>
                )}
                {messages.map((msg) => {
                    const isMe = msg.senderId === myId;
                    const pIdx = players.findIndex(
                        (p) => p.id === msg.senderId,
                    );
                    return (
                        <ChatBubble
                            key={msg.id}
                            msg={msg}
                            isMe={isMe}
                            playerIdx={pIdx}
                        />
                    );
                })}
                <div ref={bottomRef} />
            </div>
            <div
                style={{
                    padding: "8px 10px",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    gap: 7,
                    flexShrink: 0,
                }}
            >
                <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) =>
                        e.key === "Enter" && !e.shiftKey && submit()
                    }
                    placeholder="Message…"
                    maxLength={200}
                    style={{
                        flex: 1,
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: "8px 11px",
                        color: "#e8dcc8",
                        fontSize: 13,
                        fontFamily: "Georgia,serif",
                        outline: "none",
                    }}
                />
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.93 }}
                    onClick={submit}
                    style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        flexShrink: 0,
                        background: "linear-gradient(135deg,#6366f1,#4f46e5)",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        boxShadow: "0 2px 12px rgba(99,102,241,0.4)",
                    }}
                >
                    ➤
                </motion.button>
            </div>
        </div>
    );
}

// ─── Share modal ──────────────────────────────────────────────────────────────
function ShareModal({ roomId, onClose }) {
    const [copied, setCopied] = useState(null);
    const link = `${window.location.origin}?room=${roomId}`;
    const copy = (value, type) => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(type);
            setTimeout(() => setCopied(null), 2000);
        });
    };
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.75)",
                backdropFilter: "blur(6px)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
            }}
        >
            <motion.div
                initial={{ scale: 0.85, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    background:
                        "linear-gradient(160deg,#1a0e35 0%,#0e0b1f 100%)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 24,
                    padding: "32px 28px",
                    width: "100%",
                    maxWidth: 420,
                    boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
                    fontFamily: "Georgia,serif",
                    position: "relative",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        background:
                            "linear-gradient(90deg,transparent,#d97706,#fde68a,#d97706,transparent)",
                        borderRadius: "24px 24px 0 0",
                    }}
                />
                <button
                    onClick={onClose}
                    style={{
                        position: "absolute",
                        top: 14,
                        right: 14,
                        background: "rgba(255,255,255,0.06)",
                        border: "none",
                        borderRadius: 8,
                        width: 28,
                        height: 28,
                        cursor: "pointer",
                        color: "#9a8a7a",
                        fontSize: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    ✕
                </button>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🔗</div>
                    <h2
                        style={{
                            margin: 0,
                            color: "#fde68a",
                            fontSize: 19,
                            fontWeight: "bold",
                            letterSpacing: "0.12em",
                        }}
                    >
                        Invite Friends
                    </h2>
                    <p style={{ color: "#5a4a6a", fontSize: 12, marginTop: 5 }}>
                        Share to play together
                    </p>
                </div>
                <div style={{ marginBottom: 14 }}>
                    <div
                        style={{
                            color: "#3a2a5a",
                            fontSize: 10,
                            fontWeight: "bold",
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            marginBottom: 7,
                        }}
                    >
                        Room Code
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <div
                            style={{
                                flex: 1,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 12,
                                padding: "11px 14px",
                                fontSize: 18,
                                fontWeight: "bold",
                                color: "#fde68a",
                                letterSpacing: "0.3em",
                                textAlign: "center",
                            }}
                        >
                            {roomId}
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => copy(roomId, "code")}
                            style={{
                                ...CBS,
                                background:
                                    copied === "code"
                                        ? "#059669"
                                        : "rgba(255,255,255,0.07)",
                            }}
                        >
                            {copied === "code" ? "✓" : "⎘"}
                        </motion.button>
                    </div>
                </div>
                <div style={{ marginBottom: 22 }}>
                    <div
                        style={{
                            color: "#3a2a5a",
                            fontSize: 10,
                            fontWeight: "bold",
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            marginBottom: 7,
                        }}
                    >
                        Share Link
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <div
                            style={{
                                flex: 1,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 12,
                                padding: "11px 12px",
                                fontSize: 11,
                                color: "#9a8a7a",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {link}
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => copy(link, "link")}
                            style={{
                                ...CBS,
                                background:
                                    copied === "link"
                                        ? "#059669"
                                        : "rgba(255,255,255,0.07)",
                            }}
                        >
                            {copied === "link" ? "✓" : "⎘"}
                        </motion.button>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    {[
                        {
                            label: "WhatsApp",
                            color: "#25D366",
                            emoji: "💬",
                            url: `https://wa.me/?text=${encodeURIComponent(`Join my Snakes & Ladders game!\nRoom: ${roomId}\n${link}`)}`,
                        },
                        {
                            label: "Telegram",
                            color: "#2CA5E0",
                            emoji: "✈️",
                            url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Join my Snakes & Ladders! Room: ${roomId}`)}`,
                        },
                        {
                            label: "Copy",
                            color: "#6366f1",
                            emoji: "📋",
                            onClick: () => copy(link, "link"),
                        },
                    ].map(({ label, color, emoji, url, onClick }) => (
                        <motion.a
                            key={label}
                            href={url}
                            target={url ? "_blank" : undefined}
                            rel="noopener noreferrer"
                            onClick={onClick}
                            whileHover={{ scale: 1.05, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                                flex: 1,
                                background: `${color}22`,
                                border: `1px solid ${color}50`,
                                borderRadius: 12,
                                padding: "10px 6px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 4,
                                textDecoration: "none",
                                cursor: "pointer",
                            }}
                        >
                            <span style={{ fontSize: 18 }}>{emoji}</span>
                            <span
                                style={{
                                    fontSize: 11,
                                    color,
                                    fontWeight: "bold",
                                }}
                            >
                                {label}
                            </span>
                        </motion.a>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}
const CBS = {
    width: 42,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)",
    color: "white",
    cursor: "pointer",
    fontSize: 17,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 10px",
    transition: "background 0.2s",
    flexShrink: 0,
};

// ─── Bottom sheet (mobile chat/controls drawer) ───────────────────────────────
function BottomSheet({ title, icon, onClose, children }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(4px)",
                zIndex: 200,
            }}
        >
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background:
                        "linear-gradient(160deg,#1a102e 0%,#0e0b1c 100%)",
                    borderRadius: "20px 20px 0 0",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderBottom: "none",
                    maxHeight: "80vh",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
                }}
            >
                {/* Handle */}
                <div
                    style={{
                        padding: "12px 0 4px",
                        display: "flex",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    <div
                        style={{
                            width: 40,
                            height: 4,
                            borderRadius: 2,
                            background: "rgba(255,255,255,0.15)",
                        }}
                    />
                </div>
                <div
                    style={{
                        padding: "4px 16px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <span
                        style={{
                            color: "#fde68a",
                            fontFamily: "Georgia,serif",
                            fontWeight: "bold",
                            fontSize: 15,
                        }}
                    >
                        {title}
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            marginLeft: "auto",
                            background: "rgba(255,255,255,0.07)",
                            border: "none",
                            borderRadius: 8,
                            width: 28,
                            height: 28,
                            cursor: "pointer",
                            color: "#9a8a7a",
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        ✕
                    </button>
                </div>
                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "0 12px 16px",
                    }}
                >
                    {children}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
    const { layout, boardSize, w } = useLayout();
    const isMobile = layout === "mobile";
    const isTablet = layout === "tablet";
    const isDesktop = layout === "desktop";

    const [roomId, setRoomId] = useState("");
    const [name, setName] = useState("");
    const [game, setGame] = useState(null);
    const [isJoined, setIsJoined] = useState(false);
    const [error, setError] = useState("");
    const [rolling, setRolling] = useState(false);
    const [moving, setMoving] = useState(false);
    const [toast, setToast] = useState(null);
    const [messages, setMessages] = useState([]);
    const [showShare, setShowShare] = useState(false);
    const [sheet, setSheet] = useState(null); // "chat" | "players" | null
    const toastTimer = useRef(null);
    const prevGameRef = useRef(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const r = params.get("room");
        if (r) setRoomId(r.toUpperCase());
    }, []);

    const showToast = (msg, emoji, color, sub) => {
        setToast({ msg, emoji, color, sub });
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        socket.on("game_update", (data) => {
            const prev = prevGameRef.current;
            prevGameRef.current = data;
            if (
                prev?.status === "playing" &&
                data.status === "playing" &&
                data.lastMover
            ) {
                const prevP = prev.players.find((p) => p.id === data.lastMover);
                const newP = data.players.find((p) => p.id === data.lastMover);
                if (prevP && newP && prevP.pos !== newP.pos) {
                    const fp = newP.pos;
                    const sl = data.snakes || FALLBACK.snakes;
                    const ll = data.ladders || FALLBACK.ladders;
                    const wasSnake = Object.entries(sl).find(
                        ([, t]) => +t === fp,
                    );
                    const wasLadder = Object.entries(ll).find(
                        ([, t]) => +t === fp,
                    );
                    if (wasSnake)
                        setTimeout(
                            () =>
                                showToast(
                                    `${newP.name} got bitten!`,
                                    "🐍",
                                    "#ef4444",
                                    `Slid from ${wasSnake[0]} → ${fp}`,
                                ),
                            (data.lastRoll ?? 1) * 160 + 300,
                        );
                    else if (wasLadder)
                        setTimeout(
                            () =>
                                showToast(
                                    `${newP.name} climbed!`,
                                    "🪜",
                                    "#22c55e",
                                    `Jumped from ${wasLadder[0]} → ${fp}`,
                                ),
                            (data.lastRoll ?? 1) * 160 + 300,
                        );
                }
            }
            setGame(data);
            setError("");
        });
        socket.on("chat_message", (msg) =>
            setMessages((prev) => [...prev, msg]),
        );
        socket.on("room_created", (id) => setRoomId(id));
        socket.on("winner", () => {
            const fire = (a, o) =>
                confetti({
                    particleCount: 130,
                    angle: a,
                    spread: 85,
                    origin: o,
                    colors: PLAYER_COLORS.concat(["#fde68a", "#fff"]),
                });
            fire(90, { x: 0.5, y: 0.5 });
            setTimeout(() => fire(60, { x: 0, y: 0.7 }), 350);
            setTimeout(() => fire(120, { x: 1, y: 0.7 }), 550);
        });
        socket.on("error", (msg) => setError(msg));
        return () => {
            socket.off("game_update");
            socket.off("chat_message");
            socket.off("room_created");
            socket.off("winner");
            socket.off("error");
        };
    }, []);

    const handleCreate = () => socket.emit("create_room");
    const handleJoin = () => {
        if (!name.trim() || !roomId.trim()) {
            setError("Name and Room ID required");
            return;
        }
        socket.emit("join_room", { roomId, playerName: name.trim() });
        setIsJoined(true);
        window.history.replaceState({}, "", `?room=${roomId}`);
    };
    const handleRoll = useCallback(() => {
        if (rolling || moving) return;
        setRolling(true);
        socket.emit("roll_dice", { roomId });
        setTimeout(() => setRolling(false), 700);
    }, [roomId, rolling, moving]);
    const handleStart = () => socket.emit("start_game", roomId);
    const handleSend = (text) => socket.emit("send_message", { roomId, text });

    const currentPlayer = game?.players[game?.turnIndex];
    const isMyTurn = currentPlayer?.id === socket.id;
    const myIdx = game?.players?.findIndex((p) => p.id === socket.id) ?? 0;
    const myColor = PLAYER_COLORS[Math.max(0, myIdx) % PLAYER_COLORS.length];
    const myDark = PLAYER_DARK[Math.max(0, myIdx) % PLAYER_DARK.length];
    const unread = 0; // could track if chat is closed

    // ── Lobby ──────────────────────────────────────────────────────────────────
    if (!isJoined) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    background:
                        "radial-gradient(ellipse at 28% 22%,#180530 0%,#07060f 68%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Georgia,serif",
                    padding: 16,
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0.03,
                        backgroundImage:
                            "repeating-linear-gradient(0deg,#fff 0,transparent 1px,transparent 62px),repeating-linear-gradient(90deg,#fff 0,transparent 1px,transparent 62px)",
                        backgroundSize: "62px 62px",
                    }}
                />
                {[
                    {
                        e: "🐍",
                        top: "10%",
                        left: "6%",
                        size: isMobile ? 36 : 56,
                        dur: 3.5,
                    },
                    {
                        e: "🎲",
                        top: "18%",
                        left: "83%",
                        size: isMobile ? 40 : 60,
                        dur: 3.1,
                    },
                    {
                        e: "🪜",
                        top: "72%",
                        left: "88%",
                        size: isMobile ? 30 : 46,
                        dur: 4.2,
                    },
                    {
                        e: "🏆",
                        top: "78%",
                        left: "5%",
                        size: isMobile ? 28 : 42,
                        dur: 4.8,
                    },
                ].map(({ e, top, left, size, dur }) => (
                    <motion.div
                        key={e}
                        animate={{ y: [0, -18, 0], rotate: [0, 8, -8, 0] }}
                        transition={{
                            repeat: Infinity,
                            duration: dur,
                            ease: "easeInOut",
                        }}
                        style={{
                            position: "absolute",
                            top,
                            left,
                            fontSize: size,
                            opacity: 0.07,
                            userSelect: "none",
                        }}
                    >
                        {e}
                    </motion.div>
                ))}
                <motion.div
                    initial={{ opacity: 0, y: 32, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        background:
                            "linear-gradient(160deg,#1a0e35 0%,#0e0b1f 100%)",
                        border: "1px solid rgba(255,255,255,0.09)",
                        borderRadius: 28,
                        padding: isMobile ? "36px 24px 28px" : "48px 40px 40px",
                        width: "100%",
                        maxWidth: 420,
                        boxShadow: "0 60px 140px rgba(0,0,0,0.85)",
                        position: "relative",
                        zIndex: 1,
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 3,
                            background:
                                "linear-gradient(90deg,transparent,#d97706,#fde68a,#d97706,transparent)",
                            borderRadius: "28px 28px 0 0",
                        }}
                    />
                    <div style={{ textAlign: "center", marginBottom: 32 }}>
                        <motion.div
                            animate={{ rotate: [0, 6, -6, 0] }}
                            transition={{
                                repeat: Infinity,
                                duration: 4.5,
                                ease: "easeInOut",
                            }}
                            style={{
                                fontSize: isMobile ? 44 : 54,
                                display: "inline-block",
                                marginBottom: 10,
                            }}
                        >
                            🐍
                        </motion.div>
                        <h1
                            style={{
                                margin: 0,
                                color: "#fde68a",
                                fontSize: isMobile ? 20 : 24,
                                fontWeight: "bold",
                                letterSpacing: "0.18em",
                                textTransform: "uppercase",
                                textShadow: "0 2px 24px rgba(253,230,138,0.45)",
                            }}
                        >
                            Snakes &amp; Ladders
                        </h1>
                        <p
                            style={{
                                color: "#6a5040",
                                margin: "7px 0 0",
                                fontSize: 11,
                                letterSpacing: "0.08em",
                            }}
                        >
                            The Classic Board Game · 2–4 Players
                        </p>
                    </div>
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0 }}
                                style={{
                                    background: "rgba(239,68,68,0.1)",
                                    border: "1px solid rgba(239,68,68,0.3)",
                                    color: "#fca5a5",
                                    borderRadius: 12,
                                    padding: "10px 14px",
                                    marginBottom: 16,
                                    fontSize: 13,
                                    textAlign: "center",
                                }}
                            >
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                            placeholder="Your nickname"
                            style={IS}
                        />
                        <button onClick={handleCreate} style={SBS}>
                            ✦ &ensp;Generate Room Code
                        </button>
                        <div style={{ display: "flex", gap: 10 }}>
                            <input
                                value={roomId}
                                onChange={(e) =>
                                    setRoomId(e.target.value.toUpperCase())
                                }
                                onKeyDown={(e) =>
                                    e.key === "Enter" && handleJoin()
                                }
                                placeholder="ROOM CODE"
                                style={{
                                    ...IS,
                                    flex: 1,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.2em",
                                    textAlign: "center",
                                    fontSize: 16,
                                }}
                            />
                            <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={handleJoin}
                                style={PBS}
                            >
                                Join →
                            </motion.button>
                        </div>
                    </div>
                    <div
                        style={{
                            marginTop: 24,
                            display: "flex",
                            justifyContent: "center",
                            gap: 10,
                        }}
                    >
                        {PLAYER_COLORS.map((c, i) => (
                            <div
                                key={i}
                                style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: "50%",
                                    background: `linear-gradient(135deg,${c},${PLAYER_DARK[i]})`,
                                    boxShadow: `0 0 12px ${c}60`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 11,
                                    fontWeight: "bold",
                                    color: "white",
                                    border: "2px solid rgba(255,255,255,0.2)",
                                }}
                            >
                                {["I", "E", "A", "R"][i]}
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        );
    }

    // ── Shared controls panel content ──────────────────────────────────────────
    const ControlsContent = ({ compact = false }) => (
        <>
            {game?.status === "playing" ? (
                <>
                    {!compact && (
                        <div
                            style={{
                                width: "100%",
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.07)",
                                borderRadius: 14,
                                padding: "12px 14px",
                                textAlign: "center",
                                marginBottom: 4,
                            }}
                        >
                            <div
                                style={{
                                    color: "#3a2a5a",
                                    fontSize: 10,
                                    fontWeight: "bold",
                                    letterSpacing: "0.15em",
                                    textTransform: "uppercase",
                                    marginBottom: 6,
                                }}
                            >
                                Current Turn
                            </div>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={game.turnIndex}
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    style={{
                                        color: PLAYER_COLORS[
                                            game.turnIndex %
                                                PLAYER_COLORS.length
                                        ],
                                        fontWeight: "bold",
                                        fontSize: 16,
                                        textShadow: `0 0 20px ${PLAYER_COLORS[game.turnIndex % PLAYER_COLORS.length]}`,
                                    }}
                                >
                                    {currentPlayer?.name}
                                    {isMyTurn && (
                                        <motion.div
                                            animate={{ opacity: [0.5, 1, 0.5] }}
                                            transition={{
                                                repeat: Infinity,
                                                duration: 1.6,
                                            }}
                                            style={{
                                                fontSize: 11,
                                                color: "rgba(255,255,255,0.4)",
                                                marginTop: 3,
                                                fontWeight: "normal",
                                            }}
                                        >
                                            Your turn!
                                        </motion.div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: compact ? 16 : 12,
                            flexDirection: compact ? "row" : "column",
                            width: "100%",
                        }}
                    >
                        <div
                            style={{
                                background: "rgba(0,0,0,0.3)",
                                borderRadius: 16,
                                padding: compact ? "12px 16px" : "16px 20px",
                                border: "1px solid rgba(255,255,255,0.05)",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            <Dice
                                value={game.lastRoll || 0}
                                rolling={rolling}
                                size={compact ? 68 : 80}
                            />
                            <AnimatePresence mode="wait">
                                {game.lastRoll > 0 && (
                                    <motion.div
                                        key={game.lastRoll}
                                        initial={{ scale: 0.4, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        style={{
                                            fontSize: 11,
                                            color: "#a09080",
                                            textAlign: "center",
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 24,
                                                fontWeight: "bold",
                                                color: "#fde68a",
                                                display: "block",
                                            }}
                                        >
                                            {game.lastRoll}
                                        </span>
                                        {game.lastRoll === 6
                                            ? "🎉 Roll again!"
                                            : game.lastRoll === 1
                                              ? "Unlucky…"
                                              : ""}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <RollButton
                            active={isMyTurn}
                            color={myColor}
                            dark={myDark}
                            rolling={rolling}
                            moving={moving}
                            onClick={handleRoll}
                            size={compact ? 90 : 110}
                        />
                    </div>

                    <AnimatePresence>
                        {moving && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    color: "#a09080",
                                    fontSize: 12,
                                    justifyContent: "center",
                                }}
                            >
                                <motion.span
                                    animate={{ x: [0, 5, 0, -5, 0] }}
                                    transition={{
                                        repeat: Infinity,
                                        duration: 0.5,
                                    }}
                                >
                                    🎯
                                </motion.span>
                                Moving…
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div style={{ width: "100%" }}>
                        <AnimatePresence>
                            {toast && <Toast key={toast.msg} {...toast} />}
                        </AnimatePresence>
                    </div>

                    {!compact && (
                        <div
                            style={{
                                width: "100%",
                                borderTop: "1px solid rgba(255,255,255,0.05)",
                                paddingTop: 14,
                            }}
                        >
                            <div
                                style={{
                                    color: "#3a2a5a",
                                    fontSize: 10,
                                    fontWeight: "bold",
                                    letterSpacing: "0.18em",
                                    textTransform: "uppercase",
                                    marginBottom: 10,
                                }}
                            >
                                Standings
                            </div>
                            {[...game.players]
                                .sort((a, b) => (b.pos ?? 1) - (a.pos ?? 1))
                                .map((p, rank) => {
                                    const i = game.players.indexOf(p);
                                    const c =
                                        PLAYER_COLORS[i % PLAYER_COLORS.length];
                                    return (
                                        <div
                                            key={p.id}
                                            style={{ marginBottom: 9 }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    marginBottom: 3,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 13,
                                                        width: 18,
                                                    }}
                                                >
                                                    {"🥇🥈🥉"[rank] || "·"}
                                                </span>
                                                <div
                                                    style={{
                                                        width: 7,
                                                        height: 7,
                                                        borderRadius: "50%",
                                                        background: c,
                                                    }}
                                                />
                                                <span
                                                    style={{
                                                        color: "#9a8a7a",
                                                        fontSize: 12,
                                                        flex: 1,
                                                        overflow: "hidden",
                                                        textOverflow:
                                                            "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {p.name}
                                                </span>
                                                <span
                                                    style={{
                                                        color: c,
                                                        fontWeight: "bold",
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    {p.pos ?? 1}
                                                </span>
                                            </div>
                                            <div
                                                style={{
                                                    height: 3,
                                                    background:
                                                        "rgba(255,255,255,0.05)",
                                                    borderRadius: 2,
                                                    overflow: "hidden",
                                                }}
                                            >
                                                <motion.div
                                                    animate={{
                                                        width: `${Math.round(((p.pos ?? 1) / 100) * 100)}%`,
                                                    }}
                                                    transition={{
                                                        duration: 0.5,
                                                    }}
                                                    style={{
                                                        height: "100%",
                                                        background: c,
                                                        borderRadius: 2,
                                                        boxShadow: `0 0 5px ${c}`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </>
            ) : game?.status === "finished" ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                    <motion.div
                        animate={{
                            rotate: [0, 12, -12, 0],
                            scale: [1, 1.2, 1],
                        }}
                        transition={{ repeat: Infinity, duration: 2.2 }}
                        style={{ fontSize: 60, marginBottom: 12 }}
                    >
                        🏆
                    </motion.div>
                    <div
                        style={{
                            color: "#fde68a",
                            fontWeight: "bold",
                            fontSize: 20,
                            textShadow: "0 0 28px rgba(253,230,138,0.55)",
                        }}
                    >
                        {game.players.find((p) => (p.pos ?? 1) >= 100)?.name ??
                            "Winner!"}
                    </div>
                    <div
                        style={{ color: "#6a5040", fontSize: 12, marginTop: 5 }}
                    >
                        wins the game!
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2.4 }}
                        style={{ fontSize: 36, marginBottom: 12 }}
                    >
                        ⏳
                    </motion.div>
                    <div
                        style={{
                            color: "#4a3a6a",
                            fontWeight: "bold",
                            fontSize: 13,
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                        }}
                    >
                        Waiting…
                    </div>
                    {game?.status === "waiting" && (
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={handleStart}
                            style={{
                                marginTop: 14,
                                background:
                                    "linear-gradient(135deg,#10b981,#059669)",
                                color: "white",
                                border: "none",
                                borderRadius: 12,
                                padding: "11px 20px",
                                fontWeight: "bold",
                                fontSize: 14,
                                fontFamily: "Georgia,serif",
                                cursor: "pointer",
                                boxShadow: "0 4px 24px rgba(16,185,129,0.5)",
                            }}
                        >
                            ▶ Start Game
                        </motion.button>
                    )}
                </div>
            )}
        </>
    );

    // ── Game screen ─────────────────────────────────────────────────────────────
    return (
        <div
            style={{
                minHeight: "100vh",
                background:
                    "radial-gradient(ellipse at 22% 12%,#1a0530 0%,#06050e 72%)",
                fontFamily: "Georgia,serif",
                color: "#e8dcc8",
                padding: isMobile ? "10px 10px 86px" : "18px 14px 36px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                overflow: "hidden",
                boxSizing: "border-box",
                width: "100vw",
                maxWidth: "100%",
            }}
        >
            {/* ── Header ── */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    marginBottom: 16,
                    flexWrap: "wrap",
                    width: "100%",
                    maxWidth: 1400,
                }}
            >
                <h1
                    style={{
                        margin: 0,
                        fontSize: isMobile ? 16 : 20,
                        fontWeight: "bold",
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: "#fde68a",
                        textShadow: "0 0 28px rgba(253,230,138,0.4)",
                    }}
                >
                    🐍 Snakes &amp; Ladders 🪜
                </h1>
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 18,
                        padding: "4px 12px",
                        fontSize: 11,
                        color: "#6a5868",
                    }}
                >
                    ROOM &nbsp;
                    <span
                        style={{
                            fontWeight: "bold",
                            letterSpacing: "0.2em",
                            color: "#fde68a",
                            background: "rgba(253,230,138,0.08)",
                            borderRadius: 5,
                            padding: "1px 7px",
                        }}
                    >
                        {roomId}
                    </span>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowShare(true)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "linear-gradient(135deg,#6366f1,#4f46e5)",
                        color: "white",
                        border: "none",
                        borderRadius: 18,
                        padding: "6px 14px",
                        fontWeight: "bold",
                        fontSize: 12,
                        fontFamily: "Georgia,serif",
                        cursor: "pointer",
                        boxShadow: "0 4px 20px rgba(99,102,241,0.45)",
                    }}
                >
                    🔗 Share
                </motion.button>
            </motion.header>

            {/* ══ DESKTOP layout ═══════════════════════════════════════════════════ */}
            {isDesktop && (
                <div
                    style={{
                        display: "flex",
                        gap: 16,
                        alignItems: "flex-start",
                        justifyContent: "center",
                        width: "100%",
                        maxWidth: 1400,
                    }}
                >
                    {/* Players */}
                    <motion.aside
                        initial={{ opacity: 0, x: -28 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        style={{ ...PANEL, width: 210, flexShrink: 0 }}
                    >
                        <SectionLabel icon="👥" label="Players" />
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 7,
                            }}
                        >
                            {game?.players.map((p, i) => (
                                <PlayerCard
                                    key={p.id}
                                    player={p}
                                    idx={i}
                                    isActive={i === game.turnIndex}
                                    isMe={p.id === socket.id}
                                />
                            ))}
                        </div>
                        <Legend />
                        {game?.status === "waiting" && (
                            <StartBtn onClick={handleStart} />
                        )}
                    </motion.aside>

                    {/* Board */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.88 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        style={{ flexShrink: 0 }}
                    >
                        <Board
                            players={game?.players || []}
                            lastRoll={game?.lastRoll || 0}
                            boardSize={boardSize}
                            snakes={game?.snakes || FALLBACK.snakes}
                            ladders={game?.ladders || FALLBACK.ladders}
                            onMoveStart={() => setMoving(true)}
                            onMoveEnd={() => setMoving(false)}
                        />
                    </motion.div>

                    {/* Controls */}
                    <motion.aside
                        initial={{ opacity: 0, x: 28 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        style={{
                            ...PANEL,
                            width: 214,
                            flexShrink: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 16,
                        }}
                    >
                        <ControlsContent />
                    </motion.aside>

                    {/* Chat */}
                    <motion.div
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 }}
                        style={{ width: 250, flexShrink: 0 }}
                    >
                        <ChatPanel
                            messages={messages}
                            onSend={handleSend}
                            myId={socket.id}
                            players={game?.players || []}
                            height={Math.max(400, boardSize + 60)}
                        />
                    </motion.div>
                </div>
            )}

            {/* ══ TABLET layout ════════════════════════════════════════════════════ */}
            {isTablet && (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 14,
                        width: "100%",
                        maxWidth: 620,
                    }}
                >
                    {/* Board full width */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{ flexShrink: 0 }}
                    >
                        <Board
                            players={game?.players || []}
                            lastRoll={game?.lastRoll || 0}
                            boardSize={boardSize}
                            snakes={game?.snakes || FALLBACK.snakes}
                            ladders={game?.ladders || FALLBACK.ladders}
                            onMoveStart={() => setMoving(true)}
                            onMoveEnd={() => setMoving(false)}
                        />
                    </motion.div>

                    {/* Controls row */}
                    <div
                        style={{
                            display: "flex",
                            gap: 12,
                            width: "100%",
                            maxWidth: boardSize + 60,
                        }}
                    >
                        {/* Players left */}
                        <div style={{ ...PANEL, flex: 1, minWidth: 0 }}>
                            <SectionLabel icon="👥" label="Players" />
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                }}
                            >
                                {game?.players.map((p, i) => (
                                    <PlayerCard
                                        key={p.id}
                                        player={p}
                                        idx={i}
                                        compact
                                        isActive={i === game.turnIndex}
                                        isMe={p.id === socket.id}
                                    />
                                ))}
                            </div>
                            {game?.status === "waiting" && (
                                <StartBtn onClick={handleStart} />
                            )}
                        </div>
                        {/* Controls right */}
                        <div
                            style={{
                                ...PANEL,
                                flex: 1,
                                minWidth: 0,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 12,
                            }}
                        >
                            <ControlsContent compact />
                        </div>
                    </div>

                    {/* Chat below */}
                    <div style={{ width: "100%", maxWidth: boardSize + 60 }}>
                        <ChatPanel
                            messages={messages}
                            onSend={handleSend}
                            myId={socket.id}
                            players={game?.players || []}
                            height={280}
                        />
                    </div>
                </div>
            )}

            {/* ══ MOBILE layout ════════════════════════════════════════════════════ */}
            {isMobile && (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                    }}
                >
                    {/* Current turn + dice bar */}
                    {game?.status === "playing" && (
                        <div
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.07)",
                                borderRadius: 14,
                                padding: "10px 12px",
                                boxSizing: "border-box",
                            }}
                        >
                            {/* Turn name */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                    style={{
                                        color: "#3a2a5a",
                                        fontSize: 9,
                                        fontWeight: "bold",
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                        marginBottom: 2,
                                    }}
                                >
                                    Current Turn
                                </div>
                                <div
                                    style={{
                                        color: PLAYER_COLORS[
                                            game.turnIndex %
                                                PLAYER_COLORS.length
                                        ],
                                        fontWeight: "bold",
                                        fontSize: 14,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        textShadow: `0 0 14px ${PLAYER_COLORS[game.turnIndex % PLAYER_COLORS.length]}`,
                                    }}
                                >
                                    {currentPlayer?.name}
                                    {isMyTurn && (
                                        <span
                                            style={{
                                                fontSize: 10,
                                                color: "rgba(255,255,255,0.35)",
                                                marginLeft: 5,
                                            }}
                                        >
                                            — you!
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Last roll */}
                            {game.lastRoll > 0 && (
                                <div
                                    style={{
                                        textAlign: "center",
                                        flexShrink: 0,
                                    }}
                                >
                                    <Dice
                                        value={game.lastRoll}
                                        rolling={rolling}
                                        size={40}
                                    />
                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: "#fde68a",
                                            fontWeight: "bold",
                                            marginTop: 1,
                                        }}
                                    >
                                        {game.lastRoll}
                                    </div>
                                </div>
                            )}
                            {/* Roll button */}
                            <RollButton
                                active={isMyTurn}
                                color={myColor}
                                dark={myDark}
                                rolling={rolling}
                                moving={moving}
                                onClick={handleRoll}
                                size={60}
                            />
                        </div>
                    )}

                    {/* Toast */}
                    <div style={{ width: "100%" }}>
                        <AnimatePresence>
                            {toast && <Toast key={toast.msg} {...toast} />}
                        </AnimatePresence>
                    </div>

                    {/* Board */}
                    <Board
                        players={game?.players || []}
                        lastRoll={game?.lastRoll || 0}
                        boardSize={boardSize}
                        snakes={game?.snakes || FALLBACK.snakes}
                        ladders={game?.ladders || FALLBACK.ladders}
                        compact
                        onMoveStart={() => setMoving(true)}
                        onMoveEnd={() => setMoving(false)}
                    />

                    {game?.status === "waiting" && (
                        <StartBtn onClick={handleStart} fullWidth />
                    )}
                </div>
            )}

            {/* ── Mobile FAB bar ── */}
            {isMobile && (
                <div
                    style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background:
                            "linear-gradient(180deg,transparent 0%,rgba(6,5,14,0.97) 30%)",
                        padding: "8px 16px 20px",
                        display: "flex",
                        gap: 10,
                        zIndex: 100,
                        justifyContent: "center",
                    }}
                >
                    {[
                        {
                            icon: "👥",
                            label: "Players",
                            sub: game?.players?.length || 0,
                            sheet: "players",
                        },
                        {
                            icon: "💬",
                            label: "Chat",
                            sub: messages.length,
                            sheet: "chat",
                        },
                        {
                            icon: "🔗",
                            label: "Share",
                            onClick: () => setShowShare(true),
                        },
                    ].map((btn) => (
                        <motion.button
                            key={btn.label}
                            whileTap={{ scale: 0.93 }}
                            onClick={btn.onClick || (() => setSheet(btn.sheet))}
                            style={{
                                flex: 1,
                                background: "rgba(255,255,255,0.07)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 14,
                                padding: "10px 6px",
                                color: "#e8dcc8",
                                fontFamily: "Georgia,serif",
                                fontSize: 12,
                                fontWeight: "bold",
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 4,
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{btn.icon}</span>
                            <span style={{ fontSize: 10, color: "#7a6a8a" }}>
                                {btn.label}
                            </span>
                        </motion.button>
                    ))}
                </div>
            )}

            {/* ── Mobile bottom sheets ── */}
            <AnimatePresence>
                {isMobile && sheet === "players" && (
                    <BottomSheet
                        title="Players"
                        icon="👥"
                        onClose={() => setSheet(null)}
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                                paddingBottom: 8,
                            }}
                        >
                            {game?.players.map((p, i) => (
                                <PlayerCard
                                    key={p.id}
                                    player={p}
                                    idx={i}
                                    isActive={i === game.turnIndex}
                                    isMe={p.id === socket.id}
                                />
                            ))}
                        </div>
                        <Legend />
                        {game?.status === "waiting" && (
                            <StartBtn
                                onClick={() => {
                                    handleStart();
                                    setSheet(null);
                                }}
                                fullWidth
                            />
                        )}
                        {game?.status === "playing" && (
                            <div style={{ marginTop: 12 }}>
                                <div
                                    style={{
                                        color: "#3a2a5a",
                                        fontSize: 10,
                                        fontWeight: "bold",
                                        letterSpacing: "0.15em",
                                        textTransform: "uppercase",
                                        marginBottom: 8,
                                    }}
                                >
                                    Standings
                                </div>
                                {[...game.players]
                                    .sort((a, b) => (b.pos ?? 1) - (a.pos ?? 1))
                                    .map((p, rank) => {
                                        const i = game.players.indexOf(p);
                                        const c =
                                            PLAYER_COLORS[
                                                i % PLAYER_COLORS.length
                                            ];
                                        return (
                                            <div
                                                key={p.id}
                                                style={{ marginBottom: 8 }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        marginBottom: 3,
                                                    }}
                                                >
                                                    <span
                                                        style={{ fontSize: 13 }}
                                                    >
                                                        {"🥇🥈🥉"[rank] || "·"}
                                                    </span>
                                                    <div
                                                        style={{
                                                            width: 7,
                                                            height: 7,
                                                            borderRadius: "50%",
                                                            background: c,
                                                        }}
                                                    />
                                                    <span
                                                        style={{
                                                            color: "#9a8a7a",
                                                            fontSize: 12,
                                                            flex: 1,
                                                            overflow: "hidden",
                                                            textOverflow:
                                                                "ellipsis",
                                                            whiteSpace:
                                                                "nowrap",
                                                        }}
                                                    >
                                                        {p.name}
                                                    </span>
                                                    <span
                                                        style={{
                                                            color: c,
                                                            fontWeight: "bold",
                                                            fontSize: 11,
                                                        }}
                                                    >
                                                        {p.pos ?? 1}
                                                    </span>
                                                </div>
                                                <div
                                                    style={{
                                                        height: 3,
                                                        background:
                                                            "rgba(255,255,255,0.05)",
                                                        borderRadius: 2,
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    <motion.div
                                                        animate={{
                                                            width: `${Math.round(((p.pos ?? 1) / 100) * 100)}%`,
                                                        }}
                                                        transition={{
                                                            duration: 0.5,
                                                        }}
                                                        style={{
                                                            height: "100%",
                                                            background: c,
                                                            borderRadius: 2,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </BottomSheet>
                )}
                {isMobile && sheet === "chat" && (
                    <BottomSheet
                        title="Chat"
                        icon="💬"
                        onClose={() => setSheet(null)}
                    >
                        <ChatPanel
                            messages={messages}
                            onSend={handleSend}
                            myId={socket.id}
                            players={game?.players || []}
                            height={360}
                        />
                    </BottomSheet>
                )}
            </AnimatePresence>

            {/* ── Share modal ── */}
            <AnimatePresence>
                {showShare && (
                    <ShareModal
                        roomId={roomId}
                        onClose={() => setShowShare(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function SectionLabel({ icon, label }) {
    return (
        <div
            style={{
                color: "#3a2a5a",
                fontSize: 10,
                fontWeight: "bold",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
            }}
        >
            <span style={{ fontSize: 14 }}>{icon}</span>
            {label}
        </div>
    );
}

function Legend() {
    return (
        <div
            style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: "1px solid rgba(255,255,255,0.05)",
            }}
        >
            <div
                style={{
                    color: "#3a2a5a",
                    fontSize: 10,
                    fontWeight: "bold",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                }}
            >
                Legend
            </div>
            {[
                { c: "#ef4444", l: "Snake head" },
                { c: "#d97706", l: "Ladder" },
                { c: "#22c55e", l: "Start (1)" },
                { c: "#eab308", l: "Goal (100)" },
            ].map(({ c, l }) => (
                <div
                    key={l}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        marginBottom: 6,
                    }}
                >
                    <div
                        style={{
                            width: 12,
                            height: 7,
                            background: c,
                            borderRadius: 2,
                            flexShrink: 0,
                        }}
                    />
                    <span style={{ color: "#5a4a6a", fontSize: 11 }}>{l}</span>
                </div>
            ))}
        </div>
    );
}

function StartBtn({ onClick, fullWidth }) {
    return (
        <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onClick}
            style={{
                width: fullWidth ? "100%" : "100%",
                marginTop: 14,
                background: "linear-gradient(135deg,#10b981,#059669)",
                color: "white",
                border: "none",
                borderRadius: 14,
                padding: "13px 0",
                fontWeight: "bold",
                fontSize: 14,
                fontFamily: "Georgia,serif",
                cursor: "pointer",
                letterSpacing: "0.05em",
                boxShadow: "0 4px 28px rgba(16,185,129,0.5)",
            }}
        >
            ▶ Start Game
        </motion.button>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const PANEL = {
    background: "linear-gradient(160deg,#14102a 0%,#0d0b1c 100%)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 20,
    padding: 18,
};
const IS = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.04)",
    border: "1.5px solid rgba(255,255,255,0.09)",
    borderRadius: 13,
    padding: "13px 14px",
    color: "#e8dcc8",
    fontSize: 15,
    fontFamily: "Georgia,serif",
    outline: "none",
};
const PBS = {
    background: "linear-gradient(135deg,#6366f1,#4f46e5)",
    color: "white",
    border: "none",
    borderRadius: 13,
    padding: "13px 20px",
    fontWeight: "bold",
    fontSize: 15,
    fontFamily: "Georgia,serif",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 4px 22px rgba(99,102,241,0.5)",
};
const SBS = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    color: "#c0b090",
    border: "1.5px solid rgba(255,255,255,0.08)",
    borderRadius: 13,
    padding: "12px 0",
    fontWeight: "bold",
    fontSize: 14,
    fontFamily: "Georgia,serif",
    cursor: "pointer",
    letterSpacing: "0.05em",
};
