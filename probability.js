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
let _labDeckCards = [];
let _labPlayState = {};
let _labDeckId = null;

window.populateProbabilityDropdowns = function() {
    const savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');
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
        if (currentVal && savedDecks.find(d => d.id === currentVal)) el.value = currentVal;
    });
};

document.addEventListener('DOMContentLoaded', () => {
    populateProbabilityDropdowns();

    const probSelect = document.getElementById('prob-deck-select');
    if (probSelect) {
        probSelect.addEventListener('change', () => {
            _selectedProbCard = null;
            loadLabDeck(probSelect.value);
        });
    }

    const liveSelect = document.getElementById('live-deck-select');
    if (liveSelect) {
        liveSelect.addEventListener('change', () => renderLiveTrackerStats(liveSelect.value));
    }

    const calcBtn = document.getElementById('btn-calc-odds');
    if (calcBtn) calcBtn.addEventListener('click', runHypergeometricCalc);

    const deckSizeSlider = document.getElementById('slider-deck-size');
    const targetCopiesSlider = document.getElementById('slider-target-copies');
    if (deckSizeSlider) deckSizeSlider.addEventListener('input', () => {
        document.getElementById('val-deck-size').textContent = deckSizeSlider.value;
    });
    if (targetCopiesSlider) targetCopiesSlider.addEventListener('input', () => {
        document.getElementById('val-target-copies').textContent = targetCopiesSlider.value;
    });

    const resetBtn = document.getElementById('btn-reset-tracker');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        Object.keys(_labPlayState).forEach(k => {
            _labPlayState[k].played = 0;
            _labPlayState[k].inHand = 0;
        });
        renderLabCardList();
        renderNextDrawPanel();
        updateRemainingCount();
    });
});

// ── Load deck into lab state ──────────────────────────────────────────
function loadLabDeck(deckId) {
    if (!deckId) return;
    const savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');
    const deck = savedDecks.find(d => d.id === deckId);
    if (!deck) return;

    const allCards = window.TCGP_CARDS || [];
    _labDeckCards = (deck.cards || []).map(id => allCards.find(c => c.id === id)).filter(Boolean);
    _labDeckId = deckId;

    _labPlayState = {};
    _labDeckCards.forEach(c => {
        if (!_labPlayState[c.name]) _labPlayState[c.name] = { card: c, total: 0, played: 0, inHand: 0 };
        _labPlayState[c.name].total++;
    });

    renderMulliganRisk(_labDeckCards);
    renderLabCardList();
    renderProbChart(_labDeckCards);
    renderNextDrawPanel();
    updateRemainingCount();

    const mulliganStrip = document.getElementById('mulligan-strip');
    const resetBtn = document.getElementById('btn-reset-tracker');
    if (mulliganStrip) mulliganStrip.style.display = 'flex';
    if (resetBtn) resetBtn.style.display = 'inline-block';
}

// ── Helpers ───────────────────────────────────────────────────────────
function getTotalRemaining() {
    return 20 - Object.values(_labPlayState).reduce((s, v) => s + v.played + (v.inHand || 0), 0);
}

function updateRemainingCount() {
    const el = document.getElementById('cards-remaining-count');
    if (!el) return;
    const totalPlayed = Object.values(_labPlayState).reduce((s, v) => s + v.played, 0);
    const totalInHand = Object.values(_labPlayState).reduce((s, v) => s + (v.inHand || 0), 0);
    el.textContent = `${20 - totalPlayed - totalInHand} in deck · ${totalInHand} in hand`;
}

function _refreshLabAfterStateChange(changedCardName) {
    updateRemainingCount();
    renderLabCardList();
    renderNextDrawPanel();

    const deckSlider = document.getElementById('slider-deck-size');
    const copiesSlider = document.getElementById('slider-target-copies');
    if (deckSlider) {
        deckSlider.value = getTotalRemaining();
        document.getElementById('val-deck-size').textContent = getTotalRemaining();
    }

    if (_selectedProbCard && _selectedProbCard.card.name === changedCardName) {
        const state = _labPlayState[changedCardName];
        const rem = state.total - state.played - (state.inHand || 0);
        _selectedProbCard.count = rem;
        if (copiesSlider) {
            copiesSlider.value = rem;
            document.getElementById('val-target-copies').textContent = rem;
        }
        renderProbChartForSelected(_labDeckCards, changedCardName);
        runHypergeometricCalc();
    } else if (_selectedProbCard) {
        renderProbChartForSelected(_labDeckCards, _selectedProbCard.card.name);
        runHypergeometricCalc();
    }
}

