// gemini.js - Gemini Vision API Integration for Collection Scanning
// V4: Batch Preview, Iterative Scanning, Edition-View Mode

let currentScanMode = 'standard';
let pendingFiles = [];
let pendingReviewCollection = {};

document.addEventListener('DOMContentLoaded', () => {
    const uploadInput = document.getElementById('video-upload');
    const uploadZone = document.getElementById('upload-zone');

    uploadZone.addEventListener('click', () => uploadInput.click());

    uploadInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        pendingFiles = files;
        showBatchPreview(files);
    });
});

// --- Scan Initialization ---
// The UI logic for tabs handles switching visibility now. 
// When "Scan Missing Cards" is clicked, it always uses Reverse Scan mode.

// --- Batch Upload Preview ---
function showBatchPreview(files) {
    const uploadZone = document.getElementById('upload-zone');
    const previewContainer = document.getElementById('upload-preview-container') || document.getElementById('upload-preview-strip');
    if (!previewContainer) {
        // Fallback: just process directly
        processMediaWithGemini(files);
        return;
    }

    const grid = document.getElementById('upload-preview-grid');

    uploadZone.classList.add('hidden');
    previewContainer.classList.remove('hidden');

    if (grid) {
        grid.innerHTML = '';
        files.forEach((file, idx) => {
            const thumb = document.createElement('div');
            thumb.className = 'preview-thumb';

            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                thumb.appendChild(img);
            } else if (file.type.startsWith('video/')) {
                const vid = document.createElement('video');
                vid.src = URL.createObjectURL(file);
                vid.muted = true;
                thumb.appendChild(vid);
            }

            const nameLabel = document.createElement('div');
            nameLabel.className = 'file-name';
            nameLabel.innerText = file.name;
            thumb.appendChild(nameLabel);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-preview';
            removeBtn.innerText = '×';
            removeBtn.onclick = () => removePreviewFile(idx);
            thumb.appendChild(removeBtn);

            grid.appendChild(thumb);
        });
    } else {
        // Simple strip fallback
        previewContainer.innerHTML = '';
        files.forEach(file => {
            const tag = document.createElement('span');
            tag.style.cssText = 'background:var(--bg-surface);padding:4px 8px;border-radius:6px;font-size:0.8rem;';
            tag.innerText = file.name;
            previewContainer.appendChild(tag);
        });
    }
}

function removePreviewFile(idx) {
    pendingFiles.splice(idx, 1);
    if (pendingFiles.length === 0) {
        cancelUpload();
    } else {
        showBatchPreview(pendingFiles);
    }
}

window.cancelUpload = function () {
    pendingFiles = [];
    const uploadZone = document.getElementById('upload-zone');
    const previewContainer = document.getElementById('upload-preview-container') || document.getElementById('upload-preview-strip');
    uploadZone.classList.remove('hidden');
    if (previewContainer) previewContainer.classList.add('hidden');
    document.getElementById('video-upload').value = '';
};

window.confirmUpload = function () {
    if (pendingFiles.length === 0) return;
    const previewContainer = document.getElementById('upload-preview-container') || document.getElementById('upload-preview-strip');
    if (previewContainer) previewContainer.classList.add('hidden');
    processMediaWithGemini(pendingFiles);
};

