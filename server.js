const lobbies = {}

const express = require("express")
const app = express()

app.use(express.json())

app.use(express.static("public"))

app.post("/createLobby", (req, res) => {
    const {username, lobbyName, lobbyPass} = req.body

    if (!username || !lobbyName || !lobbyPass) {
        return res.status(400).json({ error: "Missing data" });
    }

    if (lobbies[lobbyName]) {
        return res.status(400).json({error: "Lobby Name Already Exists"})
    }

    lobbies[lobbyName] = {
        lobbyPass,
        players: [username]
    }

    res.json({success: true})
})

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
})