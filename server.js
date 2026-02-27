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

    // Join lobby
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

    // Start poker
    socket.on("startPoker", lobbyName => {
        const lobby = lobbies[lobbyName];
        if(!lobby) return;
        if(lobby.players[0].id !== socket.id) return socket.emit("errorMSG", "Only lobby creator can start the game");

        const game = poker.createGame(lobby.players);
        poker.dealHands(game);
        activeGames[lobbyName] = game;

        // Send private hands
        for(let p of game.players){
            io.to(p.id).emit("yourCards", p.hand);
        }

        io.to(lobbyName).emit("gameStarted", {
            community: game.community,
            stage: game.stage
        });
    });

    // Deal flop
    socket.on("dealFlop", lobbyName => {
        const game = activeGames[lobbyName];
        if(!game) return;
        if(game.stage !== "preflop") return socket.emit("errorMSG", "Cannot deal flop now");

        poker.dealFlop(game);
        io.to(lobbyName).emit("communityUpdate", game.community);
        io.to(lobbyName).emit("stageUpdate", game.stage);
    });

    // Deal turn
    socket.on("dealTurn", lobbyName => {
        const game = activeGames[lobbyName];
        if(!game) return;
        if(game.stage !== "flop") return socket.emit("errorMSG", "Cannot deal turn now");

        poker.dealTurn(game);
        io.to(lobbyName).emit("communityUpdate", game.community);
        io.to(lobbyName).emit("stageUpdate", game.stage);
    });

    // Deal river
    socket.on("dealRiver", lobbyName => {
        const game = activeGames[lobbyName];
        if(!game) return;
        if(game.stage !== "turn") return socket.emit("errorMSG", "Cannot deal river now");

        poker.dealRiver(game);
        io.to(lobbyName).emit("communityUpdate", game.community);
        io.to(lobbyName).emit("stageUpdate", game.stage);

        // Determine winner after river
        const winner = determineWinner(game);
        io.to(lobbyName).emit("gameEnded", winner);
    });
});

// ------------------------
// POKER HAND EVALUATION
// ------------------------

// Convert "A of Hearts" -> {rank:"A", suit:"Hearts"}
function parseCard(card){
    const [rank, , suit] = card.split(" ");
    return { rank, suit };
}

// Rank values
const rankMap = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14};

// Evaluate 7-card hand
function evaluateHandFull(cards){
    const parsed = cards.map(parseCard);
    const suits = {};
    const ranks = {};

    parsed.forEach(c => {
        suits[c.suit] = (suits[c.suit] || 0) + 1;
        const val = rankMap[c.rank];
        ranks[val] = (ranks[val] || 0) + 1;
    });

    const sortedRanks = Object.keys(ranks).map(Number).sort((a,b)=>b-a);

    // Flush check
    let flushSuit = null;
    for(const s in suits) if(suits[s]>=5) flushSuit = s;

    // Straight check
    const rankSet = new Set(sortedRanks);
    const straightHigh = findStraight(rankSet);

    // Straight flush
    if(flushSuit){
        const flushCards = parsed.filter(c=>c.suit===flushSuit).map(c=>rankMap[c.rank]);
        const flushSet = new Set(flushCards);
        const sfHigh = findStraight(flushSet);
        if(sfHigh) return {rank:9, highCard: sfHigh}; // straight flush
    }

    // Four of a kind
    const four = Object.keys(ranks).find(r => ranks[r]===4);
    if(four) return {rank:8, highCard: Number(four)};

    // Full house
    const three = Object.keys(ranks).filter(r=>ranks[r]===3).map(Number).sort((a,b)=>b-a);
    const pairs = Object.keys(ranks).filter(r=>ranks[r]===2).map(Number).sort((a,b)=>b-a);
    if(three.length>0 && (pairs.length>0 || three.length>1)) return {rank:7, highCard: three[0]};

    // Flush
    if(flushSuit){
        const flushCards = parsed.filter(c=>c.suit===flushSuit).map(c=>rankMap[c.rank]);
        return {rank:6, highCard: Math.max(...flushCards)};
    }

    // Straight
    if(straightHigh) return {rank:5, highCard: straightHigh};

    // Three of a kind
    if(three.length>0) return {rank:4, highCard: three[0]};

    // Two pair
    if(pairs.length>=2) return {rank:3, highCard: pairs[0], secondHigh: pairs[1]};

    // One pair
    if(pairs.length===1) return {rank:2, highCard: pairs[0]};

    // High card
    return {rank:1, highCard: sortedRanks[0]};
}

// Find straight in a set of numeric ranks
function findStraight(rankSet){
    const ranks = Array.from(rankSet).sort((a,b)=>a-b);
    for(let i=0;i<=ranks.length-5;i++){
        if(ranks[i+4]-ranks[i]===4) return ranks[i+4];
    }
    // Ace-low straight (A,2,3,4,5)
    if(rankSet.has(14)&&rankSet.has(2)&&rankSet.has(3)&&rankSet.has(4)&&rankSet.has(5)) return 5;
    return null;
}

// Compare two hand objects {rank, highCard, secondHigh?}
// Returns 1 if h1>h2, -1 if h1<h2, 0 if equal
function compareHands(h1,h2){
    if(h1.rank!==h2.rank) return h1.rank - h2.rank;
    if(h1.highCard!==h2.highCard) return h1.highCard - h2.highCard;
    if(h1.secondHigh!==h2.secondHigh) return (h1.secondHigh||0) - (h2.secondHigh||0);
    return 0;
}

// Determine winner from game object
function determineWinner(game){
    let bestPlayer = null;
    let bestValue = null;

    for(const p of game.players){
        const handValue = evaluateHandFull(p.hand.concat(game.community));
        if(!bestValue || compareHands(handValue,bestValue) > 0){
            bestValue = handValue;
            bestPlayer = p.username;
        }
    }

    return { winner: bestPlayer, hand: bestValue };
}

server.listen(3000, () => console.log("Server running on http://localhost:3000"));