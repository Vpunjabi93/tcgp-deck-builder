// app.js - Main Application Logic for TCGP Analyzer

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
let _sessionApiKey = null;

window.TCGP_CARDS = []; // Global declaration
window.getAllCards = function() { return window.TCGP_CARDS || []; };
window.selectedCardsForLab = []; // Global array for Probability Lab

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data/all_cards.json');
        if (!response.ok) throw new Error("Failed to load card database");
        window.TCGP_CARDS = await response.json();
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
                if(btn.dataset.target === 'tab-visual') {
                    renderVisualSelectionGrid();
                }
            }
        });
    });

    // Visual Selection Search
    const visualSearch = document.getElementById('visual-search');
    if(visualSearch) {
        visualSearch.addEventListener('input', (e) => {
            renderVisualSelectionGrid(e.target.value);
        });
    }

    const visualSetSelect = document.getElementById('visual-set-select');
    if(visualSetSelect) {
         visualSetSelect.addEventListener('change', () => {
             renderVisualSelectionGrid(visualSearch ? visualSearch.value : '');
         });
    }

    // Mega Proceed Button
    const proceedBtn = document.getElementById('btn-proceed-decks');
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            document.querySelector('.nav-btn[data-target="view-decks"]')?.click();
            // Fallback if ID is different
            document.querySelector('.nav-btn[data-target="view-deck-builder"]')?.click();
        });
    }

    const saveFirebaseBtn = document.getElementById('btn-save-firebase');
    if (saveFirebaseBtn) saveFirebaseBtn.addEventListener('click', saveFirebaseConfig);

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
            if(window.populateProbabilityDropdowns) window.populateProbabilityDropdowns();
            const liveDrops = document.getElementById('live-deck-select');
            if(liveDrops && window.populateProbabilityDropdowns) window.populateProbabilityDropdowns(); // Shared logic
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
    let configStr = localStorage.getItem('firebase_config');
    let firebaseConfig;

    if (!configStr) {
        // HARDCODED DEFAULT as requested by user
        firebaseConfig = {
            apiKey: "AIzaSyCnXljjyIYCWhsLhjLO62gDnIhNA29bHbM",
            authDomain: "pokemon-tcgp-24c09.firebaseapp.com",
            projectId: "pokemon-tcgp-24c09",
            storageBucket: "pokemon-tcgp-24c09.firebasestorage.app",
            messagingSenderId: "174569516136",
            appId: "1:174569516136:web:c30c356093b7be0de39fdd",
            measurementId: "G-H4SJJ2KELV"
        };
    } else {
        try {
            firebaseConfig = JSON.parse(configStr);
        } catch (e) {
            console.error("Firebase Config Parse Error:", e);
        }
    }

    if (!firebaseConfig) return;

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
        console.error("Firebase Init Error:", e);
    }
}