// ── Card list with In Hand / Played buttons ───────────────────────────
function renderLabCardList() {
    const listEl = document.getElementById('prob-card-list');
    if (!listEl) return;

    if (Object.keys(_labPlayState).length === 0) {
        listEl.innerHTML = '<p class="empty-text" style="font-size:0.9rem; padding:10px;">Select a deck first.</p>';
        return;
    }

    listEl.innerHTML = '';

    Object.values(_labPlayState).forEach(({ card, total, played, inHand }) => {
        inHand = inHand || 0;
        const remaining = total - played - inHand;
        const deckRemaining = getTotalRemaining();
        const prob = remaining > 0 && deckRemaining > 0
            ? (probAtLeastOne(deckRemaining, remaining, 1) * 100).toFixed(1)
            : '0.0';

        const isSelected = _selectedProbCard && _selectedProbCard.card.name === card.name;
        const isFullyGone = remaining <= 0;
        const barColor = parseFloat(prob) >= 15 ? '#f5c518' : parseFloat(prob) >= 8 ? '#78c850' : '#8b949e';

        const row = document.createElement('div');
        row.style.cssText = `
            display:flex; align-items:center; gap:10px; width:100%;
            background:${isSelected ? 'rgba(245,197,24,0.08)' : 'rgba(255,255,255,0.04)'};
            border:1px solid ${isSelected ? 'var(--accent-gold)' : 'rgba(255,255,255,0.1)'};
            border-radius:8px; padding:8px 10px; margin-bottom:6px;
            opacity:${isFullyGone ? '0.4' : '1'};
            cursor:pointer;
            transition: border-color 0.15s, background 0.15s;
        `;

        const imgHTML = typeof window.generateCardHTML === 'function'
            ? window.generateCardHTML(card, 'prob-card-thumb') : '';

        const handBadge = inHand > 0
            ? `<span style="font-size:0.7rem; padding:2px 6px; background:rgba(120,200,80,0.2); border:1px solid rgba(120,200,80,0.4); border-radius:4px; color:#78c850; margin-left:4px;">✋ ${inHand} in hand</span>`
            : '';
        const playedBadge = played > 0
            ? `<span style="font-size:0.7rem; padding:2px 6px; background:rgba(255,68,68,0.15); border:1px solid rgba(255,68,68,0.3); border-radius:4px; color:#ff8888; margin-left:4px;">▶ ${played} played</span>`
            : '';

        row.innerHTML = `
            ${imgHTML}
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:2px; margin-bottom:2px;">
                    <span style="font-size:0.85rem; font-weight:500;">${card.name}</span>
                    ${handBadge}${playedBadge}
                </div>
                <div style="font-size:0.72rem; color:var(--text-muted);">
                    ${remaining}/${total} in deck ·
                    <span style="color:${barColor}; font-weight:600;">${prob}% next draw</span>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; flex-shrink:0;">
                <button data-action="hand" data-card="${card.name}"
                    style="padding:3px 9px; font-size:0.75rem; border-radius:5px;
                    cursor:${remaining > 0 ? 'pointer' : 'default'};
                    background:${remaining > 0 ? 'rgba(120,200,80,0.15)' : 'rgba(255,255,255,0.04)'};
                    border:1px solid ${remaining > 0 ? 'rgba(120,200,80,0.4)' : 'rgba(255,255,255,0.08)'};
                    color:${remaining > 0 ? '#78c850' : '#444'};">
                    ✋ In Hand
                </button>
                <button data-action="played" data-card="${card.name}"
                    style="padding:3px 9px; font-size:0.75rem; border-radius:5px;
                    cursor:${inHand > 0 || remaining > 0 ? 'pointer' : 'default'};
                    background:${inHand > 0 ? 'rgba(74,158,255,0.15)' : 'rgba(255,255,255,0.06)'};
                    border:1px solid ${inHand > 0 ? 'rgba(74,158,255,0.4)' : 'rgba(255,255,255,0.1)'};
                    color:${inHand > 0 ? '#4a9eff' : remaining > 0 ? '#999' : '#444'};">
                    ▶ Played
                </button>
            </div>
        `;

        // Button handlers
        row.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.dataset.card;
                const action = btn.dataset.action;
                const state = _labPlayState[name];
                if (!state) return;

                if (action === 'hand') {
                    if (state.total - state.played - (state.inHand || 0) > 0) {
                        state.inHand = (state.inHand || 0) + 1;
                    }
                } else if (action === 'played') {
                    if ((state.inHand || 0) > 0) {
                        state.inHand--;
                        state.played++;
                    } else if (state.total - state.played - (state.inHand || 0) > 0) {
                        state.played++;
                    }
                }

                _refreshLabAfterStateChange(name);
            });
        });

        // Click row to select card + auto-calc odds
        row.addEventListener('click', () => {
            const state = _labPlayState[card.name];
            const rem = state.total - state.played - (state.inHand || 0);
            _selectedProbCard = { card, count: rem };

            const copiesSlider = document.getElementById('slider-target-copies');
            const deckSlider = document.getElementById('slider-deck-size');
            if (copiesSlider) {
                copiesSlider.max = total;
                copiesSlider.value = rem;
                document.getElementById('val-target-copies').textContent = rem;
            }
            if (deckSlider) {
                deckSlider.value = getTotalRemaining();
                document.getElementById('val-deck-size').textContent = getTotalRemaining();
            }

            renderLabCardList();
            renderProbChartForSelected(_labDeckCards, card.name);
            runHypergeometricCalc();
        });

        listEl.appendChild(row);
    });
}

