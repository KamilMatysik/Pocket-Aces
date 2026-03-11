// ─── INDEX PAGE FUNCTIONS ────────────────────────────────────────────────────

async function createLobby(){
    if(!nameCheck()) return;
    showLobbyInputs();
    document.getElementById("finalCreate").style.display = "block";
}

async function joinLobby(){
    if(!nameCheck()) return;
    showLobbyInputs();
    document.getElementById("finalJoin").style.display = "block";
}

function nameCheck(){
    const name = document.getElementById("nameInput")?.value;
    if(!name || !/^[a-zA-Z0-9]{3,15}$/.test(name)){
        alert("Name must be 3–15 letters or numbers");
        return false;
    }
    return true;
}

function showLobbyInputs(){
    document.getElementById("lobbyPass").style.display = "block";
    document.getElementById("lobbyName").style.display = "block";
}

async function finalCreate(){
    const details = {
        username: document.getElementById("nameInput").value,
        lobbyName: document.getElementById("lobbyName").value,
        lobbyPass: document.getElementById("lobbyPass").value
    };
    const res  = await fetch("/createLobby", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(details) });
    const data = await res.json();
    if(data.error){ alert(data.error); return; }
    window.location = `lobby.html?lobby=${details.lobbyName}&user=${details.username}&pass=${details.lobbyPass}`;
}

async function finalJoin(){
    const username  = document.getElementById("nameInput").value;
    const lobbyName = document.getElementById("lobbyName").value;
    const lobbyPass = document.getElementById("lobbyPass").value;
    const res  = await fetch("/joinLobby", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ username, lobbyName, lobbyPass }) });
    const data = await res.json();
    if(!data.success){ alert(data.error); return; }
    window.location = `lobby.html?lobby=${lobbyName}&user=${username}&pass=${lobbyPass}`;
}


// ─── LOBBY PAGE ───────────────────────────────────────────────────────────────

function loadDetails(){
    window.socket = io();

    const params = new URLSearchParams(window.location.search);
    window.currentLobby = params.get("lobby");
    window.currentUser  = params.get("user");
    const pass          = params.get("pass");

    document.getElementById("lobbyTitle").textContent = `Lobby: ${window.currentLobby}`;
    document.getElementById("youAre").textContent     = `You are: ${window.currentUser}`;

    socket.emit("joinLobby", { username: window.currentUser, lobbyName: window.currentLobby, lobbyPass: pass });

    setupSocketListeners();
}

