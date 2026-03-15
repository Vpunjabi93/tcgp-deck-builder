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

window.cancelUpload = function() {
    pendingFiles = [];
    const uploadZone = document.getElementById('upload-zone');
    const previewContainer = document.getElementById('upload-preview-container') || document.getElementById('upload-preview-strip');
    uploadZone.classList.remove('hidden');
    if (previewContainer) previewContainer.classList.add('hidden');
    document.getElementById('video-upload').value = '';
};

window.confirmUpload = function() {
    if (pendingFiles.length === 0) return;
    const previewContainer = document.getElementById('upload-preview-container') || document.getElementById('upload-preview-strip');
    if (previewContainer) previewContainer.classList.add('hidden');
    processMediaWithGemini(pendingFiles);
};

// --- Core Gemini Scan ---
async function processMediaWithGemini(files) {
    const apiKey = sessionStorage.getItem('gemini_api_key');
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
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
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

        // Robust JSON extraction (handles markdown and text wrapping)
        const jsonMatch = responseText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("AI returned invalid data format. Try again.");
        const scannedCards = JSON.parse(jsonMatch[0]);

        statusText.innerText = `Preparing review...`;

        setTimeout(() => {
            statusPanel.classList.add('hidden');
            showReviewModalFromReverseScan(scannedData, targetSet);
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
    return `
    This is a set of ${fileCount} screenshot(s) of a Pokémon TCG Pocket card collection shown in "Edition View" — a grid organized by card number within a specific set.
    The user is trying to catalog set code "${targetSet}".
    
    Each slot has a card number. Cards that are MISSING (not owned) are greyed out, dimmed, or show a silhouette/lock. Cards that are OWNED are in full bright color.
    
    Your job: Look ONLY at the greyed-out / dimmed slots. List all the integer NUMBERS of the cards that are MISSING. Ignore the colored/owned ones.
    
    Return a strict JSON object with this exact property:
    - "missingNumbers": an array of integers representing the card numbers that are greyed out.
    
    Example: {"missingNumbers":[2, 4, 15, 66, 102]}
    No markdown, no extra text. Only the JSON object.
    `;
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

    document.getElementById('modal-review').querySelector('h2').innerText = `Adding ${totalCardsAdded} Cards`;
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

window.modifyReviewQty = function(cardId, change) {
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
    if (!name) return null;
    const lowerName = name.toLowerCase().trim()
        .replace(/\s*ex$/i, '') // Remove 'EX' for looser matching
        .replace(/[^a-z0-9]/g, ''); // Remove punctuation

    return TCGP_CARDS.find(c => {
        const dbName = c.name.toLowerCase().trim()
            .replace(/\s*ex$/i, '')
            .replace(/[^a-z0-9]/g, '');
        return dbName === lowerName || dbName.includes(lowerName) || lowerName.includes(dbName);
    });
}