// ── Next probable draws panel ─────────────────────────────────────────
function renderNextDrawPanel() {
    const panel = document.getElementById('next-draw-panel');
    const grid = document.getElementById('next-draw-cards');
    if (!panel || !grid) return;

    const deckRemaining = getTotalRemaining();
    if (deckRemaining <= 0 || Object.keys(_labPlayState).length === 0) {
        panel.style.display = 'none';
        return;
    }

    const ranked = Object.values(_labPlayState)
        .filter(({ total, played, inHand }) => total - played - (inHand || 0) > 0)
        .map(({ card, total, played, inHand }) => {
            const remaining = total - played - (inHand || 0);
            const prob = probAtLeastOne(deckRemaining, remaining, 1);
            return { card, remaining, total, prob };
        })
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 5);

    panel.style.display = 'block';
    grid.innerHTML = ranked.map(({ card, remaining, total, prob }) => {
        const pct = (prob * 100).toFixed(1);
        const barColor = parseFloat(pct) >= 15 ? '#f5c518' : parseFloat(pct) >= 8 ? '#78c850' : '#8b949e';
        const imgHTML = typeof window.generateCardHTML === 'function'
            ? window.generateCardHTML(card, 'next-draw-thumb') : '';
        return `
            <div style="display:flex; flex-direction:column; align-items:center; gap:6px; width:90px;">
                <div style="width:64px; height:88px; border-radius:6px; overflow:hidden; border:2px solid ${barColor};">
                    ${imgHTML}
                </div>
                <div style="font-size:0.72rem; text-align:center; color:var(--text-main); line-height:1.3;">${card.name}</div>
                <div style="font-size:0.85rem; font-weight:700; color:${barColor};">${pct}%</div>
                <div style="font-size:0.7rem; color:var(--text-muted);">${remaining}/${total} left</div>
            </div>
        `;
    }).join('');
}

