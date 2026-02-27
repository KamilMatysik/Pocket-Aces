// client.js

// ===== LOBBY CREATION / JOIN =====

async function createLobby(){
    if(!await nameCheck()) return;
    showLobbyInputs();
    document.getElementById("finalCreate").style.display = "block";
}

async function joinLobby(){
    if(!await nameCheck()) return;
    showLobbyInputs();
    document.getElementById("finalJoin").style.display = "block";
}

function nameCheck(){
    const name = document.getElementById("nameInput")?.value;
    if(!name || !/^[a-zA-Z0-9]{3,15}$/.test(name)){
        alert("Name must be 3-15 letters or numbers");
        return false;
    }
    return true;
}

function showLobbyInputs(){
    document.getElementById("lobbyPass").style.display = "block";
    document.getElementById("lobbyName").style.display = "block";
}

async function finalCreate(){
    if(!await checkLobbyDetails()) return;
    const details = {
        username: document.getElementById("nameInput").value,
        lobbyName: document.getElementById("lobbyName").value,
        lobbyPass: document.getElementById("lobbyPass").value
    };
    const res = await fetch("/createLobby", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(details)
    });
    const result = await res.json();
    if(result.error){ alert(result.error); return; }
    window.location = `lobby.html?lobby=${details.lobbyName}&user=${details.username}&pass=${details.lobbyPass}`;
}

async function finalJoin(){
    if(!await checkLobbyDetails()) return;
    const username = document.getElementById("nameInput").value;
    const lobbyName = document.getElementById("lobbyName").value;
    const lobbyPass = document.getElementById("lobbyPass").value;

    const res = await fetch("/joinLobby", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username, lobbyName, lobbyPass })
    });
    const data = await res.json();
    if(!data.success){ alert(data.error); return; }

    window.location = `lobby.html?lobby=${lobbyName}&user=${username}&pass=${lobbyPass}`;
}

function checkLobbyDetails(){ return true; }

// ===== SOCKET + POKER =====

function loadDetails(){
    window.socket = io();

    const params = new URLSearchParams(window.location.search);
    window.currentLobby = params.get("lobby");
    const user = params.get("user");
    const pass = params.get("pass");

    document.body.innerHTML += `<h2>Lobby: ${window.currentLobby}</h2>`;
    document.body.innerHTML += `<p>You are: ${user}</p>`;

    window.socket.emit("joinLobby", { username: user, lobbyName: window.currentLobby, lobbyPass: pass });

    setupSocketListeners();
}

function setupSocketListeners(){
    if(!window.socket) return;

    window.socket.on("lobbyUpdate", players => {
        const playersDiv = document.getElementById("players");
        if(playersDiv) playersDiv.innerHTML = players.map(p => `<div>${p}</div>`).join("");
    });

    window.socket.on("errorMSG", msg => alert(msg));

    window.socket.on("yourCards", cards => {
        const myCardsEl = document.getElementById("myCards");
        if(myCardsEl) myCardsEl.innerHTML = cards.map(c => `<div>${c}</div>`).join("");
    });

    window.socket.on("communityUpdate", cards => {
        const boardEl = document.getElementById("board");
        if(boardEl) boardEl.innerHTML = cards.map(c => `<div>${c}</div>`).join("");
    });

    window.socket.on("gameStarted", data => {
        const boardEl = document.getElementById("board");
        if(boardEl) boardEl.innerHTML = data.community.map(c => `<div>${c}</div>`).join("");

        const stageEl = document.getElementById("stage");
        if(stageEl) stageEl.textContent = `Stage: ${data.stage}`;

        // enable buttons
        document.getElementById("flopBtn").disabled = false;
        document.getElementById("turnBtn").disabled = false;
        document.getElementById("riverBtn").disabled = false;
    });
}

// ===== POKER ACTIONS =====

function startPoker(){
    if(!window.currentLobby) return alert("Lobby not set");
    window.socket.emit("startPoker", window.currentLobby);
}
function dealFlop(){ if(window.currentLobby) window.socket.emit("dealFlop", window.currentLobby); }
function dealTurn(){ if(window.currentLobby) window.socket.emit("dealTurn", window.currentLobby); }
function dealRiver(){ if(window.currentLobby) window.socket.emit("dealRiver", window.currentLobby); }