const lobbies = {}

const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

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
    players: [{
        id: "HOST",
        username,
        cards: []
    }]
}
    res.json({success: true})
})

app.post("/joinLobby", (req, res) => {
    const { username, lobbyName, lobbyPass } = req.body

    if (!username || !lobbyName || !lobbyPass) {
        return res.status(400).json({ error: "Missing data" })
    }

    const lobby = lobbies[lobbyName]

    if (!lobby) {
        return res.status(404).json({ error: "Lobby not found" })
    }

    if (lobby.lobbyPass !== lobbyPass) {
        return res.status(401).json({ error: "Wrong password" })
    }

    res.json({ success: true })
})

io.on("connection", socket => {
    socket.on("joinLobby", ({username, lobbyName, lobbyPass}) => {
    const lobby = lobbies[lobbyName]
    if(!lobby) return socket.emit("errorMSG", "Lobby not found")
    if (lobby.lobbyPass !== lobbyPass) return socket.emit("errorMSG", "Wrong password")


    lobby.players.push({
        id: socket.id,
        username,
        cards:[]
    })

    socket.join(lobbyName)
    io.to(lobbyName).emit("lobbyUpdate", lobby.players.map(p => p.username))
})

    socket.on("disconnect", () => {
        console.log("Player disconnected: ", socket.id)

        for(const lobbyName in lobbies) {
            const lobby = lobbies[lobbyName]
            lobby.players = lobby.players.filter(p => p.id !== socket.id)
        }
    })
})

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
})