// app.js - Main Application Logic for TCGP Analyzer

const GEMINI_MODEL = 'gemini-2.5-flash';
let _sessionApiKey = null;

window.TCGP_CARDS = []; // Global declaration

window.handleType2Change = function(val) {
    document.getElementById('variance-warning').style.display = val === 'None' ? 'none' : 'block';
};

window.getAllCards = function () { return window.TCGP_CARDS || []; };
window.selectedCardsForLab = []; // Global array for Probability Lab

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data/all_cards.json');
        if (!response.ok) throw new Error("Failed to load card database");
        const rawCards = await response.json();
        window.TCGP_CARDS = rawCards.map(c => ({
            ...c
        }));
        console.log(`Loaded ${window.TCGP_CARDS.length} cards from database.`);
        initApp();
    } catch (e) {
        console.error(e);
        alert("Critical Error: Core database could not be loaded. Please ensure you have run the scraper.");
    }
});

function initApp() {
    setupNavigation();
    initFirebase();
    if (!auth) {
        console.warn('[Firebase] Not initialized. Running in local-only mode.');
    }
    checkApiKey();

    // Bind global buttons
    document.getElementById('api-key-btn').addEventListener('click', showApiModal);
    document.getElementById('btn-save-key').addEventListener('click', saveApiKey);

    const authBtn = document.getElementById('auth-btn');
    if (authBtn) authBtn.addEventListener('click', showAuthModal);

    const toggleAuthBtn = document.getElementById('btn-toggle-auth');
    if (toggleAuthBtn) toggleAuthBtn.addEventListener('click', toggleAuthMode);

    const authActionBtn = document.getElementById('btn-auth-action');
    if (authActionBtn) authActionBtn.addEventListener('click', handleAuthAction);

    const manualAddBtn = document.getElementById('btn-manual-add-entry');
    if (manualAddBtn) manualAddBtn.addEventListener('click', processManualAdd);

    const manualNumbersInput = document.getElementById('manual-numbers-entry');
    if (manualNumbersInput) {
        manualNumbersInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') processManualAdd();
        });
    }

    // Card Entry Tabs
    const entryTabs = document.querySelectorAll('.entry-tab-btn');
    const entryContents = document.querySelectorAll('.entry-tab-content');
    entryTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            entryTabs.forEach(b => b.classList.remove('active'));
            entryContents.forEach(c => c.classList.remove('active', 'hidden'));
            entryContents.forEach(c => c.style.display = 'none'); // Ensure hidden ones are non-blocking

            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.target);
            if (target) {
                target.classList.add('active');
                target.style.display = 'block';
                if (btn.dataset.target === 'tab-visual') {
                    renderVisualSelectionGrid();
                }
            }
        });
    });

    // Visual Selection Search
    const visualSearch = document.getElementById('visual-search');
    if (visualSearch) {
        visualSearch.addEventListener('input', (e) => {
            renderVisualSelectionGrid(e.target.value);
        });
    }

    const visualSetSelect = document.getElementById('visual-set-select');
    if (visualSetSelect) {
        visualSetSelect.addEventListener('change', () => {
            renderVisualSelectionGrid(visualSearch ? visualSearch.value : '');
        });
    }

    // Mega Proceed Button
    const proceedBtn = document.getElementById('btn-proceed-decks');
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            document.querySelector('.nav-btn[data-target="view-deck-builder"]')?.click();
        });
    }

    const saveFirebaseBtn = document.getElementById('btn-save-firebase');
    if (saveFirebaseBtn) saveFirebaseBtn.addEventListener('click', saveFirebaseConfig);

    const clearBtn = document.getElementById('btn-clear-collection');
    const clearToast = document.getElementById('toast-clear-warning');
    const clearConfirmBtn = document.getElementById('btn-clear-confirm');
    const clearCancelBtn = document.getElementById('btn-clear-cancel');

    if (clearBtn) clearBtn.addEventListener('click', () => clearToast.style.display = 'block');
    if (clearCancelBtn) clearCancelBtn.addEventListener('click', () => clearToast.style.display = 'none');
    if (clearConfirmBtn) clearConfirmBtn.addEventListener('click', () => {
        localStorage.removeItem('tcgp_collection');
        clearToast.style.display = 'none';
        renderCollectionGrid();
        renderDeckBuilderSidebar();
        syncCollectionToCloud();
        showToast('Collection cleared.', 'error');
    });

    // Initial renders
    renderCollectionGrid();
    renderDeckBuilderSidebar();
    renderDeckSlots();
}

// --- Firebase Integration (Hardcoded Default) ---
let db;
let auth;
let currentUser = null;