function updateAuthUI(user) {
    const authBtn = document.getElementById('auth-btn');
    const userEmail = document.getElementById('user-email');
    if (!authBtn || !userEmail) return;

    if (user) {
        authBtn.innerText = "Sign Out";
        userEmail.innerText = user.email;
        userEmail.classList.remove('hidden');
    } else {
        authBtn.innerText = "Sign In";
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
    config = config.replace(/^(const|let|var)\s+\w+\s*=\s*/, '');
    config = config.replace(/;$/, '');
    
    try {
        let jsonCompliant = config
            .replace(/([a-zA-Z0-9_]+):/g, '"$1":') 
            .replace(/'/g, '"'); 
            
        JSON.parse(jsonCompliant);
        localStorage.setItem('firebase_config', jsonCompliant);
        document.getElementById('modal-firebase').classList.add('hidden');
        location.reload(); 
    } catch (e) {
        alert("Config Error: " + e.message);
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
            
            if(targetId === 'view-collection') renderCollectionGrid();
            if(targetId === 'view-deck-builder') renderDeckBuilderSidebar();
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
window.generateCardHTML = function(card, imgClass = '') {
    const numPart = (card.id && card.id.includes('-')) ? card.id.split('-')[1] : '001';
    const paddedNum = numPart.padStart(3, '0');
    const cleanSetCode = card.setCode === 'P-A' ? 'P-A' : card.setCode; 
    const fallbackB_URL = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/${cleanSetCode}/${cleanSetCode}_${paddedNum}_EN_SM.webp`;
    const fallbackC_URL = `https://placehold.co/400x560?text=Offline`;
    
    return `<img src="${card.img}" class="${imgClass}" loading="lazy" alt="${card.name}" onerror="this.onerror=null; this.src='${fallbackB_URL}'; this.onerror=()=>this.src='${fallbackC_URL}'">`;
};

// --- Collection Manager ---
window.renderVisualSelectionGrid = function(searchQuery = '') {
    const grid = document.getElementById('visual-card-grid');
    const setSelect = document.getElementById('visual-set-select');
    if (!grid || !setSelect) return;
    
    grid.innerHTML = '';
    const setCode = setSelect.value;
    const allCards = TCGP_CARDS.filter(c => c.setCode === setCode);
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    
    let displayCards = allCards;
    if(searchQuery) {
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

window.updateCardQuantity = function(cardId, change) {
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    let currentQty = myCollection[cardId] || 0;
    
    let newQty = currentQty + change;
    if (newQty <= 0) {
        delete myCollection[cardId];
    } else {
        myCollection[cardId] = newQty;
    }
    
    localStorage.setItem('tcgp_collection', JSON.stringify(myCollection));
    
    // Update the visual grid without losing search context
    const visualSearch = document.getElementById('visual-search');
    renderVisualSelectionGrid(visualSearch ? visualSearch.value : '');
    
    // Sync other background views
    renderCollectionGrid();
    renderDeckBuilderSidebar();
    syncCollectionToCloud();
};

window.renderCollectionGrid = function(searchQuery = '') {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const allCards = TCGP_CARDS;
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    
    let uniqueCount = 0;
    let totalCopies = 0;

    let displayCards = allCards;
    if(searchQuery) {
        const q = searchQuery.toLowerCase();
        displayCards = allCards.filter(c => c.name.toLowerCase().includes(q) || c.type?.toLowerCase().includes(q));
    }

    displayCards.forEach(card => {
        const qty = myCollection[card.id] || 0;
        if (qty > 0) { uniqueCount++; totalCopies += qty; }

        const isOwned = qty > 0;
        const cardEl = document.createElement('div');
        cardEl.className = `tcgp-card ${isOwned ? 'owned' : ''}`;
        
        let colorVar = `var(--type-${card.type?.toLowerCase() || 'colorless'})`;
        if(card.type === 'Supporter' || card.type === 'Item') colorVar = '#8b949e';
        cardEl.style.borderTop = `4px solid ${colorVar}`;

        cardEl.innerHTML = `
            <div class="card-img-placeholder">
                ${generateCardHTML(card, 'card-real-img')}
                ${isOwned ? `<div class="card-qty-badge">${qty}</div>` : ''}
            </div>
            <div class="card-info">
                <div class="card-name">${card.name}</div>
                <div class="card-meta">${card.id} • ${card.rarity}</div>
            </div>
        `;
        grid.appendChild(cardEl);
    });

    document.getElementById('stat-unique-cards').innerText = `${uniqueCount} Unique Cards`;
    document.getElementById('stat-total-copies').innerText = `${totalCopies} Total Copies`;
    const completion = ((uniqueCount / allCards.length) * 100).toFixed(1);
    document.getElementById('stat-completion').innerText = `${completion}% Complete`;
};

// --- Deck Builder ---
window.currentDeck = [];
let deckBuilderSearchQuery = '';

window.renderDeckBuilderSidebar = function() {
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
            slot.style.backgroundImage = `url(${card.img})`;
            slot.innerHTML = `<button class="remove-card" onclick="removeFromDeck(${i})">×</button>`;
        } else {
            slot.innerHTML = `<div class="slot-number">${i + 1}</div>`;
        }
        grid.appendChild(slot);
    }

    document.getElementById('deck-current-count').innerText = window.currentDeck.length;
    document.getElementById('btn-save-deck').disabled = window.currentDeck.length !== 20;
}

window.addToDeck = function(id) {
    if (window.currentDeck.length >= 20) return;
    const card = TCGP_CARDS.find(c => c.id === id);
    if (card) {
        window.currentDeck.push(card);
        renderDeckSlots();
        renderDeckBuilderSidebar();
    }
};

window.removeFromDeck = function(index) {
    window.currentDeck.splice(index, 1);
    renderDeckSlots();
    renderDeckBuilderSidebar();
};

window.showFirebaseConfigModal = showFirebaseConfigModal;

// --- Toast Notification ---
window.showToast = function(message, type = 'success') {
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
        if(e.target !== oppInput && e.target !== suggBox) suggBox.classList.add('hidden');
    });
});

async function addRevealedCard(cardName) {
    liveRevealedCards.push(cardName);
    actionsLoggedThisMatch++;
    renderRevealedCards();
    await updateOpponentPrediction();
}

window.removeRevealedCard = function(idx) {
    liveRevealedCards.splice(idx, 1);
    renderRevealedCards();
    updateOpponentPrediction();
};

function renderRevealedCards() {
    const list = document.getElementById('revealed-cards-list');
    if(liveRevealedCards.length === 0) {
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

    // Build a scored candidate list from cards NOT yet revealed
    const scored = [];

    allCards.forEach(card => {
        if (revealedSet.includes(card.name.toLowerCase())) return; // already seen

        let score = 0;
        const name = card.name.toLowerCase();
        const type = card.type || '';
        const stage = card.stage || '';

        // === SYNERGY RULES ===

        // Rule 1: Bench is empty (only 1 active seen) → Pokéball / Basic very likely
        const pokemonSeen = liveRevealedCards.filter(n => {
            const c = allCards.find(x => x.name.toLowerCase() === n.toLowerCase());
            return c && c.type !== 'Supporter' && c.type !== 'Item';
        });
        const isOnlyOnePokemon = pokemonSeen.length <= 1;
        if (isOnlyOnePokemon && name.includes('poké ball')) score += 40;
        if (isOnlyOnePokemon && stage === 'Basic') score += 25;

        // Rule 2: Opponent has an EX active → healing / support likely
        const hasEXActive = liveRevealedCards.some(n => n.toLowerCase().includes(' ex'));
        if (hasEXActive && (name.includes('potion') || name.includes('heal'))) score += 35;
        if (hasEXActive && type === 'Supporter') score += 20;

        // Rule 3: Evolution logic — if a Basic was seen, Stage 1 of that line is likely
        liveRevealedCards.forEach(revealed => {
            const basicForm = (window.BASICS_MAP && Object.keys(window.BASICS_MAP).find(k =>
                window.BASICS_MAP[k].toLowerCase() === revealed.toLowerCase()
            ));
            if (basicForm && card.name === basicForm) score += 45;
            // Reverse: basic seen → stage 1 probable
            if (window.BASICS_MAP && window.BASICS_MAP[card.name] &&
                revealedSet.includes(window.BASICS_MAP[card.name].toLowerCase())) {
                score += 40;
            }
        });

        // Rule 4: Type match — if revealed cards share a dominant type, same-type cards likely
        const dominantType = (() => {
            const tc = {};
            liveRevealedCards.forEach(n => {
                const c = allCards.find(x => x.name.toLowerCase() === n.toLowerCase());
                if (c && c.type && c.type !== 'Supporter' && c.type !== 'Item') {
                    tc[c.type] = (tc[c.type] || 0) + 1;
                }
            });
            return Object.entries(tc).sort((a,b) => b[1]-a[1])[0]?.[0];
        })();
        if (dominantType && card.type === dominantType) score += 15;

        // Rule 5: Draw/search Supporters always probable mid-game
        if (type === 'Supporter' && (name.includes('research') || name.includes('sabrina') || name.includes('giovanni'))) {
            score += 20;
        }

        // Rule 6: Already-seen archetype boosts matching cards
        if (typeof cachedMetaDecks !== 'undefined' && cachedMetaDecks) {
            cachedMetaDecks.forEach(deck => {
                const isLikelyDeck = liveRevealedCards.some(r => deck.keyCards?.includes(r));
                if (isLikelyDeck && deck.fullList?.includes(card.name)) score += 18;
            });
        }

        if (score > 0) scored.push({ card, score });
    });

    // Normalise scores to %
    const maxScore = Math.max(...scored.map(s => s.score), 1);
    const topCards = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(s => ({ ...s, pct: Math.min(Math.round((s.score / maxScore) * 100), 97) }));

    if (topCards.length === 0) {
        nextTurnSection.style.display = 'none';
        return;
    }

    nextTurnSection.style.display = 'block';
    nextTurnGrid.innerHTML = topCards.map(({ card, pct }) => {
        const imgHTML = typeof window.generateCardHTML === 'function'
            ? window.generateCardHTML(card, 'next-turn-card-img')
            : `<img src="${card.img}" class="next-turn-card-img" alt="${card.name}">`;

        const barColor = pct >= 70 ? 'var(--accent-gold)' : pct >= 40 ? '#78c850' : 'var(--text-muted)';

        return `
            <div class="next-turn-card-item">
                ${imgHTML}
                <div class="next-turn-card-label">${card.name}</div>
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
    
// Step 1: Build a richer collection summary using available data
    const allOwnedCards = Object.entries(myCollection)
        .filter(([id, qty]) => qty > 0)
        .map(([id, qty]) => {
            const card = window.TCGP_CARDS.find(c => c.id === id);
            if (!card) return null;
            return { card, qty };
        })
        .filter(Boolean);

    const ownedCardObjects = allOwnedCards.map(o => o.card);

    // Step 2: Run ensemble simulation for card-level signals
    let simSignals = {};
    if (typeof window.runEnsembleSimulation === 'function' && ownedCardObjects.length >= 4) {
        try {
            const rawSim = window.runEnsembleSimulation(ownedCardObjects, 600);
            simSignals = rawSim || {};
        } catch(e) {
            console.warn('Simulation skipped:', e.message);
        }
    }

    const collectionSummary = allOwnedCards
        .map(({ card, qty }) => {
            const score = typeof window.scorePokemon === 'function'
                ? window.scorePokemon(card, ownedCardObjects)
                : 0;
            return { card, qty, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(({ card, qty, score }) => {
            const sig = simSignals[card.name];
            const wf  = sig ? `, WeightedFit:${sig.weightedScore.toFixed(3)}`   : '';
            const cr  = sig ? `, Consistency:${sig.consistencyRating.toFixed(3)}` : '';
            const pt  = sig ? `, PeakTurn:${
                (() => {
                    const scores = [sig.bestCase, sig.baseCase, sig.worstCase];
                    const best = Math.max(...scores);
                    return best > 0 ? (1 / best).toFixed(1) : '?';
                })()
            }` : '';
            return `${card.name} (${card.type}, ${card.stage}, HP:${card.hp}, Retreat:${card.retreatCost}, Qty:${qty}, PowerScore:${score.toFixed(1)}${wf}${cr}${pt})`;
        })
        .join('\n');


    // Step 3: Replace the prompt with this deep strategy version
    const prompt = `You are a world-class Pokémon TCG Pocket competitive player and deck architect.

I will give you my card collection with structural data.
You already know every card's attacks, abilities, and effects from your training.
Use that knowledge combined with the structural data I provide to build the optimal deck.

═══════════════════════════════════
PHASE 1 — DECK PLAN (think out loud)
═══════════════════════════════════
Before choosing cards, write a short DECK PLAN covering these points:

WIN CONDITION:
- Name the single strongest win condition from my collection.
- It must be the highest-HP EX or Stage 2 with the best attack-to-energy ratio.

ENERGY ACCELERATION:
- Name any card in my collection with a passive that generates or attaches energy.
- If one exists, it is MANDATORY. State which card and which ability.
- If none exists, confirm you will pick a win condition costing 2 energy or less.

TRAINER SELECTIONS:
- List every Gym Leader Trainer you plan to include.
- For each one, explicitly name which Pokémon in THIS deck they target.
- If no matching Pokémon exist for a Trainer, do NOT include that Trainer.

EVOLUTION LINES:
- List every evolution card you plan to include.
- Confirm its Basic (and Stage 1 if Stage 2) is also in the list.
- If the Basic is missing from my collection, remove the entire line.

TYPE SUMMARY:
- State the deck's dominant Pokémon type.
- Confirm every Gym Leader Trainer matches that type.

═══════════════════════════════════
PHASE 2 — SELF-CHECK (audit your plan)
═══════════════════════════════════
Before writing the final JSON, answer each question:

1. TRAINER TYPE MATCH — Does every Gym Leader Trainer card match the deck's dominant type?
   Brock = needs Onix/Golem/Geodude/Graveler in the list.
   Misty = needs Water Pokémon in the list.
   Blaine = needs Ninetales/Magmar/Rapidash in the list.
   Erika = needs Grass Pokémon in the list.
   Koga = needs Grimer/Weezing in the list.
   Lt. Surge = needs Lightning Pokémon in the list.
   → If any Trainer fails this check, REMOVE them from the plan.

2. EVOLUTION INTEGRITY — Does every Stage 1 have its Basic? Every Stage 2 have Stage 1 + Basic?
   → If any evolution is orphaned, remove it or add the missing Basic from my collection.

3. CARD NAME ACCURACY — Is every card name exactly as it appears in my collection data below?
   → Correct any name that doesn't match exactly.

4. COUNT CHECK — Does your list total exactly 20 cards?
   → Add or remove cards until it is exactly 20.

5. DUPLICATE CHECK — Does any single card name appear more than 2 times?
   → Reduce to maximum 2 copies.

6. POKÉMON MINIMUM — Does the list contain at least 4 Basic Pokémon?
   → If not, replace Trainer/Item cards with Basic Pokémon from my collection.

═══════════════════════════════════
PHASE 3 — FINAL OUTPUT
═══════════════════════════════════
PLAYSTYLE TARGET: ${playstyle}
- Aggro: maximise early damage, low retreat costs, fast energy
- Control: status conditions, retreat punishment, defensive bulk
- Balanced: resilient engine with setup speed

MY COLLECTION (name, type, stage, HP, retreat, qty, PowerScore, WeightedFit, Consistency, PeakTurn):
Key: WeightedFit = simulation contribution score (higher = more impactful).
     Consistency = stability under opponent disruption (1.0 = perfectly consistent).
     PeakTurn    = estimated earliest turn this card reaches full impact (lower = faster).
Use these signals to PREFER cards with high WeightedFit AND high Consistency.
Deprioritise cards with PeakTurn > 5 unless they are the deck's primary win condition.
${collectionSummary}

Now output your DECK PLAN, then your SELF-CHECK answers, then FINALLY a JSON array of exactly 20 card name strings.
The JSON must be the last thing in your response.
No markdown fences around the JSON. No code blocks. Just the raw array at the end.`;

    const apiKey = _sessionApiKey;
    console.log('Attempting AI Build with key:', apiKey ? 'Found' : 'Missing');
    if (!apiKey) {
        if (typeof window.showToast === 'function') {
            window.showToast('Please enter your API Key in Settings.', 'error');
        } else {
            alert('Please enter your API Key in Settings.');
        }
        return;
    }

    const btn = document.getElementById('btn-ai-build');
    if (btn) {
        btn.innerHTML = `<span class='spinner'></span> Analyzing...`;
        btn.classList.add('btn-loading');
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2 }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "API Auth Error");
        }

        const data = await response.json();

        // Guard: Gemini safety filter may return empty candidates
        if (!data.candidates || data.candidates.length === 0) {
            const blockReason = data.promptFeedback?.blockReason || 'Unknown';
            throw new Error(`Gemini blocked this request (${blockReason}). Try a different playstyle or collection.`);
        }

        const responseText = data.candidates[0].content.parts[0].text;
        console.log("Raw Gemini response:", responseText);

        let suggestedCards = [];

        // GUARD: empty collection
        if (allOwnedCards.length === 0) {
            showToast('Your collection is empty. Add cards first.', 'error');
            return;
        }
        if (allOwnedCards.length < 10) {
            showToast('Small collection detected — AI will build the best deck possible.', 'success');
        }

        // ROBUST PARSER
        // Strategy 1: scan ALL [...] blocks from last to first, pick first valid array ≥ 10 items
        const arrayMatches = [...responseText.matchAll(/\[[\s\S]*?\]/g)];
        for (let i = arrayMatches.length - 1; i >= 0; i--) {
            try {
                const candidate = arrayMatches[i][0]
                    .replace(/```json?/gi, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(candidate);
                if (Array.isArray(parsed) && parsed.length >= 10) {
                    suggestedCards = parsed;
                    break;
                }
            } catch(e) { continue; }
        }

        // Strategy 2: lastIndexOf fallback if Strategy 1 found nothing
        if (suggestedCards.length === 0) {
            const lastBracket = responseText.lastIndexOf('[');
            if (lastBracket === -1) throw new Error("AI returned invalid format.");
            let slice = responseText.slice(lastBracket);
            slice = slice.replace(/```json?/gi, '').replace(/```/g, '').trim();
            const closingBracket = slice.lastIndexOf(']');
            if (closingBracket === -1) throw new Error("AI returned invalid format.");
            slice = slice.slice(0, closingBracket + 1);
            try {
                suggestedCards = JSON.parse(slice);
            } catch(e) {
                console.error("JSON parse failed on:", slice);
                throw new Error("Could not parse AI response: " + e.message);
            }
        }

        if (!Array.isArray(suggestedCards) || suggestedCards.length === 0) {
            throw new Error("AI returned an empty or invalid deck list.");
        }

        if(typeof window.validateAndApplyAIDeck === 'function') {
            window.validateAndApplyAIDeck(suggestedCards);
        }
    } catch (e) {
        console.error("Gemini Build Error:", e);
        const out = document.getElementById('recommender-output');
        if(out) out.innerHTML = `<span class="empty-state" style="color:var(--accent-red)">AI error: ${e.message}</span>`;
    } finally {
        if (btn) {
            btn.innerHTML = 'AI Build \u2728';
            btn.classList.remove('btn-loading');
        }
    }
};