// --- Core Gemini Scan ---
async function processMediaWithGemini(files) {
    const targetSetSelect = document.getElementById('reverse-scan-set-select');
    if (targetSetSelect && targetSetSelect.value === 'A1') {
        const confirmA1 = confirm("You have selected 'Genetic Apex (A1)'. Is this correct?\n\nTip: You must select the exact set your screenshots are from before scanning.");
        if (!confirmA1) {
            if (typeof cancelUpload === 'function') cancelUpload();
            return;
        }
    }

    const apiKey = typeof _sessionApiKey !== 'undefined' ? _sessionApiKey : null;
    if (!apiKey) {
        alert("Please set your Gemini API key first!");
        document.getElementById('api-key-btn').click();
        return;
    }

    const uploadZone = document.getElementById('upload-zone');
    const statusPanel = document.getElementById('scan-status');
    const statusText = document.getElementById('scan-status-text');

    uploadZone.classList.add('hidden');
    statusPanel.classList.remove('hidden');

    try {
        statusText.innerText = `Encoding ${files.length} file(s) for analysis...`;

        const inlineDataParts = await Promise.all(files.map(async file => {
            const base64 = await fileToBase64(file);
            return {
                "inline_data": {
                    "mime_type": file.type || 'image/jpeg',
                    "data": base64.split(',')[1]
                }
            };
        }));

        statusText.innerText = `Gemini is finding your missing cards...`;

        const targetSet = document.getElementById('reverse-scan-set-select')?.value || 'A1';
        const prompt = getReverseScanPrompt(files.length, targetSet);

        const requestBody = {
            contents: [{
                parts: [
                    { "text": prompt },
                    ...inlineDataParts
                ]
            }]
        };

        // Use a valid model name (gemini-1.5-flash or gemini-2.0-flash-exp)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "API Auth Error");
        }

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;

        // Robust JSON extraction
        let scannedCards = null;
        try {
            // Strip markdown code blocks if present
            const cleaned = responseText
                .replace(/```json?/gi, '')
                .replace(/```/g, '')
                .trim();

            // Find the outermost { } with a greedy match
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) {
                // Use match[0] to safely parse the matched string
                const parsed = JSON.parse(match[0]);
                if (parsed && Array.isArray(parsed.missingNumbers)) {
                    scannedCards = parsed;
                }
            }
        } catch (e) {
            console.error('JSON parse failed:', responseText);
        }

        if (!scannedCards) throw new Error("AI returned invalid data format. Try again.");

        statusText.innerText = `Preparing review...`;

        setTimeout(() => {
            statusPanel.classList.add('hidden');
            showReviewModalFromReverseScan(scannedCards, targetSet);
        }, 500);

    } catch (error) {
        console.error("Gemini Error:", error);
        alert(`Analysis failed: ${error.message}\nEnsure your API key is valid.`);
        uploadZone.classList.remove('hidden');
        statusPanel.classList.add('hidden');
    }
}

// --- Prompts ---
function getStandardPrompt(fileCount) {
    return `
    This is a set of ${fileCount} screenshot(s) / video(s) of a Pokémon TCG Pocket card collection. 
    For each distinct card visibly shown across ALL files, return the card name exactly as it appears in the official game, and how many copies of it appear (look at the quantity badges).
    Combine the total counts logically without double counting the same card overlapping between two screenshots.
    Only return a strict JSON array of objects with 'name' and 'count' properties. No markdown, no extra text.
    Example: [{"name":"Pikachu EX","count":1},{"name":"Charmander","count":3}]
    `;
}

function getReverseScanPrompt(fileCount, targetSet) {
    return `You are a JSON-only response bot. Do not write any explanation, greeting, markdown, or code blocks. Your entire response must be a single line of raw JSON and nothing else.

You are given ${fileCount} screenshot(s) of a Pokémon TCG Pocket collection in Edition View for set "${targetSet}". Each screenshot shows a grid of cards. Cards that are OWNED appear in full color with a name and image. Cards that are MISSING appear as a grey empty slot showing only a number (e.g. 003, 017).

Your task: scan ALL ${fileCount} images completely. Collect every grey slot number you see across ALL images. Return them as a single JSON object.

Rules:
- Only include numbers from grey/empty slots
- Include ALL grey slots from ALL images without stopping early
- Output must be one single line, no line breaks, no markdown
- Do not add any text before or after the JSON

Required output format (example only): {"missingNumbers":[1,3,4,5,8,9,11,13]}`;
}

