'use strict';

function shuffleDeck(deck) {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function simulateSingleGame(deck, params) {
    const DECK_SIZE = 20;
    const OPENING_HAND = 5;
    const MAX_TURNS = 10;
    const disruption = params.opponentDisruption || 0;

    const shuffled = shuffleDeck(deck);
    let hand = shuffled.slice(0, OPENING_HAND);
    let drawPile = shuffled.slice(OPENING_HAND);
    let active = null;
    let bench = [];
    let turnReached = {};
    let energyAttached = 0;
    let prizesTaken = 0;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        if (drawPile.length > 0) {
            hand.push(drawPile.shift());
        }

        // Opponent disruption — randomly discard a hand card
        if (Math.random() < disruption && hand.length > 1) {
            const discardIdx = Math.floor(Math.random() * hand.length);
            hand.splice(discardIdx, 1);
        }

        // Play Basic Pokémon from hand
        hand.forEach((card, idx) => {
            if (card.stage === 'Basic' && card.type !== 'Supporter' && card.type !== 'Item') {
                if (!active) {
                    active = card;
                    hand.splice(idx, 1);
                } else if (bench.length < 3) {
                    bench.push(card);
                    hand.splice(idx, 1);
                }
            }
        });

        // Track which cards arrived in hand by which turn
        hand.forEach(card => {
            if (!turnReached[card.name]) {
                turnReached[card.name] = turn;
            }
        });

        // Simulate energy attachment
        if (active) energyAttached++;

        // Simulate prize taking — rough heuristic
        if (active && energyAttached >= 2 && turn >= 2) {
            if (Math.random() < 0.3) prizesTaken++;
        }
    }

    return { turnReached, prizesTaken, energyAttached };
}

function runMonteCarlo(deck, simCount, params) {
    const cardStats = {};
    deck.forEach(card => {
        if (!cardStats[card.name]) {
            cardStats[card.name] = {
                totalTurnReached: 0,
                gamesAppeared: 0,
                avgContributionScore: 0
            };
        }
    });

    let totalPrizes = 0;

    for (let i = 0; i < simCount; i++) {
        const result = simulateSingleGame(deck, params);
        totalPrizes += result.prizesTaken;

        for (const [cardName, turn] of Object.entries(result.turnReached)) {
            if (cardStats[cardName]) {
                cardStats[cardName].totalTurnReached += turn;
                cardStats[cardName].gamesAppeared++;
            }
        }
    }

    // Calculate avgContributionScore per card
    // Earlier arrival + more appearances = higher score
    for (const [name, stats] of Object.entries(cardStats)) {
        if (stats.gamesAppeared === 0) {
            stats.avgContributionScore = 0;
        } else {
            const avgTurn = stats.totalTurnReached / stats.gamesAppeared;
            const appearanceRate = stats.gamesAppeared / simCount;
            // Lower turn = better. Normalize: score = appearanceRate / avgTurn
            stats.avgContributionScore = parseFloat(
                (appearanceRate / avgTurn).toFixed(4)
            );
        }
    }

    return {
        cardStats,
        avgPrizesPerGame: parseFloat((totalPrizes / simCount).toFixed(3))
    };
}

function runEnsembleSimulation(deck, simCount) {
    simCount = simCount || 1000;

    const scenarios = {
        bestCase:  { opponentDisruption: 0.0, label: 'Best Case' },
        baseCase:  { opponentDisruption: 0.3, label: 'Base Case' },
        worstCase: { opponentDisruption: 0.7, label: 'Worst Case' }
    };

    const results = {};
    for (const [key, params] of Object.entries(scenarios)) {
        results[key] = runMonteCarlo(deck, simCount, params);
    }

    return synthesiseResults(results);
}

function synthesiseResults(results) {
    const weights = { bestCase: 0.2, baseCase: 0.6, worstCase: 0.2 };
    const cardScores = {};

    for (const [scenario, weight] of Object.entries(weights)) {
        const scenarioData = results[scenario];
        if (!scenarioData) continue;

        for (const [cardName, stats] of Object.entries(scenarioData.cardStats)) {
            if (!cardScores[cardName]) {
                cardScores[cardName] = {
                    weightedScore: 0,
                    bestCase: 0,
                    baseCase: 0,
                    worstCase: 0,
                    consistencyRating: 0
                };
            }
            cardScores[cardName][scenario] = stats.avgContributionScore;
            cardScores[cardName].weightedScore +=
                stats.avgContributionScore * weight;
        }
    }

    // Calculate consistency rating per card
    for (const card of Object.values(cardScores)) {
        const scores = [card.bestCase, card.baseCase, card.worstCase];
        const mean = card.weightedScore;
        const variance = scores.reduce((sum, s) =>
            sum + Math.pow(s - mean, 2), 0) / 3;
        card.consistencyRating = parseFloat(
            (1 / (1 + variance)).toFixed(4)
        );
    }

    return cardScores;
}

// ── EXPORTS ──
window.runMonteCarlo = runMonteCarlo;
window.runEnsembleSimulation = runEnsembleSimulation;
window.synthesiseResults = synthesiseResults;
