function createLobby(){
    chooseName()

}
function joinLobby(){
    chooseName()
}

function chooseName(){
    document.getElementById("nameInput").style.opacity = 1;
    document.getElementById("submitName").style.opacity = 1;
    //Add checks to ensure name is not too long/too short, only letters and numbers
}