const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { generateLayout } = require("./generateLayout");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ─── Weighted dice (1–4 favoured) ─────────────────────────────────────────────
const DICE_WEIGHTS = [
    { face: 1, weight: 18 },
    { face: 2, weight: 18 },
    { face: 3, weight: 18 },
    { face: 4, weight: 18 },
    { face: 5, weight: 14 },
    { face: 6, weight: 14 },
];
const TOTAL_WEIGHT = DICE_WEIGHTS.reduce((s, d) => s + d.weight, 0);

function rollWeightedDice() {
    let rand = Math.random() * TOTAL_WEIGHT;
    for (const { face, weight } of DICE_WEIGHTS) {
        rand -= weight;
        if (rand <= 0) return face;
    }
    return 6;
}

let rooms = {};

io.on("connection", (socket) => {
    // ── Create room ───────────────────────────────────────────────────────────
    socket.on("create_room", () => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();

        // Generate a fresh random board layout for this room
        const { snakes, ladders } = generateLayout();

        rooms[roomId] = {
            players: [],
            turnIndex: 0,
            status: "waiting",
            lastRoll: 0,
            messages: [],
            snakes, // ← unique per room
            ladders, // ← unique per room
        };

        socket.emit("room_created", roomId);
    });

    // ── Join room ─────────────────────────────────────────────────────────────
    socket.on("join_room", ({ roomId, playerName }) => {
        if (!rooms[roomId]) return socket.emit("error", "Room not found");
        if (rooms[roomId].players.find((p) => p.id === socket.id)) return;

        const player = {
            id: socket.id,
            name: playerName,
            pos: 1,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        };
        rooms[roomId].players.push(player);
        socket.join(roomId);

        const joinMsg = {
            id: Date.now(),
            type: "system",
            text: `${playerName} joined the game`,
            ts: Date.now(),
        };
        rooms[roomId].messages.push(joinMsg);

        io.to(roomId).emit("game_update", rooms[roomId]);
        io.to(roomId).emit("chat_message", joinMsg);
    });

    // ── Chat ──────────────────────────────────────────────────────────────────
    socket.on("send_message", ({ roomId, text }) => {
        const game = rooms[roomId];
        if (!game) return;
        const player = game.players.find((p) => p.id === socket.id);
        if (!player || !text?.trim()) return;

        const msg = {
            id: Date.now() + Math.random(),
            type: "player",
            senderId: socket.id,
            senderName: player.name,
            text: text.trim().slice(0, 200),
            ts: Date.now(),
        };
        game.messages.push(msg);
        if (game.messages.length > 100)
            game.messages = game.messages.slice(-100);
        io.to(roomId).emit("chat_message", msg);
    });

    // ── Roll dice ─────────────────────────────────────────────────────────────
    socket.on("roll_dice", ({ roomId }) => {
        const game = rooms[roomId];
        if (!game || game.status !== "playing") return;
        const player = game.players[game.turnIndex];
        if (player.id !== socket.id) return;

        const { snakes, ladders } = game;
        const roll = rollWeightedDice();
        game.lastRoll = roll;

        let nextPos = player.pos + roll;
        let snakeOrLadder = null;

        if (nextPos <= 100) {
            player.pos = nextPos;
            if (snakes[nextPos]) {
                snakeOrLadder = "snake";
                player.pos = snakes[nextPos];
            }
            if (ladders[nextPos]) {
                snakeOrLadder = "ladder";
                player.pos = ladders[nextPos];
            }
        }

        if (snakeOrLadder) {
            const evtMsg = {
                id: Date.now() + Math.random(),
                type: "event",
                text:
                    snakeOrLadder === "snake"
                        ? `🐍 ${player.name} was bitten! Slid to ${player.pos}`
                        : `🪜 ${player.name} climbed a ladder to ${player.pos}`,
                ts: Date.now(),
            };
            game.messages.push(evtMsg);
            io.to(roomId).emit("chat_message", evtMsg);
        }

        if (player.pos === 100) {
            game.status = "finished";
            const winMsg = {
                id: Date.now() + Math.random(),
                type: "event",
                text: `🏆 ${player.name} wins the game!`,
                ts: Date.now(),
            };
            game.messages.push(winMsg);
            io.to(roomId).emit("winner", player.name);
            io.to(roomId).emit("chat_message", winMsg);
        } else if (roll !== 6) {
            game.turnIndex = (game.turnIndex + 1) % game.players.length;
        } else {
            const rollAgainMsg = {
                id: Date.now() + Math.random(),
                type: "event",
                text: `🎲 ${player.name} rolled a 6 — rolls again!`,
                ts: Date.now(),
            };
            game.messages.push(rollAgainMsg);
            io.to(roomId).emit("chat_message", rollAgainMsg);
        }

        io.to(roomId).emit("game_update", game);
    });

    // ── Start game ────────────────────────────────────────────────────────────
    socket.on("start_game", (roomId) => {
        const game = rooms[roomId];
        if (!game) return;
        game.status = "playing";
        const msg = {
            id: Date.now(),
            type: "event",
            text: "🎮 Game started! Good luck everyone!",
            ts: Date.now(),
        };
        game.messages.push(msg);
        io.to(roomId).emit("game_update", game);
        io.to(roomId).emit("chat_message", msg);
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
        for (const [roomId, game] of Object.entries(rooms)) {
            const idx = game.players.findIndex((p) => p.id === socket.id);
            if (idx !== -1) {
                const name = game.players[idx].name;
                const msg = {
                    id: Date.now(),
                    type: "system",
                    text: `${name} left the game`,
                    ts: Date.now(),
                };
                game.messages.push(msg);
                io.to(roomId).emit("chat_message", msg);
            }
        }
    });
});

server.listen(3001, () => console.log("Server on :3001"));
