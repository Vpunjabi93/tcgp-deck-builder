// probability.js - Math Engine for TCGP Odds

// --- Math Utilities ---

// Calculate Factorial
function fact(n) {
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
}

// Calculate Combinations: C(n, r)
function comb(n, r) {
    if (r < 0 || r > n) return 0;
    return fact(n) / (fact(r) * fact(n - r));
}

// Hypergeometric Distribution
// N = Population (e.g. 20 cards in deck)
// K = Successes in population (e.g. 2 Charizards in deck)
// n = Sample size (e.g. draw 5 cards)
// k = Exact successes in sample
function hypergeom(N, K, n, k) {
    return (comb(K, k) * comb(N - K, n - k)) / comb(N, n);
}

// Cumulative Probability P(X >= k)
function probAtLeast(N, K, n, k_min) {
    let prob = 0;
    for (let k = k_min; k <= K && k <= n; k++) {
        prob += hypergeom(N, K, n, k);
    }
    return prob;
}

// --- Advanced Statistical Distributions ---

/**
 * Multivariate Hypergeometric Distribution (Complex Draws)
 * Calculates the probability of drawing a specific combination of multiple different target cards.
 * @param {number[]} K_array - Array representing total available copies of each category in the remaining deck.
 * @param {number[]} k_array - Array representing exact number of cards we want to draw from each category.
 * @returns {number} Probability of this exact hand forming (0.0 to 1.0).
 */
function multiHypergeom(K_array, k_array) {
    if (!Array.isArray(K_array) || !Array.isArray(k_array) || K_array.length !== k_array.length) {
        return 0;
    }
    
    let combinationsProduct = 1;
    let totalPopulation = 0;
    let totalSample = 0;
    
    for (let i = 0; i < K_array.length; i++) {
        const K = K_array[i];
        const k = k_array[i];
        
        // Cannot draw more of a category than exists, or negatively
        if (k > K || k < 0) return 0;
        
        combinationsProduct *= comb(K, k);
        totalPopulation += K;
        totalSample += k;
    }
    
    const possibleHands = comb(totalPopulation, totalSample);
    if (possibleHands === 0) return 0;
    
    return combinationsProduct / possibleHands;
}

/**
 * Binomial Distribution (Coin Flips)
 * Calculates the exact probability of getting exactly 'k' successes (heads) in 'n' independent attempts (flips).
 * Used for mechanics like "Flip 3 coins, does 50 damage times the number of heads."
 * @param {number} n - Total number of trials/flips.
 * @param {number} k - Exact number of successes/heads desired.
 * @param {number} [p=0.5] - Probability of a single success (default is 0.5 for a standard coin).
 * @returns {number} Probability (0.0 to 1.0).
 */
