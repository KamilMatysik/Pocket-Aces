function createDeck() {
    const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
    const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
// using words 
    const deck = [];
    for (let s of suits) {
        for (let r of ranks) {
            deck.push(r + " of " + s);
        }
    }
    return deck;
}
let deck = createDeck();
var PlayerCount = 1;
//Amount Of Players in Game

var PlayerCards = [[]];
// Array of Players Cards, PlayerCards[0] is Player 1's hand and  PlayerCards[0][0] is the first card in their hand
var CommunityCards = [];
var PlayerHandStength = [];
// PlayerHandStrength[0] is Player 1s hand strength
// 0 being the weakest and the higher the number the stronger the hand, with 9 being a royal flush


function DealFlop(){
CommunityCards.push(draw());
CommunityCards.push(draw());
CommunityCards.push(draw());
}
function DealTurn(){
    CommunityCards.push(draw());
}
function DealRiver(){
    CommunityCards.push(draw());
}
function ResetCommunityCards(){
    CommunityCards = [];
}
function CheckForFlush(playerIndex){
        if(PlayerCards[playerIndex]){
            let suitCount = {"Hearts": 0, "Diamonds": 0, "Clubs": 0, "Spades": 0};
            for (let card of PlayerCards[playerIndex]) {
                let suit = card.split(" of ")[1];
                suitCount[suit]++;
            }
            for (let suit in suitCount) {
                if (suitCount[suit] >= 5) {
                    console.log("Player " + (playerIndex + 1) + " has a flush!");
                }
            }
    }

}
function CheckWinner(){
for (let i = 0; i < PlayerCount; i++) {


}



}
function DealAllPlayers(){
    for (let i = 0; i < PlayerCount; i++) {
        PlayerCards[i] = [];
        for (let j = 0; j < 2; j++) {
            PlayerCards[i].push(draw());
        }
    }
}


function shuffle() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

//Aces being the highest index, ie. AllCards[12] == Ace of Spades
function PickRandomCard(CardArray){

}
function draw() {
    return deck.shift(); // removes top card
}

function reset() {
    deck = createDeck();
}