// ── Chart functions ───────────────────────────────────────────────────
function renderProbChart(deckCards) {
    const canvas = document.getElementById('prob-chart');
    if (!canvas) return;
    if (_probChart) { _probChart.destroy(); _probChart = null; }

    const DECK_SIZE = 20;
    const labels = ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5'];
    const drawsPerTurn = [5, 6, 7, 8, 9];

    const grouped = {};
    deckCards.forEach(c => {
        if (!grouped[c.name]) grouped[c.name] = { name: c.name, count: 0 };
        grouped[c.name].count++;
    });
    const top3 = Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, 3);
    const colors = ['#f5c518', '#78c850', '#6890f0'];

    const datasets = top3.map((entry, i) => ({
        label: entry.name,
        data: drawsPerTurn.map(n => parseFloat((probAtLeastOne(DECK_SIZE, entry.count, n) * 100).toFixed(1))),
        borderColor: colors[i],
        backgroundColor: colors[i] + '22',
        tension: 0.3, fill: true, pointRadius: 4
    }));

    _probChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#e6edf3', font: { size: 11 } } } },
            scales: {
                x: { ticks: { color: '#8b949e' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { min: 0, max: 100, ticks: { color: '#8b949e', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderProbChartForSelected(deckCards, selectedName) {
    const canvas = document.getElementById('prob-chart');
    if (!canvas) return;
    if (_probChart) { _probChart.destroy(); _probChart = null; }

    const deckRemaining = getTotalRemaining();
    const labels = ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5'];

    const grouped = {};
    deckCards.forEach(c => {
        if (!grouped[c.name]) grouped[c.name] = { name: c.name, count: 0 };
        grouped[c.name].count++;
    });

    // Override with live play state
    Object.entries(_labPlayState).forEach(([name, { total, played, inHand }]) => {
        if (grouped[name]) grouped[name].count = total - played - (inHand || 0);
    });

    const others = Object.values(grouped)
        .filter(e => e.name !== selectedName && e.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);
    const entries = [grouped[selectedName], ...others].filter(Boolean);
    const colors = ['#f5c518', '#78c850', '#6890f0'];

    const datasets = entries.map((entry, i) => ({
        label: entry.name + (i === 0 ? ' ★' : ''),
        data: labels.map((_, ti) => {
            const N = Math.max(deckRemaining - ti, 1);
            return entry.count > 0 ? parseFloat((probAtLeastOne(N, entry.count, 1) * 100).toFixed(1)) : 0;
        }),
        borderColor: colors[i],
        backgroundColor: colors[i] + '22',
        tension: 0.3, fill: true, pointRadius: 4,
        borderWidth: i === 0 ? 3 : 1.5
    }));

    _probChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#e6edf3', font: { size: 11 } } } },
            scales: {
                x: { ticks: { color: '#8b949e' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { min: 0, max: 100, ticks: { color: '#8b949e', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

// ── Odds calculator ───────────────────────────────────────────────────
function runHypergeometricCalc() {
    if (!_selectedProbCard) {
        document.getElementById('result-percent').textContent = '--%';
        document.getElementById('result-text').textContent = 'Click a card above first.';
        return;
    }
    const N = parseInt(document.getElementById('slider-deck-size').value);
    const K = parseInt(document.getElementById('slider-target-copies').value);
    const prob = probAtLeastOne(N, K, 1);
    document.getElementById('result-percent').textContent = `${(prob * 100).toFixed(1)}%`;
    document.getElementById('result-text').textContent =
        `Chance to draw ${_selectedProbCard.card.name} on next draw (${K} copies, ${N} left in deck)`;
}

// ── Mulligan risk ─────────────────────────────────────────────────────
function renderMulliganRisk(deckCards) {
    const basics = deckCards.filter(c => c.stage === 'Basic');
    const basicCopies = basics.length;
    const DECK_SIZE = 20, HAND_SIZE = 5;
    const pBase  = (hypergeometricPMF(DECK_SIZE, basicCopies, HAND_SIZE, 0) * 100).toFixed(1);
    const pWith1 = (hypergeometricPMF(DECK_SIZE, basicCopies, HAND_SIZE + 1, 0) * 100).toFixed(1);
    const pWith2 = (hypergeometricPMF(DECK_SIZE, basicCopies, HAND_SIZE + 2, 0) * 100).toFixed(1);
    const pWith3 = (hypergeometricPMF(DECK_SIZE, basicCopies, HAND_SIZE + 3, 0) * 100).toFixed(1);
    document.getElementById('mulligan-base-rate').textContent = `${pBase}%`;
    document.getElementById('mulligan-draw-1').textContent    = `${pWith1}%`;
    document.getElementById('mulligan-draw-2').textContent    = `${pWith2}%`;
    document.getElementById('mulligan-draw-3').textContent    = `${pWith3}%`;
}

// ── Legacy live tracker (Live Match tab) ─────────────────────────────
function renderLiveTrackerStats(deckId) {
    const statsEl = document.getElementById('live-tracker-stats');
    if (!statsEl) return;
    if (!deckId) { statsEl.innerHTML = '<p class="empty-text">Select a deck to begin tracking.</p>'; return; }
    const savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');
    const deck = savedDecks.find(d => d.id === deckId);
    if (!deck) return;
    const allCards = window.TCGP_CARDS || [];
    const deckCards = (deck.cards || []).map(id => allCards.find(c => c.id === id)).filter(Boolean);
    const grouped = {};
    deckCards.forEach(c => {
        if (!grouped[c.name]) grouped[c.name] = { card: c, total: 0 };
        grouped[c.name].total++;
    });
    statsEl.innerHTML = `
        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px;">
            Tracking: <strong style="color:var(--text-main)">${deck.name}</strong> — ${deckCards.length} cards
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

window.renderLiveTrackerStatsById = function(deckId) {
    renderLiveTrackerStats(deckId);
};