function binomialEq(n, k, p = 0.5) {
    if (k < 0 || k > n) return 0;
    return comb(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/**
 * Geometric Distribution (Time to Success)
 * Calculates the probability that the FIRST success (heads) occurs exactly on the k-th attempt.
 * @param {number} k - The attempt number on which the first success occurs (k >= 1).
 * @param {number} [p=0.5] - Probability of a single success (default is 0.5).
 * @returns {number} Probability (0.0 to 1.0).
 */
function geometricEq(k, p = 0.5) {
    if (k < 1) return 0; // Success must occur at attempt 1 or later
    return Math.pow(1 - p, k - 1) * p;
}

// --- TCGP Specific Math ---

// Calculates the true odds of drawing X copies of a Specific Card in the opening hand.
// Accounts for the forced "Must have at least 1 Basic" rule.
function calcTrueOpeningHandOdds(deck, targetIds) {
    if(!Array.isArray(targetIds)) targetIds = [targetIds];
    let N = 20;
    let n = 5; // Opening hand size
    
    // Count Basics in the deck overall
    let totalBasics = 0;
    deck.forEach(c => { if(c.stage === 'Basic') totalBasics++; });
    
    // Count copies of our target card
    const targetCards = deck.filter(c => targetIds.includes(c.id));
    let K = targetCards.length;
    
    if(K === 0) return 0;
    const hasBasicTarget = targetCards.some(c => c.stage === 'Basic');

    // P(Brick) = Chance hand has 0 Basics.
    let pBrick = hypergeom(N, totalBasics, n, 0);
    
    // True valid opening hand math
    if(hasBasicTarget) {
        // If the target IS a Basic, we just use standard Hypergeometric.
        // Because if we draw the target, the hand is automatically valid (has a basic).
        // (This is a slight simplification of conditional probability but highly accurate for this edge case).
        return probAtLeast(N, K, n, 1);
    } else {
        // Target is an Item, Supporter, or Evolution.
        // The hand MUST contain at least 1 Basic. The target is NOT a basic.
        // Therefore, 1 slot of the 5 is "reserved" for a Basic.
        // We calculate the odds of finding the target in the remaining 4 slots.
        return probAtLeast(N - 1, K, n - 1, 1);
    }
}

// General function for mid-match draws.
function calcLiveOdds(cardsRemaining, copiesRemaining, cardsToDraw) {
    if (cardsRemaining <= 0 || copiesRemaining <= 0) return 0;
    if (cardsToDraw >= cardsRemaining) return 1;
    return probAtLeast(cardsRemaining, copiesRemaining, cardsToDraw, 1);
}

// --- UI Binding ---

window.populateProbabilityDropdowns = function() {
    const selDeck = document.getElementById('prob-deck-select');
    selDeck.innerHTML = '<option value="">Select a saved deck...</option>';
    
    let savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');
    savedDecks.forEach((deck, idx) => {
        selDeck.innerHTML += `<option value="${idx}">${deck.name}</option>`;
    });
};

document.addEventListener('DOMContentLoaded', () => {
    // Populate dropdowns initially
    populateProbabilityDropdowns();

    // Chart.js instance tracking
    let probChartInstance = null;
    let currentLoadedDeck = null;

    // Listeners
    document.getElementById('prob-deck-select').addEventListener('change', (e) => {
        const idx = e.target.value;
        if(idx === "") return;
        
        let savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');
        const deckData = savedDecks[idx];
        
        // Hydrate from IDs
        const allCards = getAllCards();
        currentLoadedDeck = deckData.cards.map(id => allCards.find(c => c.id === id)).filter(Boolean);
        
        // Populate Target Card visual list with unique cards in the deck
        const uniqueCards = [...new Map(currentLoadedDeck.map(item => [item.id, item])).values()];
        const listContainer = document.getElementById('prob-card-list');
        if (listContainer) {
            listContainer.innerHTML = uniqueCards.map(c => `
                <div class="prob-list-card" data-id="${c.id}">
                    ${window.generateCardHTML ? window.generateCardHTML(c, 'prob-img') : `<img src="${c.img}" class="prob-img">`}
                </div>
            `).join('');
            
            // Add click listeners
            document.querySelectorAll('.prob-list-card').forEach(el => {
                el.addEventListener('click', () => {
                    const cid = el.dataset.id;
                    el.classList.toggle('selected-card');
                    
                    if (!window.selectedCardsForLab) window.selectedCardsForLab = [];
                    if (window.selectedCardsForLab.includes(cid)) {
                        window.selectedCardsForLab = window.selectedCardsForLab.filter(id => id !== cid);
                    } else {
                        window.selectedCardsForLab.push(cid);
                    }
                    
                    // Update slider based on selection
                    let totalK = 0;
                    window.selectedCardsForLab.forEach(id => {
                        totalK += currentLoadedDeck.filter(card => card.id === id).length;
                    });
                    document.getElementById('slider-target-copies').value = totalK;
                    document.getElementById('val-target-copies').innerText = totalK;
                    
                    updateCalculations();
                });
            });

            if (uniqueCards.length > 0) {
                window.selectedCardsForLab = [uniqueCards[0].id];
                const firstCardEl = document.querySelector('.prob-list-card');
                if (firstCardEl) firstCardEl.classList.add('selected-card');
            } else {
                window.selectedCardsForLab = [];
            }
        }
        
        // Reset Sliders for turn 1 Match state
        document.getElementById('slider-deck-size').value = 20;
        document.getElementById('val-deck-size').innerText = 20;
        
        const count = currentLoadedDeck.filter(c => c.id === uniqueCards[0].id).length;
        document.getElementById('slider-target-copies').value = count;
        document.getElementById('val-target-copies').innerText = count;
        
        updateCalculations();
    });

    // Removed prob-target-card change listener

    ['slider-deck-size', 'slider-target-copies'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            const valId = id.replace('slider-', 'val-');
            document.getElementById(valId).innerText = e.target.value;
        });
    });

    document.getElementById('btn-calc-odds').addEventListener('click', updateCalculations);

    function updateCalculations() {
        if(!currentLoadedDeck) return;

        const N = parseInt(document.getElementById('slider-deck-size').value);
        const K = parseInt(document.getElementById('slider-target-copies').value);
        
        // Mid-match single card draw odds
        const nextDrawOdds = calcLiveOdds(N, K, 1) * 100;
        
        document.getElementById('result-percent').innerText = `${nextDrawOdds.toFixed(1)}%`;

        // Generate Chart Data (Odds by Turn 1-10)
        // Assume Turn 1 you have seen 5 cards if N=20 initially.
        let chartLabels = [];
        let chartData = [];
        
        // If they are starting from a fresh 20 deck (Opening hand logic)
        for(let turn=1; turn<=10; turn++) {
            chartLabels.push(`Turn ${turn}`);
            
            // Turn 1 = Opening 5. Turn 2 = Seen 6. Turn 3 = Seen 7.
            // We'll map turn number directly to cards seen for the chart assuming no search items.
            let cardsSeen = 4 + turn; // Turn 1 (5 cards), Turn 2 (6), etc.
            
            if(N === 20 && turn === 1) {
                chartData.push(calcTrueOpeningHandOdds(currentLoadedDeck, window.selectedCardsForLab || []) * 100);
            } else {
                // By turn N odds
                chartData.push(calcLiveOdds(20, K, cardsSeen) * 100);
            }
        }

        // Calculate Mulligan Risks
        const mulliganStats = calcMulliganRisks(currentLoadedDeck);
        document.getElementById('mulligan-base-rate').innerText = `${mulliganStats.mulliganRate.toFixed(1)}%`;
        document.getElementById('mulligan-draw-1').innerText = `${mulliganStats.give1ExtraCard.toFixed(1)}%`;
        document.getElementById('mulligan-draw-2').innerText = `${mulliganStats.give2ExtraCards.toFixed(1)}%`;
        document.getElementById('mulligan-draw-3').innerText = `${mulliganStats.give3PlusExtraCards.toFixed(1)}%`;

        renderChart(chartLabels, chartData);
    }

    function renderChart(labels, data) {
        const ctx = document.getElementById('prob-chart').getContext('2d');
        
        if(probChartInstance) {
            probChartInstance.destroy();
        }

        probChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cumulative Draw %',
                    data: data,
                    borderColor: '#f5c518',
                    backgroundColor: 'rgba(245, 197, 24, 0.2)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: '#8b949e', callback: v => v + '%' },
                        grid: { color: '#30363d' }
                    },
                    x: {
                        ticks: { color: '#8b949e' },
                        grid: { color: '#30363d' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
});
