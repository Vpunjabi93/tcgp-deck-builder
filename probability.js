'use strict';

// ── CORE MATHS ──

function binomialCoeff(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 0; i < k; i++) {
        result *= (n - i) / (i + 1);
    }
    return result;
}

function hypergeometricPMF(N, K, n, x) {
    if (x < 0 || x > Math.min(K, n)) return 0;
    if (n > N) return 0;
    return (binomialCoeff(K, x) * binomialCoeff(N - K, n - x))
           / binomialCoeff(N, n);
}

function probAtLeastOne(N, K, n) {
    if (K <= 0) return 0;
    if (n >= N) return 1;
    const p0 = hypergeometricPMF(N, K, n, 0);
    return parseFloat((1 - p0).toFixed(4));
}

// ── TIMING ANALYSIS ──

function getPrerequisiteChain(card, deck) {
    const basics = window.BASICS_MAP || {};
    const chain = [];

    if (card.stage === 'Stage 1') {
        const basicName = basics[card.name];
        if (basicName && deck.some(c => c.name === basicName)) {
            chain.push(basicName);
        }
    }

    if (card.stage === 'Stage 2') {
        const stage1Name = basics[card.name];
        if (stage1Name) {
            chain.push(stage1Name);
            const basicName = basics[stage1Name];
            if (basicName && deck.some(c => c.name === basicName)) {
                chain.push(basicName);
            }
        }
    }

    return chain;
}

function setupSpeedScore(card, deck) {
    const DECK_SIZE = 20;
    const OPENING_HAND = 5;
    const TURN_2_DRAWS = OPENING_HAND + 2;

    const copiesInDeck = deck.filter(c => c.name === card.name).length;
    if (copiesInDeck === 0) return 0;

    const probByTurn2 = probAtLeastOne(DECK_SIZE, copiesInDeck, TURN_2_DRAWS);

    const prerequisites = getPrerequisiteChain(card, deck);
    let chainPenalty = 0;
    for (const prereqName of prerequisites) {
        const prereqCopies = deck.filter(c => c.name === prereqName).length;
        const prereqProb = probAtLeastOne(DECK_SIZE, prereqCopies, TURN_2_DRAWS);
        chainPenalty += (1 - prereqProb) * 0.25;
    }

    return parseFloat(Math.max(0, probByTurn2 - chainPenalty).toFixed(4));
}

function prerequisiteVulnerabilityScore(card, deck) {
    const DECK_SIZE = 20;
    const OPENING_HAND = 5;
    const TURN_3_DRAWS = OPENING_HAND + 3;

    const prerequisites = getPrerequisiteChain(card, deck);
    if (prerequisites.length === 0) return 1.0;

    let combinedProb = 1.0;
    for (const prereqName of prerequisites) {
        const copies = deck.filter(c => c.name === prereqName).length;
        const prob = probAtLeastOne(DECK_SIZE, copies, TURN_3_DRAWS);
        combinedProb *= prob;
    }

    return parseFloat(combinedProb.toFixed(4));
}

// ── EXPORTS ──

window.binomialCoeff = binomialCoeff;
window.hypergeometricPMF = hypergeometricPMF;
window.probAtLeastOne = probAtLeastOne;
window.setupSpeedScore = setupSpeedScore;
window.prerequisiteVulnerabilityScore = prerequisiteVulnerabilityScore;
