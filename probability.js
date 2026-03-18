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

    let _probChart = null;
    let _selectedProbCard = null;

    window.populateProbabilityDropdowns = function() {
        const savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');

        // Populate BOTH dropdowns
        ['prob-deck-select', 'live-deck-select'].forEach(selectId => {
            const el = document.getElementById(selectId);
            if (!el) return;
            const currentVal = el.value;
            el.innerHTML = '<option value="">Select a saved deck...</option>';
            savedDecks.forEach(deck => {
                const opt = document.createElement('option');
                opt.value = deck.id;
                opt.textContent = deck.name;
                el.appendChild(opt);
            });
            // Restore selection if still valid
            if (currentVal && savedDecks.find(d => d.id === currentVal)) {
                el.value = currentVal;
            }
        });
    };

    // ── PROBABILITY LAB WIRING ──
    document.addEventListener('DOMContentLoaded', () => {
        populateProbabilityDropdowns();

        const probSelect = document.getElementById('prob-deck-select');
        if (probSelect) {
            probSelect.addEventListener('change', () => {
                _selectedProbCard = null;
                renderProbCardList(probSelect.value);
            });
        }

        const liveSelect = document.getElementById('live-deck-select');
        if (liveSelect) {
            liveSelect.addEventListener('change', () => {
                renderLiveTrackerStats(liveSelect.value);
            });
        }

        const calcBtn = document.getElementById('btn-calc-odds');
        if (calcBtn) {
            calcBtn.addEventListener('click', runHypergeometricCalc);
        }

        const deckSizeSlider = document.getElementById('slider-deck-size');
        const targetCopiesSlider = document.getElementById('slider-target-copies');
        if (deckSizeSlider) {
            deckSizeSlider.addEventListener('input', () => {
                document.getElementById('val-deck-size').textContent = deckSizeSlider.value;
            });
        }
        if (targetCopiesSlider) {
            targetCopiesSlider.addEventListener('input', () => {
                document.getElementById('val-target-copies').textContent = targetCopiesSlider.value;
            });
        }
    });

    function renderProbCardList(deckId) {
        const listEl = document.getElementById('prob-card-list');
        if (!listEl) return;

        if (!deckId) {
            listEl.innerHTML = '<p class="empty-text" style="font-size:0.9rem; padding:10px;">Select a deck first.</p>';
            return;
        }

        const savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');
        const deck = savedDecks.find(d => d.id === deckId);
        if (!deck) return;

        const allCards = window.TCGP_CARDS || [];
        const deckCards = (deck.cards || []).map(id => allCards.find(c => c.id === id)).filter(Boolean);

        // Group by name + count
        const grouped = {};
        deckCards.forEach(c => {
            if (!grouped[c.name]) grouped[c.name] = { card: c, count: 0 };
            grouped[c.name].count++;
        });

        listEl.innerHTML = '';
        Object.values(grouped).forEach(({ card, count }) => {
            const btn = document.createElement('button');
            btn.className = 'prob-card-btn';
            btn.style.cssText = `
                display:flex; align-items:center; gap:8px; width:100%;
                background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
                border-radius:6px; padding:8px 10px; cursor:pointer; margin-bottom:6px;
                color:var(--text-main); font-size:0.85rem; text-align:left;
                transition: border-color 0.2s;
            `;
            btn.innerHTML = `<span style="flex:1">${card.name}</span><span style="color:var(--text-muted)">×${count}</span>`;
            btn.addEventListener('click', () => {
                _selectedProbCard = { card, count };
                document.querySelectorAll('.prob-card-btn').forEach(b => b.style.borderColor = 'rgba(255,255,255,0.1)');
                btn.style.borderColor = 'var(--accent-gold)';
                document.getElementById('slider-target-copies').max = count;
                document.getElementById('slider-target-copies').value = count;
                document.getElementById('val-target-copies').textContent = count;
            });
            listEl.appendChild(btn);
        });

        renderProbChart(deckCards);
        renderMulliganRisk(deckCards);
    }

    function runHypergeometricCalc() {
        if (!_selectedProbCard) {
            document.getElementById('result-percent').textContent = '--%';
            document.getElementById('result-text').textContent = 'Click a card above first.';
            return;
        }
        const N = parseInt(document.getElementById('slider-deck-size').value);
        const K = parseInt(document.getElementById('slider-target-copies').value);
        const n = 1; // next single draw
        const prob = probAtLeastOne(N, K, n);
        document.getElementById('result-percent').textContent = `${(prob * 100).toFixed(1)}%`;
        document.getElementById('result-text').textContent =
            `Chance to draw ${_selectedProbCard.card.name} on next draw (${K} copies, ${N} left in deck)`;
    }

    function renderProbChart(deckCards) {
        const canvas = document.getElementById('prob-chart');
        if (!canvas) return;

        if (_probChart) { _probChart.destroy(); _probChart = null; }

        const DECK_SIZE = 20;
        const labels = ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5'];
        const drawsPerTurn = [5, 6, 7, 8, 9]; // 5-card opening + 1 per turn

        // Find top 3 unique cards by count
        const grouped = {};
        deckCards.forEach(c => {
            if (!grouped[c.name]) grouped[c.name] = { name: c.name, count: 0 };
            grouped[c.name].count++;
        });
        const top3 = Object.values(grouped)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        const colors = ['#f5c518', '#78c850', '#6890f0'];
        const datasets = top3.map((entry, i) => ({
            label: entry.name,
            data: drawsPerTurn.map(n => parseFloat((probAtLeastOne(DECK_SIZE, entry.count, n) * 100).toFixed(1))),
            borderColor: colors[i],
            backgroundColor: colors[i] + '22',
            tension: 0.3,
            fill: true,
            pointRadius: 4
        }));

        _probChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: '#e6edf3' } } },
                scales: {
                    x: { ticks: { color: '#8b949e' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: {
                        min: 0, max: 100,
                        ticks: { color: '#8b949e', callback: v => v + '%' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    function renderMulliganRisk(deckCards) {
        const basics = deckCards.filter(c => c.stage === 'Basic');
        const basicCopies = basics.length;
        const DECK_SIZE = 20;
        const HAND_SIZE = 5;

        // Prob of NO basic in opening hand = hypergeometric P(x=0)
        const pNoBasic = hypergeometricPMF(DECK_SIZE, basicCopies, HAND_SIZE, 0);
        const pBase = parseFloat((pNoBasic * 100).toFixed(1));

        // Opponent bonus draw advantage scenarios
        const pWith1 = parseFloat((hypergeometricPMF(DECK_SIZE, basicCopies, HAND_SIZE + 1, 0) * 100).toFixed(1));
        const pWith2 = parseFloat((hypergeometricPMF(DECK_SIZE, basicCopies, HAND_SIZE + 2, 0) * 100).toFixed(1));
        const pWith3 = parseFloat((hypergeometricPMF(DECK_SIZE, basicCopies, HAND_SIZE + 3, 0) * 100).toFixed(1));

        document.getElementById('mulligan-base-rate').textContent  = `${pBase}%`;
        document.getElementById('mulligan-draw-1').textContent     = `${pWith1}%`;
        document.getElementById('mulligan-draw-2').textContent     = `${pWith2}%`;
        document.getElementById('mulligan-draw-3').textContent     = `+${(pBase - pWith3).toFixed(1)}% advantage`;
    }

    function renderLiveTrackerStats(deckId) {
        const statsEl = document.getElementById('live-tracker-stats');
        if (!statsEl) return;

        if (!deckId) {
            statsEl.innerHTML = '<p class="empty-text">Select a deck to begin tracking your live draws.</p>';
            return;
        }

        const savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');
        const deck = savedDecks.find(d => d.id === deckId);
        if (!deck) return;

        const allCards = window.TCGP_CARDS || [];
        const deckCards = (deck.cards || []).map(id => allCards.find(c => c.id === id)).filter(Boolean);

        const grouped = {};
        deckCards.forEach(c => {
            if (!grouped[c.name]) grouped[c.name] = { card: c, total: 0, drawn: 0 };
            grouped[c.name].total++;
        });

        statsEl.innerHTML = `
            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px;">
                Tracking: <strong style="color:var(--text-main)">${deck.name}</strong>
                — ${deckCards.length} cards
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                ${Object.values(grouped).map(({ card, total }) => `
                    <div style="display:flex; justify-content:space-between; align-items:center;
                        background:rgba(255,255,255,0.04); border-radius:6px; padding:6px 10px;">
                        <span style="font-size:0.85rem">${card.name}</span>
                        <span style="font-size:0.8rem; color:var(--accent-gold)">×${total} in deck</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