// --- Event Listeners Integration ---
document.addEventListener('DOMContentLoaded', () => {
    // Deck Builder Search
    const dbSearchInput = document.getElementById('db-search');
    if (dbSearchInput) {
        dbSearchInput.addEventListener('input', (e) => {
            deckBuilderSearchQuery = e.target.value;
            renderDeckBuilderSidebar();
        });
    }

    // Save Deck
    const saveDeckBtn = document.getElementById('btn-save-deck');
    if (saveDeckBtn) {
        saveDeckBtn.addEventListener('click', () => {
            if (window.currentDeck.length !== 20) return;

            const deckName = document.getElementById('deck-name').value || 'My Deck';
            const deckToSave = {
                id: Date.now().toString(),
                name: deckName,
                cards: window.currentDeck.map(c => c.id) // Only save IDs to save space
            };

            let savedDecks = JSON.parse(localStorage.getItem('tcgp_saved_decks') || '[]');
            savedDecks.push(deckToSave);
            localStorage.setItem('tcgp_saved_decks', JSON.stringify(savedDecks));

            showToast('Deck Saved Successfully!', 'success');

            // Refresh logic in probability and live match
            if (window.populateProbabilityDropdowns) window.populateProbabilityDropdowns();
            const liveDrops = document.getElementById('live-deck-select');
            if (liveDrops && window.populateProbabilityDropdowns) window.populateProbabilityDropdowns(); // Shared logic
        });
    }

    // Playstyle Recommender
    const btnRecommend = document.getElementById('btn-recommend-decks');
    if (btnRecommend) {
        btnRecommend.addEventListener('click', async () => {
            const playstyle = document.getElementById('db-playstyle-select').value;
            const outputArea = document.getElementById('recommender-output');

            outputArea.classList.remove('hidden');
            outputArea.innerHTML = '<span class="empty-state">Analyzing collection...</span>';

            if (typeof recommendDecks === 'function') {
                const recs = await recommendDecks(playstyle);
                if (recs.length === 0) {
                    outputArea.innerHTML = '<span class="empty-state">No matching decks found for this playstyle.</span>';
                    return;
                }

                outputArea.innerHTML = recs.map(r => `
                    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:12px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                            <strong>${r.archetype}</strong>
                            <span style="color:${r.completionPct >= 80 ? 'var(--accent-gold)' : 'var(--text-muted)'}">${r.completionPct}% Owned</span>
                        </div>
                        ${r.missingCards.length > 0
                        ? `<div style="font-size:0.85rem; color:#ff8888; margin-top:6px; line-height:1.4;">Missing:<br> ${r.missingCards.join('<br>')}</div>`
                        : `<div style="font-size:0.8rem; color:#78c850;">Ready to build!</div>`
                    }
                    </div>
                `).join('');
            } else {
                outputArea.innerHTML = '<span class="empty-state" style="color:var(--accent-red)">Strategy engine offline.</span>';
            }
        });
    }

    // AI Deck Builder Bridge
    const btnAiBuild = document.getElementById('btn-ai-build');
    if (btnAiBuild) {
        btnAiBuild.addEventListener('click', () => {
            const playstyle = document.getElementById('db-playstyle-select').value;
            const outputArea = document.getElementById('recommender-output');
            outputArea.classList.remove('hidden');
            outputArea.innerHTML = '<span class="empty-state">Gemini AI is building your deck...</span>';
            fetchAISuggestion(playstyle);
        });
    }
});

// --- Firebase Cloud Sync (Mock) ---
function initFirebase() {
    const firebaseConfig = {
        apiKey: "AIzaSyCnXljjyIYCWhsLhjLO62gDnIhNA29bHbM",
        authDomain: "pokemon-tcgp-24c09.firebaseapp.com",
        projectId: "pokemon-tcgp-24c09",
        storageBucket: "pokemon-tcgp-24c09.firebasestorage.app",
        messagingSenderId: "174569516136",
        appId: "1:174569516136:web:c30c356093b7be0de39fdd",
        measurementId: "G-H4SJJ2KELV"
    };

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        auth = firebase.auth();

        auth.onAuthStateChanged(user => {
            currentUser = user;
            updateAuthUI(user);
            if (user) {
                loadCollectionFromCloud();
            }
        });
    } catch (e) {
        console.error('[Firebase] Init error:', e);
    }
}

function updateAuthUI(user) {
    const authBtn = document.getElementById('auth-btn');
    const userEmail = document.getElementById('user-email');
    if (!authBtn || !userEmail) return;

    if (!auth) {
        authBtn.innerText = 'Cloud Sync Unavailable';
        authBtn.disabled = true;
        userEmail.classList.add('hidden');
        return;
    }

    if (user) {
        authBtn.innerText = 'Sign Out';
        authBtn.disabled = false;
        userEmail.innerText = user.email;
        userEmail.classList.remove('hidden');
    } else {
        authBtn.innerText = 'Sign In';
        authBtn.disabled = false;
        userEmail.classList.add('hidden');
    }
}

function showAuthModal() {
    if (currentUser) {
        auth.signOut();
        return;
    }
    const modal = document.getElementById('modal-auth');
    if (modal) modal.classList.remove('hidden');
}

function toggleAuthMode() {
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('btn-auth-action');
    const toggle = document.getElementById('btn-toggle-auth');
    if (btn.innerText === "Login") {
        title.innerText = "Create Account";
        btn.innerText = "Sign Up";
        toggle.innerText = "Already have an account? Login";
    } else {
        title.innerText = "Account Login";
        btn.innerText = "Login";
        toggle.innerText = "Need an account? Sign Up";
    }
}

async function handleAuthAction() {
    const emailInput = document.getElementById('input-email');
    const passInput = document.getElementById('input-password');
    if (!emailInput || !passInput) return;

    const email = emailInput.value;
    const pass = passInput.value;
    const btnText = document.getElementById('btn-auth-action').innerText;

    if (!auth) {
        alert("Firebase not initialized.");
        return;
    }

    try {
        if (btnText === "Login") {
            await auth.signInWithEmailAndPassword(email, pass);
        } else {
            await auth.createUserWithEmailAndPassword(email, pass);
        }
        document.getElementById('modal-auth').classList.add('hidden');
    } catch (e) {
        alert(e.message);
    }
}

function showFirebaseConfigModal() {
    const modal = document.getElementById('modal-firebase');
    if (!modal) return;
    modal.classList.remove('hidden');
    const existing = localStorage.getItem('firebase_config');
    if (existing) document.getElementById('input-firebase-config').value = existing;
}

