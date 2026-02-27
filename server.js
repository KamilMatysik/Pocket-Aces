// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const poker = require("./poker");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

const lobbies = {};
const activeGames = {};

// --- HTTP endpoints ---

app.post("/createLobby", (req, res) => {
    const {username, lobbyName, lobbyPass} = req.body;
    if (!username || !lobbyName || !lobbyPass) return res.status(400).json({ error: "Missing data" });
    if (lobbies[lobbyName]) return res.status(400).json({ error: "Lobby Name Already Exists" });

    lobbies[lobbyName] = { lobbyPass, players: [] };
    res.json({ success: true });
});

app.post("/joinLobby", (req, res) => {
    const { username, lobbyName, lobbyPass } = req.body;
    if (!username || !lobbyName || !lobbyPass) return res.status(400).json({ error: "Missing data" });

    const lobby = lobbies[lobbyName];
    if (!lobby) return res.status(404).json({ error: "Lobby not found" });
    if (lobby.lobbyPass !== lobbyPass) return res.status(401).json({ error: "Wrong password" });

    res.json({ success: true });
});

// --- SOCKET.IO ---

io.on("connection", socket => {

    // Join a lobby
    socket.on("joinLobby", ({ username, lobbyName, lobbyPass }) => {
        const lobby = lobbies[lobbyName];
        if (!lobby) return socket.emit("errorMSG", "Lobby not found");
        if (lobby.lobbyPass !== lobbyPass) return socket.emit("errorMSG", "Wrong password");

        lobby.players.push({ id: socket.id, username, cards: [] });
        socket.join(lobbyName);

        io.to(lobbyName).emit("lobbyUpdate", lobby.players.map(p => p.username));
    });

    // Disconnect
    socket.on("disconnect", () => {
        for (const lobbyName in lobbies) {
            const lobby = lobbies[lobbyName];
            lobby.players = lobby.players.filter(p => p.id !== socket.id);
            io.to(lobbyName).emit("lobbyUpdate", lobby.players.map(p => p.username));
        }
    });

    // Start poker (only lobby creator)
    socket.on("startPoker", lobbyName => {
        const lobby = lobbies[lobbyName];
        if (!lobby) return;
        if (lobby.players[0].id !== socket.id) return socket.emit("errorMSG", "Only the lobby creator can start the game");

        const game = poker.createGame(lobby.players);
        poker.dealHands(game);
        activeGames[lobbyName] = game;

        for (let p of game.players) {
            io.to(p.id).emit("yourCards", p.hand);
        }

        io.to(lobbyName).emit("gameStarted", {
            community: game.community,
            stage: game.stage
        });
    });

    // Deal stages
    socket.on("dealFlop", lobbyName => {
        const game = activeGames[lobbyName];
        if (!game) return;
        poker.dealFlop(game);
        io.to(lobbyName).emit("communityUpdate", game.community);
    });

    socket.on("dealTurn", lobbyName => {
        const game = activeGames[lobbyName];
        if (!game) return;
        poker.dealTurn(game);
        io.to(lobbyName).emit("communityUpdate", game.community);
    });

    socket.on("dealRiver", lobbyName => {
        const game = activeGames[lobbyName];
        if (!game) return;
        poker.dealRiver(game);
        io.to(lobbyName).emit("communityUpdate", game.community);
    });

});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));