async function createLobby(){
    if(!await nameCheck()){
        //let the user know their name is invalid
        return
    }
    showLobbyInputs()
    document.getElementById("finalCreate").style.display = "block"
}
async function joinLobby(){
    if(!await nameCheck()){
        //let the user know their name is invalid
        return
    }
    showLobbyInputs()
    document.getElementById("finalJoin").style.display = "block"
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