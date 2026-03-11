const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const poker = require("./poker");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

const lobbies = {};      // lobbyName -> { lobbyPass, players, host }
const activeGames = {};  // lobbyName -> game


// ─── HTTP ────────────────────────────────────────────────────────────────────

app.post("/createLobby", (req, res) => {
    const { username, lobbyName, lobbyPass } = req.body;
    if (!username || !lobbyName || !lobbyPass)
        return res.status(400).json({ error: "Missing data" });
    if (lobbies[lobbyName])
        return res.status(400).json({ error: "Lobby name already exists" });

    lobbies[lobbyName] = { lobbyPass, players: [], host: null };
    res.json({ success: true });
});

app.post("/joinLobby", (req, res) => {
    const { username, lobbyName, lobbyPass } = req.body;
    if (!username || !lobbyName || !lobbyPass)
        return res.status(400).json({ error: "Missing data" });

    const lobby = lobbies[lobbyName];
    if (!lobby)  return res.status(404).json({ error: "Lobby not found" });
    if (lobby.lobbyPass !== lobbyPass) return res.status(401).json({ error: "Wrong password" });

    res.json({ success: true });
});


// ─── HELPERS ─────────────────────────────────────────────────────────────────

function broadcastLobby(lobbyName){
    const lobby = lobbies[lobbyName];
    if(!lobby) return;
    io.to(lobbyName).emit("lobbyUpdate", {
        players: lobby.players.map(p => ({ name: p.username, id: p.id })),
        host: lobby.host
    });
}

// Send the current game state to everyone in the lobby
function broadcastGameState(lobbyName){
    const game = activeGames[lobbyName];
    if(!game) return;

    io.to(lobbyName).emit("gameState", {
        pot: game.pot,
        currentBet: game.currentBet,
        stage: game.stage,
        community: game.community,
        currentPlayerIndex: game.currentPlayerIndex,
        currentPlayerId: game.players[game.currentPlayerIndex]?.id || null,
        players: game.players.map(p => ({
            id: p.id,
            username: p.username,
            chips: p.chips,
            bet: p.bet,
            folded: p.folded,
            allIn: p.allIn
        }))
    });
}

// Prompt the current player it is their turn
function promptCurrentPlayer(lobbyName){
    const game = activeGames[lobbyName];
    if(!game) return;

    const player = game.players[game.currentPlayerIndex];
    if(!player) return;

    const canCheck = game.currentBet === player.bet;

    io.to(lobbyName).emit("playerTurn", {
        playerId: player.id,
        username: player.username,
        canCheck,
        currentBet: game.currentBet,
        playerBet: player.bet,
        toCall: game.currentBet - player.bet
    });
}

// Advance to the next non-folded, non-all-in player
function nextTurn(lobbyName){
    const game = activeGames[lobbyName];
    if(!game) return;

    // Check if round is over first
    if(poker.isBettingRoundOver(game) || poker.isOnlyOneLeft(game)){
        endBettingRound(lobbyName);
        return;
    }

    const count = game.players.length;
    let idx = (game.currentPlayerIndex + 1) % count;
    for(let i = 0; i < count; i++){
        const p = game.players[idx];
        if(!p.folded && !p.allIn){
            game.currentPlayerIndex = idx;
            broadcastGameState(lobbyName);
            promptCurrentPlayer(lobbyName);
            return;
        }
        idx = (idx + 1) % count;
    }

    // All remaining players are all-in or folded
    endBettingRound(lobbyName);
}

function endBettingRound(lobbyName){
    const game = activeGames[lobbyName];
    if(!game) return;

    if(poker.isOnlyOneLeft(game)){
        endGame(lobbyName);
        return;
    }

    // Helper: deal next street, reset betting, broadcast.
    // If nobody can act (all all-in), keep advancing until river then showdown.
    function advanceStreet(){
        if(game.stage === "preflop"){
            poker.dealFlop(game);
        } else if(game.stage === "flop"){
            poker.dealTurn(game);
        } else if(game.stage === "turn"){
            poker.dealRiver(game);
        } else if(game.stage === "river"){
            endGame(lobbyName);
            return;
        }

        broadcastGameState(lobbyName);
        io.to(lobbyName).emit("stageUpdate", game.stage);

        const canAct = poker.resetBettingRound(game);
        broadcastGameState(lobbyName);

        if(canAct){
            promptCurrentPlayer(lobbyName);
        } else {
            // No one can act — keep running out streets automatically
            advanceStreet();
        }
    }

    advanceStreet();
}

