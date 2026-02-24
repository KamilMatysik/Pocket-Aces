async function createLobby(){
    if(!await nameCheck()){
        //let the user know their name is invalid
        return
    }
    showLobbyInputs()
    document.getElementById("finalCreate").style.display = "block"
    //hide create/join buttons
    
}
async function joinLobby(){
    if(!await nameCheck()){
        //let the user know their name is invalid
        return
    }
    showLobbyInputs()
    document.getElementById("finalJoin").style.display = "block"
    //hide create/join buttons
}
function nameCheck(){
    //check if name is not too short or long and also only letters and numbers
    //if invalid, "return false"
    return true
}
function showLobbyInputs(){
    document.getElementById("lobbyPass").style.display = "block";
    document.getElementById("lobbyName").style.display = "block";
}

async function finalCreate(){
    if(!await checkLobbyDetails()){
        //Let user know details need fixing
        return
    }
    let details = {username: document.getElementById("nameInput").value, lobbyName: document.getElementById("lobbyName").value, lobbyPass: document.getElementById("lobbyPass").value}
    const res = await fetch("/createLobby", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(details)
    })

    const result = await res.json()

    if(result.error){
        alert(result.error)
        return
    }
    
    window.location = `lobby.html?lobby=${details.lobbyName}&user=${details.username}&pass=${details.lobbyPass}`
    
}
async function finalJoin(){
    if(!await checkLobbyDetails()) return

    const username = document.getElementById("nameInput").value
    const lobbyName = document.getElementById("lobbyName").value
    const lobbyPass = document.getElementById("lobbyPass").value

    const res = await fetch("/joinLobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, lobbyName, lobbyPass })
    })

    const data = await res.json()

    if (!data.success) {
        alert(data.error)
        return
    }


    window.location =`lobby.html?lobby=${lobbyName}&user=${username}&pass=${lobbyPass}`
}




function checkLobbyDetails(){
    //ensure name is valid (password is optional but if not empty, enusre its valid)
    //if invalid "return false"
    return true
}

function loadDetails(){
    const socket = io()

    const params = new URLSearchParams(window.location.search);
    const lobby = params.get("lobby");
    const user = params.get("user");
    const pass = params.get("pass");

    document.body.innerHTML += `<h2>Lobby: ${lobby}</h2>`;
    document.body.innerHTML += `<p>You are: ${user}</p>`;   


    socket.emit("joinLobby", {
        username: user,
        lobbyName: lobby,
        lobbyPass: pass
    })

    socket.on("lobbyUpdate", players => {
        console.log("Players:", players)
    })

    socket.on("errorMSG", msg => alert(msg))
}