function setupSocketListeners(){

    // ── Lobby update (player list) ──
    socket.on("lobbyUpdate", data => {
        window.hostId = data.host;
        const isHost = socket.id === data.host;

        const div = document.getElementById("players");
        div.innerHTML = "";

        data.players.forEach(p => {
            const el = document.createElement("div");
            el.className = "player-row";
            el.innerHTML = `<span>${p.name}</span>`;

            if(isHost && p.id !== socket.id){
                const kick = document.createElement("button");
                kick.textContent = "Kick";
                kick.className = "btn-kick";
                kick.onclick = () => socket.emit("kickPlayer", { lobbyName: currentLobby, playerId: p.id });
                el.appendChild(kick);
            }

            div.appendChild(el);
        });

        // Show/hide start button for host only
        document.getElementById("startBtn").style.display = isHost ? "inline-block" : "none";
    });

    // ── Kicked ──
    socket.on("kicked", () => {
        alert("You were kicked by the host");
        window.location = "/";
    });

    // ── Error messages ──
    socket.on("errorMSG", msg => alert("Error: " + msg));
    socket.on("betError",  msg => alert("Bet error: " + msg));

    // ── Private cards ──
    socket.on("yourCards", cards => {
        const div = document.getElementById("myCards");
        div.innerHTML = cards.map(c => `<div class="card">${c}</div>`).join("");
    });

    // ── Stage change ──
    socket.on("stageUpdate", stage => {
        document.getElementById("stage").textContent = `Stage: ${stage}`;
    });

    // ── Blinds posted ──
    socket.on("blindsPosted", info => {
        setStatus(`Blinds posted — Small blind: ${info.sbAmount}, Big blind: ${info.bbAmount}`);
    });

    // ── Full game state broadcast ──
    socket.on("gameState", state => {
        window.gameState = state;

        // Community cards
        const board = document.getElementById("board");
        board.innerHTML = state.community.map(c => `<div class="card">${c}</div>`).join("") || "<em>No cards yet</em>";

        // Stage
        document.getElementById("stage").textContent = `Stage: ${state.stage}`;

        // Pot and current bet
        document.getElementById("potInfo").textContent = `Pot: ${state.pot} chips  |  Current bet: ${state.currentBet}`;

        // Player list with chip counts
        const div = document.getElementById("players");
        const isHost = socket.id === window.hostId;
        div.innerHTML = "";

        state.players.forEach(p => {
            const isCurrentTurn = p.id === state.currentPlayerId;
            const el = document.createElement("div");
            el.className = "player-row" + (isCurrentTurn ? " active-turn" : "");

            let status = "";
            if(p.folded) status = "🚫 Folded";
            else if(p.allIn) status = "💀 All-in";
            else if(isCurrentTurn) status = "⏳ Acting...";

            el.innerHTML = `<span>${p.username}</span> <span>${p.chips} chips</span> <span>Bet: ${p.bet}</span> <span>${status}</span>`;

            if(isHost && p.id !== socket.id){
                const kick = document.createElement("button");
                kick.textContent = "Kick";
                kick.className = "btn-kick";
                kick.onclick = () => socket.emit("kickPlayer", { lobbyName: currentLobby, playerId: p.id });
                el.appendChild(kick);
            }

            div.appendChild(el);
        });

        // Show/hide my chips
        const me = state.players.find(p => p.id === socket.id);
        if(me) document.getElementById("myChips").textContent = `Your chips: ${me.chips}`;
    });

    // ── It's someone's turn ──
    socket.on("playerTurn", data => {
        const isMyTurn = data.playerId === socket.id;

        document.getElementById("turnInfo").textContent = isMyTurn
            ? `⭐ Your turn! To call: ${data.toCall} chips`
            : `Waiting for ${data.username}...`;

        // Show betting controls only for the active player
        const controls = document.getElementById("bettingControls");
        controls.style.display = isMyTurn ? "block" : "none";

        if(isMyTurn){
            // Grey out check button if there's a bet to call
            document.getElementById("btnCheck").disabled = !data.canCheck;

            // Pre-fill call amount hint
            if(data.toCall > 0)
                document.getElementById("betAmount").placeholder = `Call ${data.toCall} or raise more`;
            else
                document.getElementById("betAmount").placeholder = "Raise amount";
        }
    });

    // ── Round reset (new round about to start — wipe game UI) ──
    socket.on("roundReset", () => {
        document.getElementById("myCards").innerHTML     = "<em>Waiting for deal...</em>";
        document.getElementById("board").innerHTML       = "<em>No cards yet</em>";
        document.getElementById("stage").textContent     = "Stage: preflop";
        document.getElementById("potInfo").textContent   = "Pot: 0  |  Current bet: 0";
        document.getElementById("turnInfo").textContent  = "";
        document.getElementById("bettingControls").style.display = "none";
        document.getElementById("betAmount").value       = "";
        setStatus("New round starting...");
    });

    // ── Round over (replaces old gameOver) ──
    socket.on("roundOver", data => {

        // Build result message
        let msg = "━━━━━━━ ROUND RESULT ━━━━━━━\n\n";

        // Side pot awards
        if(data.awards.length === 1){
            const a = data.awards[0];
            msg += `🏆 Winner: ${a.winners.join(" & ")} — ${a.handName} (${a.potAmount} chips)\n`;
        } else {
            data.awards.forEach((a, i) => {
                msg += `Pot ${i+1} (${a.potAmount} chips): ${a.winners.join(" & ")} — ${a.handName}\n`;
            });
        }

        // Card reveal
        if(data.reveal.length > 0){
            msg += "\nCards shown:\n";
            data.reveal.forEach(r => { msg += `  ${r.username}: ${r.hand.join(", ")}\n`; });
        }

        // Chip counts
        msg += "\nChip counts:\n";
        data.players.forEach(p => { msg += `  ${p.username}: ${p.chips} chips\n`; });

        // Eliminations
        if(data.eliminated.length > 0){
            msg += "\n💀 Eliminated: " + data.eliminated.map(e => e.username).join(", ");
        }

        // Tournament winner
        if(data.tournamentOver){
            msg += `\n\n🎉🎉 TOURNAMENT WINNER: ${data.tournamentWinner} 🎉🎉`;
        }

        alert(msg);

        document.getElementById("bettingControls").style.display = "none";
        document.getElementById("turnInfo").textContent = "";

        if(data.tournamentOver){
            document.getElementById("startBtn").style.display = "none";
            setStatus(`🎉 Tournament over! ${data.tournamentWinner} wins!`);
            document.getElementById("myCards").innerHTML = "<em>Game over</em>";
            document.getElementById("board").innerHTML   = "<em>Game over</em>";
        } else {
            document.getElementById("startBtn").style.display = socket.id === window.hostId ? "inline-block" : "none";
            setStatus("Round over. Host can start the next round.");
        }

        // If I was eliminated, show a message
        if(data.eliminated.some(e => e.id === socket.id)){
            setTimeout(() => alert("You've been eliminated! You're out of chips."), 300);
        }
    });
}


// ─── ACTIONS ─────────────────────────────────────────────────────────────────

function startPoker(){
    socket.emit("startPoker", currentLobby);
}

function bet(action){
    const amount = parseInt(document.getElementById("betAmount").value) || 0;
    socket.emit("betAction", { lobbyName: currentLobby, action, amount });
    document.getElementById("betAmount").value = "";
}

function setStatus(msg){
    document.getElementById("statusMsg").textContent = msg;
}