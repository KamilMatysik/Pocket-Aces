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
    
    window.location = `lobby.html?lobby=${details.lobbyName}&user=${details.username}`
    
}
async function finalJoin(){
    if(!await checkLobbyDetails()){
        //Let user know details need fixing
        return
    }
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

    document.body.innerHTML += `<h2>Lobby: ${lobby}</h2>`;
    document.body.innerHTML += `<p>You are: ${user}</p>`;   
}