// --- Edition View Processing ---
function showReviewModalFromReverseScan(scanData, targetSetCode) {
    const missingNumbers = scanData.missingNumbers || [];

    // Get all cards for the target set
    const allSetCards = TCGP_CARDS.filter(c => c.setCode === targetSetCode);

    // Reverse calculate: Owned = All - Missing
    const matchedCards = [];
    allSetCards.forEach(card => {
        // ID format: A1-001 -> 001 -> 1
        const numPart = parseInt(card.id.split('-')[1], 10);
        if (!missingNumbers.includes(numPart)) {
            // It's owned!
            matchedCards.push({ name: card.name, id: card.id, count: 1 });
        }
    });

    showReviewModalReverse(matchedCards, targetSetCode);
}

function normalizeSetCode(rawSet) {
    if (!rawSet) return 'A1';
    const s = rawSet.trim().toUpperCase();

    const nameMap = {
        'GENETIC APEX': 'A1',
        'MYTHICAL ISLAND': 'A1a',
        'SPACE-TIME SMACKDOWN': 'A2',
        'SPACE TIME SMACKDOWN': 'A2',
        'TRIUMPHANT LIGHT': 'A2a',
        'SHINING REVELRY': 'A2b',
        'CELESTIAL GUARDIANS': 'A3',
        'EXTRADIMENSIONAL CRISIS': 'A3a',
        'EEVEE GROVE': 'A3b',
        'WISDOM OF SEA AND SKY': 'A4',
        'SECLUDED SPRINGS': 'A4a',
        'MEGA RISING': 'B1',
        'CRIMSON BLAZE': 'B1a',
        'FANTASTICAL PARADE': 'B2',
        'PROMO-A': 'P-A',
        'PROMO': 'P-A'
    };

    // Check if it's already a valid code
    const validCodes = ['A1', 'A1A', 'A2', 'A2A', 'A2B', 'A3', 'A3A', 'A3B', 'A4', 'A4A', 'B1', 'B1A', 'B2', 'P-A'];
    if (validCodes.includes(s)) {
        // Restore proper casing for sub-sets
        const caseMap = { 'A1A': 'A1a', 'A2A': 'A2a', 'A2B': 'A2b', 'A3A': 'A3a', 'A3B': 'A3b', 'A4A': 'A4a', 'B1A': 'B1a' };
        return caseMap[s] || s;
    }

    return nameMap[s] || rawSet.trim();
}

// --- Review Modal Reverse Scan ---
function showReviewModalReverse(scannedCards, targetSetCode) {
    const modal = document.getElementById('modal-review');
    const listEl = document.getElementById('review-card-list');
    listEl.innerHTML = '';
    pendingReviewCollection = {};

    let totalCardsAdded = 0;
    scannedCards.forEach(item => {
        pendingReviewCollection[item.id] = item.count || 1;
        totalCardsAdded++;
    });

    const setSelect = document.getElementById('reverse-scan-set-select');
    const setName = setSelect && setSelect.options.length ? setSelect.options[setSelect.selectedIndex].text : targetSetCode;
    document.getElementById('modal-review').querySelector('h2').innerText = `Adding ${totalCardsAdded} Cards from ${setName}`;
    document.getElementById('modal-review').querySelector('p').innerText = `Gemini calculated your owned cards based on missing numbers for ${targetSetCode}. Add them now?`;

    renderReviewList();
    modal.classList.remove('hidden');

    document.getElementById('btn-cancel-review').onclick = () => {
        modal.classList.add('hidden');
        resetScanUI();
    };

    document.getElementById('btn-confirm-review').onclick = () => {
        saveReviewedCollection();
        modal.classList.add('hidden');
    };
}

function renderReviewList() {
    const listEl = document.getElementById('review-card-list');
    listEl.innerHTML = '';

    const sortedIds = Object.keys(pendingReviewCollection).sort();

    if (sortedIds.length === 0) {
        listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No matchable cards found in the scan.</p>';
        return;
    }

    sortedIds.forEach(id => {
        const qty = pendingReviewCollection[id];
        const dbCard = getAllCards().find(c => c.id === id);
        if (!dbCard) return;

        const itemEl = document.createElement('div');
        itemEl.className = 'review-item';

        itemEl.innerHTML = `
            <div class="review-item-info">
                ${dbCard.img ? `<img src="${dbCard.img}" class="review-img">` : `<div style="width:40px;height:56px;background:#333;"></div>`}
                <div>
                    <strong>${dbCard.name}</strong><br>
                    <small style="color:var(--text-muted)">${dbCard.set} • ${dbCard.rarity}</small>
                </div>
            </div>
            <div class="review-qty-controls">
                <button class="btn-ghost" onclick="modifyReviewQty('${dbCard.id}', -1)">-</button>
                <span class="review-qty">${qty}</span>
                <button class="btn-ghost" onclick="modifyReviewQty('${dbCard.id}', 1)">+</button>
            </div>
        `;
        listEl.appendChild(itemEl);
    });
}

