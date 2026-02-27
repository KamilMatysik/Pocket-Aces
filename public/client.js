// client.js

async function createLobby(){ if(!await nameCheck()) return; showLobbyInputs(); document.getElementById("finalCreate").style.display = "block"; }
async function joinLobby(){ if(!await nameCheck()) return; showLobbyInputs(); document.getElementById("finalJoin").style.display = "block"; }

function nameCheck(){
    const name = document.getElementById("nameInput")?.value;
    if(!name || !/^[a-zA-Z0-9]{3,15}$/.test(name)){ alert("Name must be 3-15 letters or numbers"); return false; }
    return true;
}

function showLobbyInputs(){ document.getElementById("lobbyPass").style.display = "block"; document.getElementById("lobbyName").style.display = "block"; }

async function finalCreate(){
    const details = { username: document.getElementById("nameInput").value, lobbyName: document.getElementById("lobbyName").value, lobbyPass: document.getElementById("lobbyPass").value };
    const res = await fetch("/createLobby",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(details) });
    const data = await res.json();
    if(data.error){ alert(data.error); return; }
    window.location = `lobby.html?lobby=${details.lobbyName}&user=${details.username}&pass=${details.lobbyPass}`;
}

async function finalJoin(){
    const username = document.getElementById("nameInput").value;
    const lobbyName = document.getElementById("lobbyName").value;
    const lobbyPass = document.getElementById("lobbyPass").value;
    const res = await fetch("/joinLobby",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({username,lobbyName,lobbyPass}) });
    const data = await res.json();
    if(!data.success){ alert(data.error); return; }
    window.location = `lobby.html?lobby=${lobbyName}&user=${username}&pass=${lobbyPass}`;
}

function loadDetails(){
    window.socket = io();
    const params = new URLSearchParams(window.location.search);
    window.currentLobby = params.get("lobby");
    const user = params.get("user");
    const pass = params.get("pass");

    document.body.innerHTML += `<h2>Lobby: ${window.currentLobby}</h2>`;
    document.body.innerHTML += `<p>You are: ${user}</p>`;

    window.socket.emit("joinLobby", { username:user, lobbyName:window.currentLobby, lobbyPass:pass });
    setupSocketListeners();
}

function setupSocketListeners(){
    if(!window.socket) return;

    window.socket.on("lobbyUpdate", players => { const div = document.getElementById("players"); if(div) div.innerHTML = players.map(p=>`<div>${p}</div>`).join(""); });
    window.socket.on("errorMSG", msg => alert(msg));

    window.socket.on("yourCards", cards => { const div = document.getElementById("myCards"); if(div) div.innerHTML = cards.map(c=>`<div>${c}</div>`).join(""); });
    window.socket.on("communityUpdate", cards => { const div = document.getElementById("board"); if(div) div.innerHTML = cards.map(c=>`<div>${c}</div>`).join(""); });
    window.socket.on("stageUpdate", stage => { const div = document.getElementById("stage"); if(div) div.textContent = `Stage: ${stage}`; });

    window.socket.on("gameStarted", data => {
        document.getElementById("flopBtn").disabled = false;
        document.getElementById("turnBtn").disabled = false;
        document.getElementById("riverBtn").disabled = false;

        const div = document.getElementById("board");
        if(div) div.innerHTML = data.community.map(c=>`<div>${c}</div>`).join("");
        const stageDiv = document.getElementById("stage");
        if(stageDiv) stageDiv.textContent = `Stage: ${data.stage}`;
    });

    window.socket.on("gameEnded", data => alert(`Winner: ${data.winner} (value: ${data.value})`));
}

// Poker actions
function startPoker(){ if(!window.currentLobby) return alert("Lobby not set"); window.socket.emit("startPoker", window.currentLobby); }
function dealFlop(){ if(window.currentLobby) window.socket.emit("dealFlop", window.currentLobby); }
function dealTurn(){ if(window.currentLobby) window.socket.emit("dealTurn", window.currentLobby); }
function dealRiver(){ if(window.currentLobby) window.socket.emit("dealRiver", window.currentLobby); }