function endGame(lobbyName){
    const game = activeGames[lobbyName];
    if(!game) return;

    // ── Resolve pots ──────────────────────────────────────────────────────────
    const { awards, reveal } = poker.isOnlyOneLeft(game)
        ? poker.awardLastPlayer(game)
        : poker.resolveShowdown(game);

    // ── Persist chip counts back to lobby ─────────────────────────────────────
    const lobby = lobbies[lobbyName];
    if(lobby){
        lobby.players.forEach(lp => {
            const gp = game.players.find(p => p.id === lp.id);
            if(gp) lp.chips = gp.chips;
        });
        lobby.dealerIndex = ((lobby.dealerIndex || 0) + 1) % lobby.players.length;
    }

    // ── Detect eliminations (0 chips after this hand) ─────────────────────────
    const bustedIds = poker.getBustedPlayers(game);
    const eliminated = [];

    if(bustedIds.length > 0 && lobby){
        bustedIds.forEach(id => {
            const lp = lobby.players.find(p => p.id === id);
            if(lp){
                eliminated.push({ id: lp.id, username: lp.username });
                // Remove from lobby so they can't play next round
                lobby.players = lobby.players.filter(p => p.id !== id);
            }
        });
    }

    // ── Check for tournament winner (only one player left in lobby) ───────────
    const tournamentOver = lobby && lobby.players.length === 1;
    const tournamentWinner = tournamentOver ? lobby.players[0].username : null;

    // ── Broadcast round result ────────────────────────────────────────────────
    io.to(lobbyName).emit("roundOver", {
        awards,
        reveal,
        eliminated,
        tournamentOver,
        tournamentWinner,
        players: game.players.map(p => ({
            id: p.id,
            username: p.username,
            chips: p.chips
        }))
    });

    delete activeGames[lobbyName];

    // If tournament is over, clean up the lobby entirely after a delay
    if(tournamentOver){
        setTimeout(() => {
            delete lobbies[lobbyName];
        }, 60000); // keep lobby object alive 60s so clients can see the result
    } else {
        // Adjust dealerIndex to stay in bounds after possible elimination
        if(lobby) lobby.dealerIndex = lobby.dealerIndex % lobby.players.length;
        // Broadcast updated lobby (minus eliminated players)
        broadcastLobby(lobbyName);
    }
}


// ─── SOCKET.IO ────────────────────────────────────────────────────────────────

io.on("connection", socket => {

    // ── Join Lobby ──
    socket.on("joinLobby", ({ username, lobbyName, lobbyPass }) => {
        const lobby = lobbies[lobbyName];
        if (!lobby) return socket.emit("errorMSG", "Lobby not found");
        if (lobby.lobbyPass !== lobbyPass) return socket.emit("errorMSG", "Wrong password");

        if (!lobby.host) lobby.host = socket.id;

        // Preserve chips if this player existed before (e.g. rejoin after round)
        const existing = lobby.players.find(p => p.username === username);
        const chips = existing ? existing.chips : 1000;
        if(existing) lobby.players = lobby.players.filter(p => p.username !== username);
        lobby.players.push({ id: socket.id, username, chips });
        socket.join(lobbyName);
        broadcastLobby(lobbyName);
    });


    // ── Kick Player ──
    socket.on("kickPlayer", ({ lobbyName, playerId }) => {
        const lobby = lobbies[lobbyName];
        if (!lobby || socket.id !== lobby.host) return;

        const game = activeGames[lobbyName];

        // If game is active, fold the kicked player and advance if it was their turn
        if(game){
            const gp = game.players.find(p => p.id === playerId);
            if(gp){
                gp.folded = true;
                gp.acted = true;
                const wasTheirTurn = game.players[game.currentPlayerIndex]?.id === playerId;
                if(wasTheirTurn) nextTurn(lobbyName);
            }
        }

        lobby.players = lobby.players.filter(p => p.id !== playerId);

        io.to(playerId).emit("kicked");
        io.sockets.sockets.get(playerId)?.leave(lobbyName);

        broadcastLobby(lobbyName);
        if(game) broadcastGameState(lobbyName);
    });


    // ── Disconnect ──
    socket.on("disconnect", () => {
        for (const lobbyName in lobbies) {
            const lobby = lobbies[lobbyName];
            // Only act if this socket is still a registered player in the lobby.
            // Eliminated players are removed from lobby.players at round end, so
            // their later socket disconnect should not affect the lobby at all.
            if (!lobby.players.find(p => p.id === socket.id)) continue;

            const game = activeGames[lobbyName];
            if(game){
                const gp = game.players.find(p => p.id === socket.id);
                if(gp){
                    gp.folded = true;
                    gp.acted = true;
                    if(game.players[game.currentPlayerIndex]?.id === socket.id)
                        nextTurn(lobbyName);
                }
            }

            lobby.players = lobby.players.filter(p => p.id !== socket.id);

            if (lobby.host === socket.id && lobby.players.length > 0)
                lobby.host = lobby.players[0].id;

            broadcastLobby(lobbyName);
            if(game) broadcastGameState(lobbyName);
        }
    });


    // ── Start Game ──
    socket.on("startPoker", lobbyName => {
        const lobby = lobbies[lobbyName];
        if (!lobby) return;
        if (socket.id !== lobby.host)
            return socket.emit("errorMSG", "Only the host can start the game");
        if (lobby.players.length < 2)
            return socket.emit("errorMSG", "Need at least 2 players");
        if (activeGames[lobbyName])
            return socket.emit("errorMSG", "Game already in progress");

        // Wipe all game UI on every client before the new round starts
        io.to(lobbyName).emit("roundReset");

        const game = poker.createGame(lobby.players); // uses persisted chip counts from lobby
        game.dealerIndex = lobby.dealerIndex || 0;

        poker.dealHands(game);

        activeGames[lobbyName] = game;

        // Send each player their private cards
        for (const p of game.players)
            io.to(p.id).emit("yourCards", p.hand);

        // Post blinds
        const blindInfo = poker.postBlinds(game, 10, 20);

        broadcastGameState(lobbyName);
        io.to(lobbyName).emit("blindsPosted", blindInfo);
        io.to(lobbyName).emit("stageUpdate", game.stage);

        promptCurrentPlayer(lobbyName);
    });


    // ── Bet Action ──
    socket.on("betAction", ({ lobbyName, action, amount }) => {
        const game = activeGames[lobbyName];
        if (!game) return;

        const result = poker.applyAction(game, socket.id, action, amount);

        if (!result.valid){
            socket.emit("betError", result.error);
            return;
        }

        broadcastGameState(lobbyName);
        nextTurn(lobbyName);
    });

});


server.listen(3000, () => console.log("Server running on http://localhost:3000"));