window.modifyReviewQty = function (cardId, change) {
    let currentQty = pendingReviewCollection[cardId] || 0;
    let newQty = currentQty + change;

    if (newQty <= 0) {
        delete pendingReviewCollection[cardId];
    } else {
        pendingReviewCollection[cardId] = newQty;
    }
    renderReviewList();
};

// --- Iterative Scanning: Save & Return to Scan ---
function saveReviewedCollection() {
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');

    Object.keys(pendingReviewCollection).forEach(id => {
        myCollection[id] = (myCollection[id] || 0) + pendingReviewCollection[id];
    });

    localStorage.setItem('tcgp_collection', JSON.stringify(myCollection));

    const addedCount = Object.keys(pendingReviewCollection).length;
    pendingReviewCollection = {};

    // Iterative Scanning: Reset scan UI so user can scan again
    resetScanUI();

    // Sync to cloud if available
    if (typeof syncCollectionToCloud === 'function') {
        syncCollectionToCloud();
    }

    // Show success toast instead of navigating away
    showToast(`✅ Added ${addedCount} cards to your collection!`);

    // Refresh collection grid in background
    if (window.renderCollectionGrid) {
        window.renderCollectionGrid();
    }
}

function resetScanUI() {
    const uploadZone = document.getElementById('upload-zone');
    const previewContainer = document.getElementById('upload-preview-container') || document.getElementById('upload-preview-strip');

    uploadZone.classList.remove('hidden');
    if (previewContainer) previewContainer.classList.add('hidden');
    document.getElementById('video-upload').value = '';
    pendingFiles = [];
}

