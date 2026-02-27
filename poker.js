// poker.js

// Create a standard 52-card deck
function createDeck() {
    const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
    const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    const deck = [];
    for (let s of suits){
        for (let r of ranks){
            deck.push(`${r} of ${s}`);
        }
    }
    return deck;
}

// Shuffle a deck using Fisher-Yates shuffle
function shuffle(deck){
    for (let i = deck.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Draw a card from the top of the deck
function draw(game){
    return game.deck.shift();
}

// Create a new game object
function createGame(players){
    return {
        deck: shuffle(createDeck()),
        community: [],
        stage: "preflop",
        players: players.map(p => ({
            id: p.id,
            username: p.username,
            hand: []
        }))
    };
}

// Deal two cards to each player
function dealHands(game){
    for (let p of game.players){
        p.hand.push(draw(game));
        p.hand.push(draw(game));
    }
}

// Deal the flop (3 community cards)
function dealFlop(game){
    game.community.push(draw(game));
    game.community.push(draw(game));
    game.community.push(draw(game));
    game.stage = "flop";
}

// Deal the turn (1 community card)
function dealTurn(game){
    game.community.push(draw(game));
    game.stage = "turn";
}

// Deal the river (1 community card)
function dealRiver(game){
    game.community.push(draw(game));
    game.stage = "river";
}

module.exports = {
    createGame,
    dealHands,
    dealFlop,
    dealTurn,
    dealRiver
};