function saveFirebaseConfig() {
    let config = document.getElementById('input-firebase-config').value.trim();
    if (!config) {
        alert('Please paste a Firebase config object.');
        return;
    }

    // Strip "const foo = " etc.
    config = config.replace(/^(const|let|var)\s+\w+\s*=\s*/, '');
    config = config.replace(/;$/, '');

    try {
        // Make it safe JSON if user pasted JS-style object
        let jsonCompliant = config
            .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":') // unquoted keys → quoted
            .replace(/'/g, '"');

        const parsed = JSON.parse(jsonCompliant);

        // Minimal validation
        if (!parsed.apiKey || !parsed.projectId) {
            throw new Error('Missing apiKey or projectId');
        }

        localStorage.setItem('firebase_config', JSON.stringify(parsed));
        document.getElementById('modal-firebase').classList.add('hidden');

        // Re-init Firebase with the new config (no page reload needed)
        initFirebase();
        showToast('Firebase config saved. Cloud sync enabled.', 'success');
    } catch (e) {
        alert('Config Error: ' + e.message);
    }
}

// --- Cloud Sync ---
async function syncCollectionToCloud() {
    if (!currentUser || !db) return;
    const myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    const myDecks = JSON.parse(localStorage.getItem('tcgp_decks') || '[]');

    await db.collection('users').doc(currentUser.uid).set({
        collection: myCollection,
        decks: myDecks,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function loadCollectionFromCloud() {
    if (!currentUser || !db) return;
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists && doc.data().collection) {
        localStorage.setItem('tcgp_collection', JSON.stringify(doc.data().collection));
        if (doc.data().decks) {
            localStorage.setItem('tcgp_decks', JSON.stringify(doc.data().decks));
        }
        renderCollectionGrid();
        renderDeckBuilderSidebar();
    }
}

// --- Manual Entry ---
function expandNumberTokens(str) {
    const tokens = str.split(/[,\s]+/).filter(t => t.trim() !== "");
    const expanded = [];
    tokens.forEach(token => {
        const rangeMatch = token.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
                expanded.push(String(n));
            }
        } else {
            expanded.push(token.trim());
        }
    });
    return expanded;
}

function processManualAdd() {
    const setSelect = document.getElementById('manual-set-select-entry');
    const numbersInput = document.getElementById('manual-numbers-entry');
    if (!setSelect || !numbersInput) return;

    const setCode = setSelect.value;
    const numbersStr = numbersInput.value;
    if (!numbersStr) return;

    const numbers = expandNumberTokens(numbersStr);
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    let addedCount = 0;

    numbers.forEach(num => {
        const paddedNum = num.padStart(3, '0');
        const cardId = `${setCode}-${paddedNum}`;
        const card = TCGP_CARDS.find(c => c.id === cardId);
        if (card) {
            myCollection[cardId] = (myCollection[cardId] || 0) + 1;
            addedCount++;
        }
    });

    if (addedCount > 0) {
        localStorage.setItem('tcgp_collection', JSON.stringify(myCollection));
        renderCollectionGrid();
        renderDeckBuilderSidebar();
        syncCollectionToCloud();
        showToast(`Added ${addedCount} cards!`);
        numbersInput.value = "";
    } else {
        showToast("No valid card numbers found for this set.", "error");
    }
}

// --- Navigation ---
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.view-section');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'view-collection') renderCollectionGrid();
            if (targetId === 'view-deck-builder') renderDeckBuilderSidebar();
        });
    });

    const searchInput = document.getElementById('search-cards');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderCollectionGrid(e.target.value));
    }
}

// --- API Key Management ---
function checkApiKey() {
    const key = _sessionApiKey;
    const btn = document.getElementById('api-key-btn');
    if (!btn) return;

    if (!key) {
        btn.style.color = '#ff4444';
        btn.innerText = 'API Key Required';
    } else {
        btn.style.color = 'var(--text-muted)';
        btn.innerText = 'API Key Set ✓';
    }
}

function showApiModal() {
    document.getElementById('modal-api').classList.remove('hidden');
    // Pre-filling removed per session storage refactor
}