// --- Helpers ---
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function getCardByName(name) {
    const lowerName = name.toLowerCase().trim()
        .replace(/\s*ex$/i, '')             // Remove 'EX' for looser matching
        .replace(/[^a-z0-9♀♂']/g, '');     // Preserve gender symbols and apostrophes

    return TCGP_CARDS.find(c => {
        const dbName = c.name.toLowerCase().trim()
            .replace(/\s*ex$/i, '')
            .replace(/[^a-z0-9♀♂']/g, '');
        return dbName === lowerName || dbName.includes(lowerName) || lowerName.includes(dbName);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// AI DECK BUILDER — Gemini Prompt Engine
// Reads owned collection from localStorage, formats enriched card data,
// sends to Gemini, and hands the result to validateAndApplyAIDeck() in strategy.js
// ─────────────────────────────────────────────────────────────────────────────

// Entry point — called from the "Build My Deck" button in app.js
window.buildAIDeck = async function (playstyle = 'Any', energyType = 'Any') {
    const apiKey = typeof _sessionApiKey !== 'undefined' ? _sessionApiKey : null;
    if (!apiKey) {
        alert('Please set your Gemini API key first!');
        document.getElementById('api-key-btn')?.click();
        return;
    }

    const allCards = window.TCGP_CARDS || [];
    const collection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    const ownedIds = Object.keys(collection).filter(id => collection[id] > 0);

    if (ownedIds.length < 10) {
        alert('Add more cards to your collection first (need at least 10).');
        return;
    }

    // Resolve owned IDs → full card objects
    const ownedCards = ownedIds
        .map(id => allCards.find(c => c.id === id))
        .filter(Boolean);

    // Filter collection to target energy type + Colorless + Trainers
    const filteredCards = (energyType && energyType !== 'Any')
        ? ownedCards.filter(card => {
            if (card.category === 'Trainer') return true;
            if (card.category === 'Energy') return card.energyType === energyType || card.energyType === 'Colorless';
            if (card.category === 'Pokemon') return card.type === energyType || card.type === 'Colorless';
            return false;
        })
        : ownedCards;

    // ─── PRE-FILTER: Strip out Pokémon with wrong energy type BEFORE sending to Gemini
    // Gemini can only pick from what it sees. Never show it off-type Pokémon.
    // Trainers and Energy cards are always included (type-agnostic).
    let geminiPool;
    if (energyType && energyType !== 'Any') {
        const allowedTypes = new Set([energyType, 'Colorless']);
        geminiPool = filteredCards.filter(card => {
            if (card.category === 'Pokemon') {
                return allowedTypes.has(card.type);
            }
            return true; // Trainers, Energy cards: always include
        });

        console.log(`[EnergyGuard Pre-filter] Pool reduced from ${filteredCards.length} → ${geminiPool.length} cards (${energyType} + Colorless Pokémon only)`);

        if (geminiPool.filter(c => c.category === 'Pokemon').length < 8) {
            console.warn(`[EnergyGuard] Warning: Only ${geminiPool.filter(c => c.category === 'Pokemon').length} valid Pokémon in pool. Deck may be weak.`);
        }
    } else {
        geminiPool = filteredCards;
    }

    if (geminiPool.length < 10) {
        alert(`Not enough ${energyType} cards in your collection to build a deck. Try a different type or add more cards.`);
        const btn = document.getElementById('btn-ai-build-deck');
        if (btn) { btn.disabled = false; btn.innerText = 'AI Build ✨'; }
        return;
    }

    const prompt = buildAIDeckPrompt(geminiPool, playstyle, energyType);

    // Show loading state
    const btn = document.getElementById('btn-ai-build-deck');
    const originalText = btn?.innerText;
    if (btn) { btn.disabled = true; btn.innerText = '🤖 Building...'; }

    try {
        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.4,   // low temp = more consistent, structured output
                maxOutputTokens: 8192
            }
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }
        );

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gemini API error');
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const finishReason = data.candidates?.[0]?.finishReason;

        // TEMP DEBUG — remove after fix confirmed
        console.log('=== GEMINI RAW RESPONSE ===');
        console.log('finishReason:', finishReason);
        console.log('responseText:', responseText);
        console.log('full candidates:', JSON.stringify(data.candidates, null, 2));
        console.log('===========================');

        if (!responseText && finishReason) {
            throw new Error(`Gemini stopped early (${finishReason}). Try a different energy type or playstyle.`);
        }

        // Parse the JSON array Gemini returns
        const cleaned = responseText.replace(/```json?/gi, '').replace(/```/g, '').trim();
        const startIdx = cleaned.indexOf('[');
        const endIdx = cleaned.lastIndexOf(']');
        if (startIdx === -1 || endIdx === -1) throw new Error('Gemini returned unexpected format. Try again.');

        const deckIds = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
        if (!Array.isArray(deckIds) || deckIds.length === 0) {
            throw new Error('Gemini returned an empty deck. Try again.');
        }

        const enforcedDeckIds = enforceEnergyTypeConstraint(deckIds, energyType, geminiPool);

        // Resolve IDs → card names for validateAndApplyAIDeck
        const deckNames = enforcedDeckIds.map(item => {
            const card = (window.TCGP_CARDS || []).find(c => c.id === item.id);
            return card ? card.name : null;
        }).filter(Boolean);

        if (deckNames.length === 0) throw new Error('Gemini returned no valid card IDs. Try again.');

        // Hand off to strategy.js guardrail system
        if (typeof window.validateAndApplyAIDeck === 'function') {
            window.validateAndApplyAIDeck(deckNames);
        } else {
            console.error('validateAndApplyAIDeck not found — is strategy.js loaded?');
        }

    } catch (err) {
        console.error('AI Deck Build error:', err);
        alert(`Deck build failed: ${err.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = originalText; }
    }
};

// Formats the owned collection into a structured prompt for Gemini
function buildAIDeckPrompt(ownedCards, playstyle, energyType = 'Any') {
    // Format each card into a concise descriptor line Gemini can reason about
    const cardLines = ownedCards.map(card => {
        const parts = [];

        parts.push(`- ${card.name} [${card.category}] (id: ${card.id})`);

        if (card.category === 'Pokemon') {
            parts.push(`  Type: ${card.type}, Stage: ${card.stage}, HP: ${card.hp}`);
            if (card.evolvesFrom) parts.push(`  Evolves from: ${card.evolvesFrom}`);

            // Attacks with energy cost and damage
            if (card.attacks && card.attacks.length > 0) {
                card.attacks.forEach(atk => {
                    const cost = atk.cost?.join(', ') || 'None';
                    const text = atk.text ? ` — ${atk.text.slice(0, 120)}` : '';
                    parts.push(`  Attack: ${atk.name} | Cost: ${cost} | Dmg: ${atk.damage}${text}`);
                });
            }

            // Abilities
            if (card.abilities && card.abilities.length > 0) {
                card.abilities.forEach(ab => {
                    const text = ab.text ? ` — ${ab.text.slice(0, 120)}` : '';
                    parts.push(`  ${ab.type}: ${ab.name}${text}`);
                });
            }

        } else if (card.category === 'Trainer') {
            parts.push(`  Trainer Type: ${card.trainerType}`);
            if (card.effect) parts.push(`  Effect: ${card.effect.slice(0, 120)}`);

        } else if (card.category === 'Energy') {
            parts.push(`  Energy Type: ${card.energyType}`);
            if (card.effect) parts.push(`  Effect: ${card.effect.slice(0, 120)}`);
        }

        return parts.join('\n');
    }).join('\n\n');

    const playstyleInstruction = playstyle && playstyle !== 'Any'
        ? `The player prefers a **${playstyle}** playstyle.`
        : 'Build the strongest, most consistent deck possible regardless of playstyle.';

    const energyConstraintBlock = energyType && energyType !== 'Any'
      ? `POKEMON TYPE CONSTRAINT — THIS IS MANDATORY, NOT A SUGGESTION:
Each card object in the data I gave you has a "type" field.
You may ONLY select Pokémon cards where the "type" field is exactly "${energyType}" or exactly "Colorless".
Do NOT select any Pokémon card where type is "${energyType === 'Fire' ? 'Water, Grass, Lightning, Psychic, Fighting, Darkness, Metal, Dragon, Fairy' : 'any other type besides ' + energyType + ' and Colorless'}".

To be clear about what "type" means in this context:
- It is the field called "type" in each card's JSON object
- It is NOT the card's attack cost, NOT the card's weakness, NOT a theme
- It is a single word like "Fire", "Water", "Grass", "Lightning", etc.
- Colorless Pokémon (type = "Colorless") are always allowed regardless of the energy type setting

SELF-CHECK before outputting your JSON:
Go through each card ID you are about to return. For every Pokémon card, confirm its "type" is "${energyType}" or "Colorless". 
If you find any Pokémon with a different type, REMOVE it and replace it with a Pokémon from the list that has type "${energyType}" or "Colorless".
Do not output a final answer until this check passes.`
      : `You may use Pokémon of any type.`;

    return `You are an expert Pokémon TCG Pocket deck builder. Your job is to select exactly 20 cards from the player's collection to form the best possible deck.

RULES:
- You MUST only use cards from the list below — no cards outside this list
- The deck must contain exactly 20 cards total
- Maximum 2 copies of any single card
- Include at least 2 Basic Pokémon so the player can always start a game
- If you include a Stage 1 or Stage 2 Pokémon, you MUST also include its Basic pre-evolution from the list
- Energy cards do NOT count toward Pokémon or Trainer limits — include only what's needed to power attacks

${energyConstraintBlock}

PLAYSTYLE: ${playstyleInstruction}

PLAYER'S COLLECTION:
${cardLines}

Respond with ONLY a raw JSON array of exactly 20 objects, each with a single "id" field matching the card's id shown above. No explanation, no markdown, no extra text.
Example format: [{"id":"A1-006"},{"id":"A1-006"},{"id":"A1-001"},{"id":"A1-001"},{"id":"A1-057"},{"id":"A1-057"},{"id":"A1-128"},{"id":"A1-128"},{"id":"A1-131"},{"id":"A1-131"},{"id":"A1-132"},{"id":"A1-132"},{"id":"A1-133"},{"id":"A1-133"},{"id":"A1-134"},{"id":"A1-134"},{"id":"A1-135"},{"id":"A1-135"},{"id":"A1-136"},{"id":"A1-136"}]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-RESPONSE ENERGY TYPE ENFORCER v2
// Three-pass smart enforcement:
//   Pass 1 — Protect evolution lines (never orphan a stage)
//   Pass 2 — Score synergy via effect/ability text keyword overlap
//   Pass 3 — Support card fallback when no Pokémon match synergy
// ─────────────────────────────────────────────────────────────────────────────
function enforceEnergyTypeConstraint(deckIds, allowedEnergyType, ownedCards) {
    if (!allowedEnergyType || allowedEnergyType === 'Any') return deckIds;

    const allCards = window.TCGP_CARDS || [];
    const allowed = new Set([allowedEnergyType, 'Colorless']);

    // ── Helpers ───────────────────────────────────────────────────────────────

    function resolveCard(id) {
        return allCards.find(c => c.id === id) || null;
    }

    // Build a name→ids map for fast evolution chain lookup
    function buildNameMap(ids) {
        const map = {};
        ids.forEach(item => {
            const c = resolveCard(item.id);
            if (c) {
                const key = (c.name || '').toLowerCase();
                if (!map[key]) map[key] = [];
                map[key].push(item.id);
            }
        });
        return map;
    }

    // Check if removing a card would orphan another card in the deck
    // e.g. removing Charmeleon when Charizard is still in = orphan
    function wouldOrphan(candidateId, currentIds) {
        const card = resolveCard(candidateId);
        if (!card || !card.name) return false;
        const candidateName = card.name.toLowerCase();

        return currentIds.some(item => {
            if (item.id === candidateId) return false;
            const other = resolveCard(item.id);
            if (!other || other.category !== 'Pokemon') return false;
            // If another card evolves FROM this one → orphan risk
            const evolvesFrom = (other.evolvesFrom || '').toLowerCase();
            if (evolvesFrom === candidateName) return true;
            // If this card evolves FROM another in the deck → that's fine, not an orphan
            return false;
        });
    }

    // Check if the candidate card itself would be stranded (no pre-evolution present)
    function isStranded(candidateId, currentIds) {
        const card = resolveCard(candidateId);
        if (!card || !card.evolvesFrom) return false;
        const prevoName = (card.evolvesFrom || '').toLowerCase();
        return !currentIds.some(item => {
            const other = resolveCard(item.id);
            return other && (other.name || '').toLowerCase() === prevoName;
        });
    }

    // Score synergy: how many keywords from the deck's existing cards appear
    // in this candidate's effect/ability text
    function synergyScore(candidate, currentIds) {
        const candidateText = [
            candidate.effect || '',
            ...(candidate.abilities || []).map(a => a.text || ''),
            ...(candidate.attacks || []).map(a => a.text || '')
        ].join(' ').toLowerCase();

        if (!candidateText) return 0;
        let score = 0;

        currentIds.forEach(item => {
            const c = resolveCard(item.id);
            if (!c || c.id === candidate.id) return;

            // Name match — strongest signal
            const name = (c.name || '').replace(/ ex$/i, '').toLowerCase();
            if (name.length > 3 && candidateText.includes(name)) score += 3;

            // Ability/attack keyword overlap
            const texts = [
                ...(c.abilities || []).map(a => (a.name || '').toLowerCase()),
                ...(c.attacks || []).map(a => (a.name || '').toLowerCase())
            ];
            texts.forEach(kw => {
                if (kw.length > 4 && candidateText.includes(kw)) score += 1;
            });
        });

        return score;
    }

    // ── Pre-check: is the deck already compliant? ─────────────────────────────

    const energyTypesInDeck = new Set();
    deckIds.forEach(item => {
        const card = resolveCard(item.id);
        if (card && card.category === 'Pokemon' && card.type) {
            energyTypesInDeck.add(card.type);
        }
    });

    const nonColorlessTypes = [...energyTypesInDeck].filter(t => t !== 'Colorless');
    if (nonColorlessTypes.length <= 1 && nonColorlessTypes.every(t => allowed.has(t))) {
        return deckIds; // Already compliant — do nothing
    }

    console.warn(`[EnergyGuard] Deck has energy types: ${[...energyTypesInDeck].join(', ')}. Enforcing ${allowedEnergyType} + Colorless only.`);

    // ── Build copy counts ─────────────────────────────────────────────────────

    function getCounts(ids) {
        const counts = {};
        ids.forEach(item => { counts[item.id] = (counts[item.id] || 0) + 1; });
        return counts;
    }

    // ── Main replacement loop ─────────────────────────────────────────────────

    const result = [...deckIds];

    for (let i = 0; i < result.length; i++) {
        const card = resolveCard(result[i].id);
        if (!card || card.category !== 'Pokemon') continue;
        if (allowed.has(card.type)) continue; // This card is fine

        // ── PASS 1: Evolution line protection ─────────────────────────────────
        // If removing this card would orphan another, try to remove the orphan
        // instead — but don't cascade; just skip this slot with a warning.
        if (wouldOrphan(result[i].id, result.map(x => x))) {
            console.warn(`[EnergyGuard] Skipping swap of ${card.name} — would orphan evolution partner. Consider manual review.`);
            continue;
        }

        // ── PASS 2: Find best synergy Pokémon replacement ─────────────────────
        const currentCounts = getCounts(result);
        const currentIds = result.map(x => x);

        const pokemonCandidates = ownedCards
            .filter(c => {
                if (c.category !== 'Pokemon') return false;
                if (!allowed.has(c.type)) return false;
                if ((currentCounts[c.id] || 0) >= 2) return false; // Already at 2-copy cap
                if (isStranded(c.id, currentIds)) return false; // Pre-evo not in deck
                return true;
            })
            .map(c => ({ card: c, score: synergyScore(c, currentIds) }))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score; // Higher synergy first
                return (b.card.hp || 0) - (a.card.hp || 0); // Tiebreak: higher HP
            });

        if (pokemonCandidates.length > 0 && pokemonCandidates[0].score > 0) {
            const best = pokemonCandidates[0].card;
            console.log(`[EnergyGuard] Swapped ${card.name} (${card.type}) → ${best.name} (${best.type}) [synergy: ${pokemonCandidates[0].score}]`);
            result[i] = { id: best.id };
            continue;
        }

        // ── PASS 3: Synergy fallback — add a support Trainer instead ──────────
        // No good Pokémon match found; try a high-value Supporter/Trainer
        const supportCandidates = ownedCards
            .filter(c => {
                if (c.category !== 'Trainer') return false;
                if ((currentCounts[c.id] || 0) >= 2) return false;
                return true;
            })
            .map(c => ({ card: c, score: synergyScore(c, currentIds) }))
            .sort((a, b) => b.score - a.score);

        if (supportCandidates.length > 0) {
            const best = supportCandidates[0].card;
            console.log(`[EnergyGuard] No Pokémon synergy match — added Trainer ${best.name} [synergy: ${supportCandidates[0].score}] in place of ${card.name}`);
            result[i] = { id: best.id };
        } else {
            // Absolute fallback: best HP valid Pokémon regardless of synergy
            const fallback = pokemonCandidates[0];
            if (fallback) {
                console.warn(`[EnergyGuard] Zero-synergy fallback: ${card.name} → ${fallback.card.name}`);
                result[i] = { id: fallback.card.id };
            } else {
                console.error(`[EnergyGuard] No valid replacement at all for ${card.name} — leaving in deck.`);
            }
        }
    }

    return result;
}
