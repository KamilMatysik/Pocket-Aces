// poker.js

function createDeck() {
    const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
    const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    const deck = [];
    for (let s of suits)
        for (let r of ranks)
            deck.push(`${r} of ${s}`);
    return deck;
}

function shuffle(deck){
    for (let i = deck.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function draw(game){ return game.deck.shift(); }

function createGame(players, startingChips = 1000){
    return {
        deck: shuffle(createDeck()),
        community: [],
        stage: "preflop",
        pot: 0,
        currentBet: 0,
        lastRaiserIndex: null,
        currentPlayerIndex: 0,
        dealerIndex: 0,
        players: players.map(p => ({
            id: p.id,
            username: p.username,
            hand: [],
            chips: p.chips !== undefined ? p.chips : startingChips,
            bet: 0,
            totalIn: 0,
            folded: false,
            allIn: false,
            acted: false
        }))
    };
}

function dealHands(game){
    for (let p of game.players){
        p.hand = [];
        p.folded = false;
        p.allIn = false;
        p.bet = 0;
        p.totalIn = 0;
        p.acted = false;
        // Auto-fold anyone with no chips — they should have been eliminated
        // but guard here just in case
        if(p.chips <= 0){ p.folded = true; p.allIn = true; }
    }
    for (let i = 0; i < 2; i++)
        for (let p of game.players)
            if(!p.folded) p.hand.push(draw(game));
}

function dealFlop(game){
    draw(game);
    game.community.push(draw(game), draw(game), draw(game));
    game.stage = "flop";
}

function dealTurn(game){
    draw(game);
    game.community.push(draw(game));
    game.stage = "turn";
}

function dealRiver(game){
    draw(game);
    game.community.push(draw(game));
    game.stage = "river";
}

// Post blinds. Players with fewer chips than the blind go all-in for what they have.
function postBlinds(game, smallBlind = 10, bigBlind = 20){
    const players = game.players;
    const count = players.length;

    const sbIndex = (game.dealerIndex + 1) % count;
    const bbIndex = (game.dealerIndex + 2) % count;

    const sbPlayer = players[sbIndex];
    const bbPlayer = players[bbIndex];

    const sbAmount = Math.min(smallBlind, sbPlayer.chips);
    const bbAmount = Math.min(bigBlind, bbPlayer.chips);

    sbPlayer.chips -= sbAmount;
    sbPlayer.bet = sbAmount;
    sbPlayer.totalIn = sbAmount;
    if(sbPlayer.chips === 0) sbPlayer.allIn = true;

    bbPlayer.chips -= bbAmount;
    bbPlayer.bet = bbAmount;
    bbPlayer.totalIn = bbAmount;
    if(bbPlayer.chips === 0) bbPlayer.allIn = true;

    game.pot += sbAmount + bbAmount;
    game.currentBet = bbAmount;

    game.currentPlayerIndex = (bbIndex + 1) % count;
    game.lastRaiserIndex = bbIndex;

    return { sbIndex, bbIndex, sbAmount, bbAmount };
}

// Reset for a new street. Returns true if at least one player can still act,
// false if everyone is all-in/folded (caller should skip to next street).
function resetBettingRound(game){
    game.currentBet = 0;
    game.lastRaiserIndex = null;
    for(let p of game.players){
        p.bet = 0;
        p.acted = false;
    }
    const count = game.players.length;
    let idx = (game.dealerIndex + 1) % count;
    for(let i = 0; i < count; i++){
        if(!game.players[idx].folded && !game.players[idx].allIn){
            game.currentPlayerIndex = idx;
            return true; // someone can act
        }
        idx = (idx + 1) % count;
    }
    return false; // nobody can act — all remaining players are all-in
}

function applyAction(game, socketId, action, amount){
    const player = game.players[game.currentPlayerIndex];
    if(!player || player.id !== socketId)
        return { valid: false, error: "Not your turn" };

    amount = parseInt(amount) || 0;

    if(action === "fold"){
        player.folded = true;
        player.acted = true;
        return { valid: true };
    }

    if(action === "check"){
        if(game.currentBet > player.bet)
            return { valid: false, error: "Cannot check — there is a bet to call" };
        player.acted = true;
        return { valid: true };
    }

    if(action === "call"){
        const toCall = Math.min(game.currentBet - player.bet, player.chips);
        player.chips -= toCall;
        player.bet += toCall;
        player.totalIn += toCall;
        game.pot += toCall;
        if(player.chips === 0) player.allIn = true;
        player.acted = true;
        return { valid: true };
    }

    if(action === "raise"){
        const minRaise = game.currentBet * 2 || 20;
        if(amount < minRaise)
            return { valid: false, error: `Minimum raise is ${minRaise}` };
        if(amount > player.chips + player.bet)
            return { valid: false, error: "Not enough chips" };

        const extra = amount - player.bet;
        player.chips -= extra;
        game.pot += extra;
        player.totalIn += extra;
        player.bet = amount;
        game.currentBet = amount;
        game.lastRaiserIndex = game.currentPlayerIndex;
        if(player.chips === 0) player.allIn = true;
        player.acted = true;
        game.players.forEach((p, i) => {
            if(i !== game.currentPlayerIndex && !p.folded && !p.allIn)
                p.acted = false;
        });
        return { valid: true };
    }

    return { valid: false, error: "Unknown action" };
}

function isBettingRoundOver(game){
    const active = game.players.filter(p => !p.folded && !p.allIn);
    if(active.length <= 1) return true;
    return active.every(p => p.acted && p.bet === game.currentBet);
}

function isOnlyOneLeft(game){
    return game.players.filter(p => !p.folded).length === 1;
}

// ─── HAND EVALUATION ─────────────────────────────────────────────────────────

function parseCard(card){
    const parts = card.split(" ");
    return { rank: parts[0], suit: parts[2] };
}

const rankMap = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14};

function evaluateHandFull(cards){
    const parsed = cards.map(parseCard);
    const suits = {};
    const ranks = {};
    parsed.forEach(c => {
        suits[c.suit] = (suits[c.suit] || 0) + 1;
        const val = rankMap[c.rank];
        ranks[val] = (ranks[val] || 0) + 1;
    });
    const sortedRanks = Object.keys(ranks).map(Number).sort((a,b) => b - a);

    let flushSuit = null;
    for(const s in suits) if(suits[s] >= 5) flushSuit = s;

    const rankSet = new Set(sortedRanks);
    const straightHigh = findStraight(rankSet);

    if(flushSuit){
        const flushCards = parsed.filter(c => c.suit === flushSuit).map(c => rankMap[c.rank]);
        const sfHigh = findStraight(new Set(flushCards));
        if(sfHigh) return { rank: 9, highCard: sfHigh, kickers: [] };
    }

    const four = Object.keys(ranks).find(r => ranks[r] === 4);
    if(four){
        const kicker = sortedRanks.find(r => r !== Number(four));
        return { rank: 8, highCard: Number(four), kickers: [kicker] };
    }

    const three = Object.keys(ranks).filter(r => ranks[r] === 3).map(Number).sort((a,b) => b - a);
    const pairs = Object.keys(ranks).filter(r => ranks[r] === 2).map(Number).sort((a,b) => b - a);

    if(three.length > 0 && (pairs.length > 0 || three.length > 1)){
        const pairCard = pairs.length > 0 ? pairs[0] : three[1];
        return { rank: 7, highCard: three[0], kickers: [pairCard] };
    }

    if(flushSuit){
        const flushCards = parsed.filter(c => c.suit === flushSuit).map(c => rankMap[c.rank]).sort((a,b) => b - a).slice(0,5);
        return { rank: 6, highCard: flushCards[0], kickers: flushCards.slice(1) };
    }

    if(straightHigh) return { rank: 5, highCard: straightHigh, kickers: [] };

    if(three.length > 0){
        const kickers = sortedRanks.filter(r => r !== three[0]).slice(0, 2);
        return { rank: 4, highCard: three[0], kickers };
    }

    if(pairs.length >= 2){
        const kicker = sortedRanks.find(r => r !== pairs[0] && r !== pairs[1]);
        return { rank: 3, highCard: pairs[0], secondHigh: pairs[1], kickers: [kicker] };
    }

    if(pairs.length === 1){
        const kickers = sortedRanks.filter(r => r !== pairs[0]).slice(0, 3);
        return { rank: 2, highCard: pairs[0], kickers };
    }

    // High card — store all 5 top kickers for full comparison
    const kickers = sortedRanks.slice(0, 5);
    return { rank: 1, highCard: kickers[0], kickers: kickers.slice(1) };
}

function findStraight(rankSet){
    // Scan high-to-low so we always find the BEST (highest) straight first
    const ranks = Array.from(rankSet).sort((a,b) => b - a);
    for(let i = 0; i <= ranks.length - 5; i++)
        if(ranks[i] - ranks[i+4] === 4) return ranks[i];
    // Wheel: A-2-3-4-5 (A plays as low)
    if(rankSet.has(14)&&rankSet.has(2)&&rankSet.has(3)&&rankSet.has(4)&&rankSet.has(5)) return 5;
    return null;
}

// Full comparison including all kicker cards
function compareHands(h1, h2){
    if(h1.rank !== h2.rank) return h1.rank - h2.rank;
    if(h1.highCard !== h2.highCard) return h1.highCard - h2.highCard;
    if((h1.secondHigh || 0) !== (h2.secondHigh || 0)) return (h1.secondHigh || 0) - (h2.secondHigh || 0);
    // Compare kickers in order
    const k1 = h1.kickers || [];
    const k2 = h2.kickers || [];
    for(let i = 0; i < Math.max(k1.length, k2.length); i++){
        const diff = (k1[i] || 0) - (k2[i] || 0);
        if(diff !== 0) return diff;
    }
    return 0;
}

const handNames = ["","High Card","One Pair","Two Pair","Three of a Kind","Straight","Flush","Full House","Four of a Kind","Straight Flush"];

function getBestHand(player, community){
    return evaluateHandFull([...player.hand, ...community]);
}

// ─── SIDE POT RESOLUTION ─────────────────────────────────────────────────────

function buildSidePots(game){
    const activePlayers = game.players.filter(p => !p.folded);
    const allPlayers    = game.players;

    const caps = [...new Set(
        allPlayers.filter(p => p.allIn).map(p => p.totalIn)
    )].sort((a, b) => a - b);

    const maxContrib = Math.max(...allPlayers.map(p => p.totalIn));
    if(!caps.includes(maxContrib)) caps.push(maxContrib);

    const pots = [];
    let prevCap = 0;

    for(const cap of caps){
        const layerSize = cap - prevCap;
        if(layerSize <= 0){ prevCap = cap; continue; }

        const potAmount = allPlayers.reduce((sum, p) =>
            sum + Math.min(Math.max(p.totalIn - prevCap, 0), layerSize), 0);

        if(potAmount <= 0){ prevCap = cap; continue; }

        const eligible = activePlayers.filter(p => p.totalIn >= cap);
        pots.push({ amount: potAmount, eligible, cap });
        prevCap = cap;
    }

    return pots;
}

function resolveShowdown(game){
    const pots   = buildSidePots(game);
    const awards = [];

    for(const pot of pots){
        if(pot.eligible.length === 0) continue;

        let bestVal     = null;
        let bestPlayers = [];

        for(const p of pot.eligible){
            const val = getBestHand(p, game.community);
            const cmp = bestVal ? compareHands(val, bestVal) : 1;
            if(cmp > 0){
                bestVal     = val;
                bestPlayers = [p];
            } else if(cmp === 0){
                bestPlayers.push(p);
            }
        }

        const share     = Math.floor(pot.amount / bestPlayers.length);
        const remainder = pot.amount - share * bestPlayers.length;

        bestPlayers.forEach((p, i) => {
            p.chips += share + (i === 0 ? remainder : 0);
        });

        awards.push({
            potAmount : pot.amount,
            winners   : bestPlayers.map(p => p.username),
            handName  : handNames[bestVal.rank]
        });
    }

    const reveal = game.players
        .filter(p => !p.folded)
        .map(p => ({ username: p.username, hand: p.hand }));

    return { awards, reveal };
}

function awardLastPlayer(game){
    const winner = game.players.find(p => !p.folded);
    winner.chips += game.pot;
    return {
        awards : [{ potAmount: game.pot, winners: [winner.username], handName: "Everyone folded" }],
        reveal : []
    };
}

function getBustedPlayers(game){
    return game.players.filter(p => p.chips <= 0).map(p => p.id);
}

module.exports = {
    createGame,
    dealHands,
    dealFlop,
    dealTurn,
    dealRiver,
    postBlinds,
    resetBettingRound,
    applyAction,
    isBettingRoundOver,
    isOnlyOneLeft,
    resolveShowdown,
    awardLastPlayer,
    getBustedPlayers
};