async function saveApiKey() {
    const input = document.getElementById('input-api-key').value.trim();
    if (!input || !input.startsWith('AIza')) {
        alert("Invalid API key format.");
        return;
    }

    const btn = document.getElementById('btn-save-key');
    const originalText = btn.innerText;
    btn.innerText = 'Verifying...';
    btn.disabled = true;

    try {
        const testResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${input}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'ping' }] }]
                })
            }
        );

        if (!testResponse.ok) {
            const err = await testResponse.json();
            throw new Error(err.error?.message || 'Key rejected by Gemini.');
        }

        _sessionApiKey = input;
        document.getElementById('modal-api').classList.add('hidden');
        checkApiKey();
        showToast('API Key Verified ✓', 'success');

    } catch (e) {
        showToast(`Invalid API Key — ${e.message}`, 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- Image Error Failsafe ---
window.generateCardHTML = function (card, imgClass = '') {
    const numPart = (card.id && card.id.includes('-')) ? card.id.split('-')[1] : '001';
    const paddedNum = numPart.padStart(3, '0');
    const cleanSetCode = card.setCode === 'P-A' ? 'P-A' : card.setCode;
    const fallbackB_URL = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/${cleanSetCode}/${cleanSetCode}_${paddedNum}_EN_SM.webp`;

    // Final fallback: named card placeholder styled to match the card grid
    const safeId = card.id.replace(/[^a-zA-Z0-9-]/g, '_');
    const safeName = (card.name || 'Unknown').replace(/'/g, "\\'");
    const safeType = (card.type || 'Colorless').toLowerCase().replace(/[^a-z]/g, '');

    const finalFallback = `
        (function(el) {
            var wrap = document.createElement('div');
            wrap.className = '${imgClass} card-name-fallback card-name-fallback--${safeType}';
            wrap.setAttribute('data-id', '${safeId}');
            wrap.innerHTML = '<span class=\\'fallback-set\\'>${card.id}<\\/span><span class=\\'fallback-name\\'>${safeName}<\\/span><span class=\\'fallback-type\\'>${card.type || ''}<\\/span>';
            el.parentNode.replaceChild(wrap, el);
        })(this)
    `.replace(/\n\s*/g, ' ');

    const rarityClass = getRarityClass(card.rarity);
    
    return `
        <div class="card-3d-wrap ${rarityClass}" 
             data-rarity="${card.rarity || ''}"
             data-type="${(card.type || 'colorless').toLowerCase()}">
            <img src="${card.img}" class="${imgClass}" loading="lazy" alt="${card.name}" 
                onerror="this.onerror=null; this.src='${fallbackB_URL}'; this.onerror=function(){ ${finalFallback} };">
        </div>
    `;
};

function getRarityClass(rarity) {
    if (!rarity) return '';
    if (rarity.includes('👑')) return 'rarity-crown';
    if (rarity === '☆☆☆') return 'rarity-rainbow';
    if (rarity === '☆☆') return 'rarity-fullart';
    if (rarity === '☆') return 'rarity-ex';
    if (rarity === '◇◇◇◇') return 'rarity-rare';
    return 'rarity-common';
}

// --- Collection Manager ---
window.renderVisualSelectionGrid = function (searchQuery = '') {
    const grid = document.getElementById('visual-card-grid');
    const setSelect = document.getElementById('visual-set-select');
    if (!grid || !setSelect) return;

    grid.innerHTML = '';
    const setCode = setSelect.value;
    const allCards = TCGP_CARDS.filter(c => c.setCode === setCode);
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');

    let displayCards = allCards;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        displayCards = allCards.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.type?.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q) ||
            c.rarity?.toLowerCase().includes(q)
        );
    }

    displayCards.forEach(card => {
        const qty = myCollection[card.id] || 0;
        const isOwned = qty > 0;

        const cardEl = document.createElement('div');
        cardEl.className = `visual-card ${isOwned ? 'owned' : ''}`;

        cardEl.innerHTML = `
            ${generateCardHTML(card, '')}
            ${isOwned ? `<div class="qty-badge">${qty}</div>` : ''}
            <div class="visual-qty-controls">
                <button class="qty-btn" onclick="updateCardQuantity('${card.id}', -1)">-</button>
                <button class="qty-btn" onclick="updateCardQuantity('${card.id}', 1)">+</button>
            </div>
            <div class="visual-card-details">
                <span>${card.id.split('-')[1]}</span>
                <span>${card.rarity || ''}</span>
            </div>
        `;
        grid.appendChild(cardEl);
    });
};

window.updateCardQuantity = function (cardId, change) {
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    let currentQty = myCollection[cardId] || 0;
    let newQty = currentQty + change;

    if (newQty <= 0) delete myCollection[cardId];
    else myCollection[cardId] = newQty;

    localStorage.setItem('tcgp_collection', JSON.stringify(myCollection));
    syncCollectionToCloud();

    // Only re-render the active view
    const activeSection = document.querySelector('.view-section.active')?.id;
    if (activeSection === 'view-collection') {
        // Reset and re-render from page 0 to reflect qty changes
        collectionPage = 0;
        document.getElementById('collection-grid').innerHTML = '';
        renderCollectionGrid(document.getElementById('search-cards')?.value || '');
    } else if (activeSection === 'view-deck-builder') {
        renderDeckBuilderSidebar();
    }
    
    // Always keep visual grid in sync if it's visible
    const visualTab = document.querySelector('#tab-visual');
    if (visualTab && visualTab.style.display !== 'none') {
        const visualSearch = document.getElementById('visual-search');
        renderVisualSelectionGrid(visualSearch ? visualSearch.value : '');
    }
};

// Pagination state
let collectionPage = 0;
const COLLECTION_PAGE_SIZE = 40;
let collectionDisplayCards = [];

window.renderCollectionGrid = function (searchQuery = '') {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;

    const allCards = TCGP_CARDS;
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');

    let uniqueCount = 0;
    let totalCopies = 0;
    allCards.forEach(c => {
        const qty = myCollection[c.id] || 0;
        if (qty > 0) { uniqueCount++; totalCopies += qty; }
    });

    // Rebuild filtered list only when query changes
    if (searchQuery !== undefined) {
        collectionPage = 0;
        grid.innerHTML = '';
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            collectionDisplayCards = allCards.filter(c =>
                c.name.toLowerCase().includes(q) || c.type?.toLowerCase().includes(q)
            );
        } else {
            collectionDisplayCards = allCards;
        }
    }

    const start = collectionPage * COLLECTION_PAGE_SIZE;
    const slice = collectionDisplayCards.slice(start, start + COLLECTION_PAGE_SIZE);

    slice.forEach(card => {
        const qty = myCollection[card.id] || 0;
        const isOwned = qty > 0;
        const cardEl = document.createElement('div');
        cardEl.className = `tcgp-card ${isOwned ? 'owned' : ''}`;

        let colorVar = `var(--type-${card.type?.toLowerCase() || 'colorless'})`;
        if (card.type === 'Supporter' || card.type === 'Item') colorVar = '#8b949e';
        cardEl.style.borderTop = `4px solid ${colorVar}`;

        cardEl.innerHTML = `
            <div class="card-img-placeholder">
                ${isOwned ? `<button class="card-remove-btn" onclick="updateCardQuantity('${card.id}', -${qty})">×</button>` : ''}
                ${generateCardHTML(card, 'card-real-img')}
                ${isOwned ? `<div class="card-qty-badge">${qty}</div>` : ''}
            </div>
            <div class="card-info">
                <div class="card-name">${card.name}</div>
                <div class="card-meta">${card.id} • ${card.rarity}</div>
            </div>
            ${isOwned ? `
            <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 8px;">
                <button class="qty-btn" onclick="updateCardQuantity('${card.id}', -1)">−</button>
                <span style="font-weight: bold; width: 24px; text-align: center;">${qty}</span>
                <button class="qty-btn" onclick="updateCardQuantity('${card.id}', 1)">+</button>
            </div>
            ` : ''}
        `;
        grid.appendChild(cardEl);
    });

    // Stats
    document.getElementById('stat-unique-cards').innerText = `${uniqueCount} Unique Cards`;
    document.getElementById('stat-total-copies').innerText = `${totalCopies} Total Copies`;
    const completion = ((uniqueCount / allCards.length) * 100).toFixed(1);
    document.getElementById('stat-completion').innerText = `${completion}% Complete`;

    // Infinite scroll sentinel
    setupCollectionScrollSentinel();
};

function setupCollectionScrollSentinel() {
    const existing = document.getElementById('collection-scroll-sentinel');
    if (existing) existing.remove();

    if ((collectionPage + 1) * COLLECTION_PAGE_SIZE >= collectionDisplayCards.length) return;

    const sentinel = document.createElement('div');
    sentinel.id = 'collection-scroll-sentinel';
    sentinel.style.height = '1px';
    document.getElementById('collection-grid').appendChild(sentinel);

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            collectionPage++;
            renderCollectionGrid(undefined); // append next page, don't reset
        }
    }, { threshold: 0.1 });

    observer.observe(sentinel);
}

// --- Deck Builder ---
window.currentDeck = [];
let deckBuilderSearchQuery = '';

window.renderDeckBuilderSidebar = function () {
    const list = document.getElementById('db-available-cards');
    if (!list) return;
    list.innerHTML = '';

    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    let availableIds = Object.keys(myCollection).filter(id => myCollection[id] > 0);

    if (availableIds.length === 0) {
        list.innerHTML = '<p class="empty-state">No cards in collection.</p>';
        return;
    }

    // Map IDs to card objects to apply filtering
    let availableCards = availableIds.map(id => TCGP_CARDS.find(c => c.id === id)).filter(Boolean);

    // Apply Search Filter
    if (deckBuilderSearchQuery.trim() !== '') {
        const q = deckBuilderSearchQuery.trim().toLowerCase();
        availableCards = availableCards.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.type && c.type.toLowerCase().includes(q))
        );
    }

    if (availableCards.length === 0) {
        list.innerHTML = '<p class="empty-state">No matching cards found.</p>';
        return;
    }

    availableCards.forEach(card => {
        const countInDeck = window.currentDeck.filter(c => c.id === card.id).length;
        const availableCount = myCollection[card.id] - countInDeck;

        if (availableCount > 0) {
            const el = document.createElement('div');
            el.className = 'db-sidebar-card';
            el.innerHTML = `
                ${generateCardHTML(card, 'db-sidebar-img')}
                <div class="db-sidebar-info">
                    <div class="db-sidebar-name">${card.name}</div>
                    <div class="db-sidebar-qty">${availableCount} left</div>
                </div>
                <button class="btn-add-to-deck" onclick="addToDeck('${card.id}')">+</button>
            `;
            list.appendChild(el);
        }
    });
};

function renderEvolutionWarnings() {
    let warningEl = document.getElementById('evo-warnings');
    if (!warningEl) {
        warningEl = document.createElement('div');
        warningEl.id = 'evo-warnings';
        warningEl.style.cssText = `
            margin: 8px 0; padding: 8px 12px; border-radius: 8px;
            font-size: 0.8rem; line-height: 1.6;
            background: rgba(255, 100, 50, 0.12);
            border: 1px solid rgba(255, 100, 50, 0.35);
            color: #ffaa88;
        `;
        const deckSlots = document.getElementById('deck-slots');
        if (deckSlots) deckSlots.after(warningEl);
    }

    const report = window.DeckRules
        ? window.DeckRules.validateDeck(window.currentDeck.map(c => c.name), window.TCGP_CARDS)
        : null;

    if (!report || report.isLegal) {
        warningEl.style.display = 'none';
        return;
    }

    const issues = [];
    const r = report.rules;
    if (!r.evolutionIntegrity.pass) issues.push(...r.evolutionIntegrity.violations.map(v => `❌ ${v.card} missing pre-evo: ${v.missing}`));
    if (!r.duplicates.pass) issues.push(...r.duplicates.violations.map(v => `❌ ${v.name} has ${v.count} copies (max 2)`));
    if (!r.basicPokemon.pass) issues.push(`❌ ${r.basicPokemon.message}`);
    if (!r.energyTypes.pass) issues.push(`❌ ${r.energyTypes.message}`);
    if (!r.trainerSynergy.pass) issues.push(...r.trainerSynergy.warnings.map(w => `⚠️ ${w.trainer}: ${w.issue}`));

    warningEl.style.display = 'block';
    warningEl.innerHTML = issues.join('<br>');
}

function renderDeckSlots() {
    const grid = document.getElementById('deck-slots');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < 20; i++) {
        const slot = document.createElement('div');
        slot.className = 'deck-slot';
        const card = window.currentDeck[i];

        if (card) {
            slot.classList.add('filled');
            // Use generateCardHTML so fallback text triggers on broken images
            slot.innerHTML = `
                ${window.generateCardHTML(card, 'deck-slot-img')}
                <button class="remove-card" onclick="removeFromDeck(${i})">×</button>
            `;
        } else {
            slot.innerHTML = `<div class="slot-number">${i + 1}</div>`;
        }
        grid.appendChild(slot);
    }

    document.getElementById('deck-current-count').innerText = window.currentDeck.length;
    document.getElementById('btn-save-deck').disabled = window.currentDeck.length !== 20;

    renderEvolutionWarnings();
}

window.addToDeck = function (id) {
    if (window.currentDeck.length >= 20) return;
    const card = TCGP_CARDS.find(c => c.id === id);
    if (!card) return;

    if (card.evolveFrom) {
        const deckNames = window.currentDeck.map(c => c.name);
        if (!deckNames.includes(card.evolveFrom)) {
            showToast(`⚠️ Add ${card.evolveFrom} first — ${card.name} evolves from it`, 'error');
        }
    }

    window.currentDeck.push(card);
    renderDeckSlots();
    renderDeckBuilderSidebar();
};

window.removeFromDeck = function (index) {
    window.currentDeck.splice(index, 1);
    renderDeckSlots();
    renderDeckBuilderSidebar();
};

window.showFirebaseConfigModal = showFirebaseConfigModal;

// --- Toast Notification ---
window.showToast = function (message, type = 'success') {
    let toast = document.getElementById('scan-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'scan-toast';
        toast.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            color: white; padding: 12px 24px; border-radius: 12px;
            font-size: 0.9rem; font-weight: 500; z-index: 2000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4); transition: opacity 0.3s;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.style.background = type === 'error' ? '#cf222e' : '#1a7f37';
    toast.style.opacity = '1';
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 3000);
};

// --- Live Match Tracker Logic ---
let liveRevealedCards = [];
let actionsLoggedThisMatch = 0;

document.addEventListener('DOMContentLoaded', () => {
    const oppInput = document.getElementById('opponent-card-input');
    const suggBox = document.getElementById('opponent-card-suggestions');
    if (!oppInput || !suggBox) return;

    // Autocomplete logic
    oppInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        suggBox.innerHTML = '';
        if (val.length < 2) {
            suggBox.classList.add('hidden');
            return;
        }

        const matches = TCGP_CARDS.filter(c => c.name.toLowerCase().includes(val)).slice(0, 5);
        if (matches.length > 0) {
            suggBox.classList.remove('hidden');
            matches.forEach(m => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerText = m.name;
                div.onclick = () => {
                    addRevealedCard(m.name);
                    oppInput.value = '';
                    suggBox.classList.add('hidden');
                };
                suggBox.appendChild(div);
            });
        } else {
            suggBox.classList.add('hidden');
        }
    });

    // Hide suggestions on click outside
    document.addEventListener('click', (e) => {
        if (e.target !== oppInput && e.target !== suggBox) suggBox.classList.add('hidden');
    });
});

async function addRevealedCard(cardName) {
    liveRevealedCards.push(cardName);
    actionsLoggedThisMatch++;
    renderRevealedCards();
    await updateOpponentPrediction();
}

window.removeRevealedCard = function (idx) {
    liveRevealedCards.splice(idx, 1);
    renderRevealedCards();
    updateOpponentPrediction();
};

function renderRevealedCards() {
    const list = document.getElementById('revealed-cards-list');
    if (liveRevealedCards.length === 0) {
        list.innerHTML = '<span class="empty-text">No cards logged yet...</span>';
        return;
    }

    list.innerHTML = liveRevealedCards.map((c, i) => `
        <div class="revealed-tag">
            ${c} <span class="tag-remove" onclick="removeRevealedCard(${i})">×</span>
        </div>
    `).join('');
}

async function updateOpponentPrediction() {
    const resultsContainer = document.getElementById('prediction-matches');
    const nextTurnSection = document.getElementById('next-turn-cards');
    const nextTurnGrid = document.getElementById('next-turn-card-grid');

    if (liveRevealedCards.length === 0) {
        resultsContainer.innerHTML = '<p class="empty-text">Awaiting data... (log 4 cards to activate)</p>';
        if (nextTurnSection) nextTurnSection.style.display = 'none';
        return;
    }

    if (actionsLoggedThisMatch < 4) {
        resultsContainer.innerHTML = `<p class="empty-text" style="color:var(--accent-gold);">
            Analyzing... (${actionsLoggedThisMatch}/4 cards logged)
        </p>`;
        if (nextTurnSection) nextTurnSection.style.display = 'none';
        return;
    }

    resultsContainer.innerHTML = '';

    // ── Archetype prediction (text, kept compact) ──────────────────
    if (typeof predictOpponentDeck === 'function') {
        const predictions = await predictOpponentDeck(liveRevealedCards);

        if (predictions && predictions.length > 0) {
            resultsContainer.innerHTML = predictions.map((p, idx) => `
                <div class="prediction-match-card ${idx === 0 ? 'top-match' : ''}">
                    <div class="match-header">
                        <span class="match-title">${p.archetype}</span>
                        <span class="match-confidence">${p.confidenceScore}% Match</span>
                    </div>
                    ${p.threatWarning ? `<div class="match-warning">⚠️ ${p.threatWarning}</div>` : ''}
                </div>
            `).join('');
        } else {
            resultsContainer.innerHTML = '<p class="empty-text">No matching archetype found.</p>';
        }
    }

    // ── Next Turn Prediction ───────────────────────────────────────
    if (!nextTurnSection || !nextTurnGrid) return;

    const allCards = window.TCGP_CARDS || [];
    const revealedSet = liveRevealedCards.map(n => n.toLowerCase());

    // ── Next Turn Prediction: Evidence-Driven Posterior Predictive ─
    const norm = s => (s || '').trim().toLowerCase();

    let topCards = [];

    // predictions[0]._candidateScores is the ranked probability list
    // produced by the new predictOpponentDeck engine in strategy.js
    if (predictions && predictions.length > 0 &&
        predictions[0]._candidateScores &&
        predictions[0]._candidateScores.length > 0) {

        const candidates = predictions[0]._candidateScores;
        const confirmedNorms = predictions[0]._confirmedNorms || new Set();
        const inferredNorms = predictions[0]._inferredNorms || new Set();

        // Filter out already-revealed cards
        const revealedNorms = new Set(liveRevealedCards.map(n => norm(n)));

        const filtered = candidates.filter(({ card }) =>
            !revealedNorms.has(norm(card.name))
        );

        if (filtered.length > 0) {
            const maxScore = filtered[0].score;
            topCards = filtered
                .slice(0, 3)
                .map(({ card, score }) => ({
                    card,
                    pct: Math.min(Math.round((score / maxScore) * 100), 97),
                    isInferred: inferredNorms.has(norm(card.name))
                }));
        }
    }

    if (topCards.length === 0) {
        nextTurnSection.style.display = 'none';
        return;
    }

    nextTurnSection.style.display = 'block';
    nextTurnGrid.innerHTML = topCards.map(({ card, pct, isInferred }) => {
        const imgHTML = typeof window.generateCardHTML === 'function'
            ? window.generateCardHTML(card, 'next-turn-card-img')
            : `<img src="${card.img}" class="next-turn-card-img" alt="${card.name}">`;

        const barColor = pct >= 70 ? 'var(--accent-gold)' : pct >= 40 ? '#78c850' : 'var(--text-muted)';

        return `
            <div class="next-turn-card-item">
                ${imgHTML}
                <div class="next-turn-card-label">${card.name}${isInferred ? ' <span style="color:var(--accent-gold);font-size:0.7rem;">★ inferred</span>' : ''}</div>
                <div class="next-turn-pct-bar-wrap">
                    <div class="next-turn-pct-bar" style="width:${pct}%; background:${barColor};"></div>
                </div>
                <div class="next-turn-pct-text" style="color:${barColor}">${pct}%</div>
            </div>
        `;
    }).join('');
}

// --- AI Strategy Bridge ---
window.fetchAISuggestion = async function(playstyle) {
    const myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    const allCards = window.TCGP_CARDS || [];

    // Step 1: Build owned cards as before
    const allOwnedCards = Object.entries(myCollection)
        .filter(([id, qty]) => qty > 0)
        .map(([id, qty]) => {
            const card = window.TCGP_CARDS.find(c => c.id === id);
            if (!card) return null;
            return { card, qty };
        }).filter(Boolean);

    const ownedCardObjects = allOwnedCards.map(o => o.card);

    // ─── PRE-FILTER: enforce 2 energy type cap IN JAVASCRIPT before sending to Gemini ───
    const pokemonCards = allOwnedCards.filter(({ card }) =>
        card.type && !['Supporter', 'Item', 'Colorless'].includes(card.type)
    );
    const nonPokemonCards = allOwnedCards.filter(({ card }) =>
        !card.type || ['Supporter', 'Item', 'Colorless'].includes(card.type)
    );

    const typeGroups = {};
    pokemonCards.forEach(({ card, qty }) => {
        if (!typeGroups[card.type]) typeGroups[card.type] = { cards: [], totalQty: 0, totalScore: 0 };
        const score = typeof window.scorePokemon === 'function' ? window.scorePokemon(card, ownedCardObjects) : 0;
        typeGroups[card.type].cards.push({ card, qty, score });
        typeGroups[card.type].totalQty += qty;
        typeGroups[card.type].totalScore += score;
    });

    const sortedTypes = Object.entries(typeGroups)
        .sort((a, b) => b[1].totalScore - a[1].totalScore)
        .map(([type]) => type);
    
    const type1 = document.getElementById('db-type-select-1')?.value || 'Any';
    const type2 = document.getElementById('db-type-select-2')?.value || 'None';

    const allowedTypes = (type1 === 'Any')
        ? new Set(sortedTypes.slice(0, 2)) // fallback to auto-pick if no preference
        : new Set([type1, type2 !== 'None' ? type2 : null].filter(Boolean));

    const filteredCollection = [
        ...pokemonCards.filter(({ card }) => allowedTypes.has(card.type)),
        ...allOwnedCards.filter(({ card }) =>
            card.type === 'Colorless' || card.type === 'Supporter' || card.type === 'Item' || !card.type
        )
    ];

    const fossilItems = ['Dome Fossil', 'Helix Fossil', 'Old Amber', 'Mysterious Fossil'];
    const fossilPokemon = filteredCollection.filter(({ card }) => card.stage && card.stage.toLowerCase().includes('fossil'));
    const filteredNoFossil = fossilPokemon.length >= 2 ? filteredCollection : filteredCollection.filter(({ card }) => !fossilItems.includes(card.name));

    // Define each Gym Leader's required Pokémon names and minimum count
    const gymLeaderRules = {
        'Misty':    { requiredNames: null, requiredType: 'Water',     minCount: 2 },
        'Blaine':   { requiredNames: ['Ninetales', 'Magmar', 'Rapidash', 'Ninetales EX', 'Magmar EX'], requiredType: 'Fire', minCount: 2 },
        'Erika':    { requiredNames: null, requiredType: 'Grass',     minCount: 2 },
        'Brock':    { requiredNames: ['Onix', 'Golem', 'Geodude', 'Graveler', 'Onix EX'], requiredType: null, minCount: 1 },
        'Koga':     { requiredNames: ['Grimer', 'Weezing'],           requiredType: null, minCount: 1 },
        'Lt. Surge':{ requiredNames: null, requiredType: 'Lightning', minCount: 2 },
        'Giovanni': { requiredNames: null, requiredType: null,        minCount: 0 },
        'Sabrina':  { requiredNames: null, requiredType: 'Psychic',   minCount: 2 },
    };

    const trainersToDrop = new Set();
    Object.entries(gymLeaderRules).forEach(([trainerName, rule]) => {
        if (rule.minCount === 0) return;
        const matchingPokemon = filteredNoFossil.filter(({ card }) => {
            const nameMatch = rule.requiredNames ? rule.requiredNames.some(n => card.name.toLowerCase().includes(n.toLowerCase())) : true;
            const typeMatch = rule.requiredType ? card.type === rule.requiredType : true;
            return nameMatch && typeMatch && card.type !== 'Supporter' && card.type !== 'Item';
        });
        if (matchingPokemon.length < rule.minCount) trainersToDrop.add(trainerName);
    });

    const filteredFinal = trainersToDrop.size > 0 ? filteredNoFossil.filter(({ card }) => !trainersToDrop.has(card.name)) : filteredNoFossil;

    // Run sim
    let simSignals = {};
    const filteredCardObjects = filteredFinal.map(o => o.card);
    if (typeof window.runEnsembleSimulation === 'function' && filteredCardObjects.length >= 4) {
        try { simSignals = window.runEnsembleSimulation(filteredCardObjects, 600) || {}; } catch(e) {}
    }

    // Call Gemini Parser
    try {
        const apiKey = _sessionApiKey;
        if (!apiKey) {
            if (typeof window.showToast === 'function') window.showToast('Please enter your API Key in Settings.', 'error');
            else alert('Please enter your API Key in Settings.');
            return;
        }

        const btn = document.getElementById('btn-ai-build');
        if (btn) {
            btn.innerHTML = `<span class='spinner'></span> Analyzing...`;
            btn.classList.add('btn-loading');
        }

        const result = await window.GeminiParser.runGeminiDeckBuild({
            ownedCards: filteredFinal.map(o => ({ ...o, _powerScore: typeof window.scorePokemon === 'function' ? window.scorePokemon(o.card, filteredCardObjects) : 0, _sim: simSignals[o.card.name] })),
            cardDb: window.TCGP_CARDS,
            ownedCardIds: Object.keys(myCollection).filter(id => myCollection[id] > 0),
            playstyle,
            type1: document.getElementById('db-type-select-1')?.value || 'Any',
            type2: document.getElementById('db-type-select-2')?.value || 'None',
            apiKey: apiKey,
            modelName: GEMINI_MODEL,
            simSignals
        });

        // Show reasoning + validation report in UI
        const out = document.getElementById('recommender-output');
        const ruleColor = result.report.isValid ? '#78c850' : result.report.isLegal ? 'var(--accent-gold)' : '#ff4444';
        out.innerHTML = `
            <div style="border:1px solid var(--accent-gold); border-radius:8px; padding:12px; margin-bottom:12px;">
                <div style="color:var(--accent-gold); font-size:0.8rem; font-weight:600; margin-bottom:6px;">🧠 Gemini Reasoning</div>
                <pre style="white-space:pre-wrap; font-size:0.75rem; color:var(--text-muted); max-height:250px; overflow-y:auto;">${result.reasoning.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
            </div>
            <div style="border:1px solid ${ruleColor}; border-radius:8px; padding:12px;">
                <div style="color:${ruleColor}; font-weight:600;">${result.report.summary}</div>
                ${result.fixLog.length ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">Auto-fixes: ${result.fixLog.join(' • ')}</div>` : ''}
            </div>
        `;
        out.classList.remove('hidden');

        window.validateAndApplyAIDeck(result.fixedNames);

    } catch (e) {
        console.error(e);
        const out = document.getElementById('recommender-output');
        if (out) {
            out.innerHTML = `<div style="color:var(--accent-red); font-weight:bold;">Error:</div><div style="color:var(--text-color);">${e.message}</div>`;
            out.classList.remove('hidden');
        }
    } finally {
        const btn = document.getElementById('btn-ai-build');
        if (btn) {
            btn.innerHTML = `AI Build ✨`;
            btn.classList.remove('btn-loading');
        }
    }
};

// Global 3D tilt handler — attach once
document.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.card-3d-wrap');
    if (!card) return;
    
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -12; // max 12deg
    const rotateY = ((x - centerX) / centerX) * 12;
    
    // Shimmer position for CSS custom properties
    const shimmerX = (x / rect.width) * 100;
    const shimmerY = (y / rect.height) * 100;
    
    card.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.04,1.04,1.04)`;
    card.style.setProperty('--shimmer-x', `${shimmerX}%`);
    card.style.setProperty('--shimmer-y', `${shimmerY}%`);
});

document.addEventListener('mouseleave', (e) => {
    const card = e.target.closest('.card-3d-wrap');
    if (!card) return;
    card.style.transform = '';
}, true);
