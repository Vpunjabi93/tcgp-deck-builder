let SYNERGY_TAGS = {};
// strategy.js - Deck Analyzer and Synergy Suggester

document.addEventListener('DOMContentLoaded', () => {
    loadSynergyTags();
    // We bind the "Check Strategy" button from app.js Deck Builder
    document.getElementById('btn-analyze-deck').addEventListener('click', analyzeCurrentDeck);
});

function analyzeCurrentDeck() {
    // currentDeck is global from app.js
    if (!currentDeck || currentDeck.length === 0) {
        alert("Add some cards to your deck first!");
        return;
    }

    const report = generateStrategyReport(currentDeck);
    showStrategyModal(report);
}

function generateStrategyReport(deck) {
    let score = 100;
    const feedback = [];
    const missing = [];
    
    // 1. Basic Counts & Consistency
    const basics = deck.filter(c => c.stage === 'Basic');
    const evolutions = deck.filter(c => c.stage === 'Stage 1' || c.stage === 'Stage 2');
    const supporters = deck.filter(c => c.type === 'Supporter');
    const items = deck.filter(c => c.type === 'Item');

    if (basics.length < 4) {
        score -= 15;
        feedback.push("⚠️ Too few Basic Pokémon. You have a high chance to 'brick' (mulligan) on opening hands.");
    } else if (basics.length > 10) {
        score -= 5;
        feedback.push("ℹ️ A lot of Basic Pokémon. Make sure you have enough draw power to find your key attackers.");
    }

    if (supporters.length < 2) {
        score -= 10;
        feedback.push("⚠️ Low Supporter count. Consider adding Professor's Research or Sabrina for consistency.");
        missing.push("Professor's Research");
    }

    // 2. Archetype Detection — dynamic, works for any deck
    const TYPE_EMOJI = {
        'Fire': '🔥', 'Water': '💧', 'Grass': '🌿', 'Lightning': '⚡',
        'Psychic': '👁️', 'Fighting': '👊', 'Darkness': '🌑',
        'Metal': '⚙️', 'Dragon': '🐉', 'Colorless': '⭐'
    };

    // Find the highest-HP EX or Stage 2 as the win condition
    const winCon = deck
        .filter(c => c.name?.toLowerCase().includes(' ex') || c.stage === 'Stage 2')
        .sort((a, b) => (parseInt(b.hp) || 0) - (parseInt(a.hp) || 0))[0];

    // Find dominant Pokémon type (exclude Supporter/Item)
    const typeCounts = {};
    deck.forEach(c => {
        if (c.type && c.type !== 'Supporter' && c.type !== 'Item') {
            typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
        }
    });
    const dominantType = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Colorless';

    const emoji = TYPE_EMOJI[dominantType] || '🃏';

    let archetype;
    if (winCon) {
        const winName = winCon.name.replace(/ ex$/i, ' EX');
        const style = supporters.length >= 3 ? 'Control' : basics.length >= 8 ? 'Swarm' : 'Aggro';
        archetype = `${emoji} ${winName} ${style}`;
    } else {
        archetype = `${emoji} ${dominantType} Basics Rush`;
    }

    const hasCharizard = deck.some(c => c.name === 'Charizard EX');
    const hasMewtwo = deck.some(c => c.name === 'Mewtwo EX');
    const hasPikachu = deck.some(c => c.name === 'Pikachu EX');
    const hasArticuno = deck.some(c => c.name === 'Articuno EX');

    // 3. Trainer Synergy Checks
    const hasBlaine = deck.some(c => c.name === 'Blaine');
    const hasKoga = deck.some(c => c.name === 'Koga');
    const hasErika = deck.some(c => c.name === 'Erika');
    const hasBrock = deck.some(c => c.name === 'Brock');

    // Blaine Needs Ninetales, Magmar, or Rapidash
    if (hasBlaine) {
        const blaineTargets = deck.some(c => ['Ninetales', 'Magmar', 'Rapidash'].includes(c.name));
        if (!blaineTargets) {
            score -= 10;
            feedback.push("❌ Anti-Synergy: You have Blaine but no Ninetales, Magmar, or Rapidash for him to buff.");
        } else {
            feedback.push("✅ Synergy: Good use of Blaine with compatible Fire Pokémon.");
            score += 5;
        }
    }

    // Koga Needs Grimer or Weezing
    if (hasKoga) {
        const kogaTargets = deck.some(c => ['Grimer', 'Weezing'].includes(c.name));
        if (!kogaTargets) {
            score -= 10;
            feedback.push("❌ Anti-Synergy: You have Koga but no Grimer/Weezing to return to hand.");
        }
    }
    
    // Brock needs Golem/Onix etc.
    if(hasBrock) {
        const brockTargets = deck.some(c => ['Onix', 'Golem', 'Geodude', 'Graveler'].includes(c.name));
        if(!brockTargets) {
            score -= 10;
            feedback.push("❌ Anti-Synergy: Brock requires Rock/Ground types from Brock's gym.");
        }
    }

    // 4. Non-Trainer Synergy (Pokemon to Pokemon)
    const hasGardevoir = deck.some(c => c.name === 'Gardevoir');
    if (hasMewtwo && !hasGardevoir) {
        missing.push("Gardevoir (for Psy Shadow Energy acceleration)");
    } else if (hasMewtwo && hasGardevoir) {
        score += 15;
        feedback.push("✅ Synergy: Gardevoir's Psy Shadow is perfectly powering up Mewtwo EX.");
    }

    const hasPidgeot = deck.some(c => c.name === 'Pidgeot');
    if (hasPidgeot) {
        feedback.push("✅ Synergy: Pidgeot's Drive Off provides excellent control.");
    }

    // 5. General Type Checks for Erika/Misty
    const grassCount = deck.filter(c => c.type === 'Grass').length;
    if (hasErika && grassCount === 0) {
        score -= 10;
        feedback.push("❌ Anti-Synergy: Erika only heals Grass Pokémon, but you don't have any.");
    }
    
    const waterCount = deck.filter(c => c.type === 'Water').length;
    const hasMisty = deck.some(c => c.name === 'Misty');
    if(waterCount > 0 && !hasMisty) {
        feedback.push("💡 Suggestion: You have Water Pokémon. Misty provides massive energy acceleration.");
        missing.push("Misty");
    }

    // 6. Fallback feedback — always show something useful
    if (feedback.length === 0) {
        if (basics.length >= 4 && supporters.length >= 2) {
            feedback.push(`✅ Solid structure: ${basics.length} Basics and ${supporters.length} Supporters — good consistency foundation.`);
        }
        if (evolutions.length > 0) {
            feedback.push(`📈 Evolution lines detected (${evolutions.length} cards). Ensure all Basics are included for smooth setup.`);
        }
        if (items.length >= 2) {
            feedback.push(`🎒 ${items.length} Item cards give you good turn flexibility.`);
        }
        if (winCon) {
            feedback.push(`⚔️ Win condition: ${winCon.name} (${winCon.hp} HP) — build energy acceleration around it.`);
        }
        if (feedback.length === 0) {
            feedback.push(`🃏 Deck is built. Run a simulation or battle test to evaluate performance.`);
        }
    }

    // Normalize score
    if (score > 100) score = 100;
    if (score < 0) score = 0;

    return {
        archetype,
        score,
        feedback,
        missing: [...new Set(missing)] // unique
    };
}

function showStrategyModal(report) {
    // Check if modal exists, if not inject it
    let modal = document.getElementById('modal-strategy');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-strategy';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px">
                <h2>Strategy Analysis</h2>
                
                <div style="margin: 16px 0; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.8rem; color:var(--text-muted)">Detected Archetype</div>
                        <strong id="strat-archetype" style="color:var(--accent-gold); font-size:1.1rem;"></strong>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:0.8rem; color:var(--text-muted)">Synergy Score</div>
                        <strong id="strat-score" style="font-size:1.5rem;"></strong><span style="font-size:1rem">/100</span>
                    </div>
                </div>

                <div style="background:var(--bg-dark); padding:12px; border-radius:8px; margin-bottom:16px;">
                    <h4 style="margin-bottom:8px">Feedback</h4>
                    <ul id="strat-feedback" style="list-style:none; padding:0; font-size:0.9rem; margin:0; display:flex; flex-direction:column; gap:8px;"></ul>
                </div>

                <div id="strat-missing-container" style="background:var(--bg-dark); padding:12px; border-radius:8px; margin-bottom:24px;">
                    <h4 style="margin-bottom:8px">Recommended Additions</h4>
                    <ul id="strat-missing" style="padding-left:20px; font-size:0.9rem; margin:0; color:var(--accent-hover);"></ul>
                </div>

                <div class="modal-actions" style="justify-content: flex-end;">
                    <button class="btn-primary" onclick="document.getElementById('modal-strategy').classList.add('hidden')">Close Analysis</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate data
    document.getElementById('strat-archetype').innerText = report.archetype;
    
    const scoreEl = document.getElementById('strat-score');
    scoreEl.innerText = report.score;
    if(report.score >= 80) scoreEl.style.color = '#78c850';
    else if(report.score >= 50) scoreEl.style.color = '#f5c518';
    else scoreEl.style.color = '#ff4444';

    const fbList = document.getElementById('strat-feedback');
    fbList.innerHTML = report.feedback.map(f => `<li style="margin-bottom:8px">${f}</li>`).join('');

    const missList = document.getElementById('strat-missing');
    const missContainer = document.getElementById('strat-missing-container');
    if (report.missing && report.missing.length > 0) {
        missContainer.style.display = 'block';
        missList.innerHTML = report.missing.map(m => `<li>${m}</li>`).join('');
    } else {
        missContainer.style.display = 'none';
    }

    modal.classList.remove('hidden');
}

// --- Opponent Deck Prediction ---
let cachedMetaDecks = null;

/**
 * Predicts the opponent's deck based on revealed cards
 * @param {string[]} revealedCards - Array of card names the opponent has played/revealed
 * @returns {Promise<Array>} Top 2 most likely deck matches with confidence and warnings
 */
async function predictOpponentDeck(revealedCards) {
    if (revealedCards && revealedCards.length < 4) {
        let arr = [];
        arr.statusMessage = 'Analyzing patterns (2 rounds required)...';
        return arr;
    }

    if (!cachedMetaDecks) {
        try {
            const res = await fetch('data/meta_decks.json');
            cachedMetaDecks = await res.json();
        } catch (e) {
            console.error("Failed to load meta decks:", e);
            return [];
        }
    }

    if (!revealedCards || revealedCards.length === 0) return [];

    const predictions = cachedMetaDecks.map(deck => {
        let matchCount = 0;
        let keyMatchCount = 0;

        revealedCards.forEach(cardName => {
            if (deck.fullList.includes(cardName)) matchCount++;
            if (deck.keyCards.includes(cardName)) keyMatchCount += 2; // Key cards are weighted more
        });

        // Calculate confidence
        // Max possible score for the revealed cards if they were a perfect match
        const maxPossibleScore = revealedCards.length + (revealedCards.filter(c => deck.keyCards.includes(c)).length * 2);
        
        // Base score off how many revealed cards actually matched this deck
        const actualScore = matchCount + keyMatchCount;
        
        let confidenceScore = 0;
        if (maxPossibleScore > 0) {
            confidenceScore = Math.round((actualScore / maxPossibleScore) * 100);
        }

        // Require at least 1 key card match for high confidence
        // Prevents generic cards (Potion, Poké Ball) from triggering 100% confidence
        if (keyMatchCount === 0 && confidenceScore > 40) {
            confidenceScore = Math.min(confidenceScore, 40);
        }

        // Cap early certainty on small sample sizes
        if (revealedCards.length < 3) {
            confidenceScore = Math.min(confidenceScore, 60 + (revealedCards.length * 10));
        }

        return {
            deckName: deck.deckName,
            archetype: deck.archetype,
            confidenceScore: confidenceScore,
            threatWarning: deck.threatWarning,
            keyCards: deck.keyCards
        };
    });

    // Sort by confidence descending
    predictions.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // Return Top 2
    return predictions.slice(0, 2);
}

// --- Playstyle Recommender ---

function inferCardRole(card) {
    if (!card) return 'Tech';
    const name = (card.name || '').toLowerCase();
    const stage = card.stage || '';
    const type = card.type || '';

    if (type === 'Supporter') return 'Supporter';
    if (type === 'Item') return 'Item';
    if (name.includes(' ex') && stage === 'Basic') return 'Main Attacker';
    if (stage === 'Stage 2') return 'Main Attacker';
    if (stage === 'Stage 1') return 'Secondary';
    if (stage === 'Basic') return 'Setup';
    return 'Tech';
}

function getRarityScore(rarity) {
    if (!rarity) return 0;
    if (rarity.includes('☆☆☆') || rarity.includes('👑')) return 6;
    if (rarity.includes('☆☆')) return 5;
    if (rarity.includes('☆')) return 4;
    if (rarity.includes('💎💎💎')) return 3;
    if (rarity.includes('💎💎')) return 2;
    if (rarity.includes('💎')) return 1;
    return 0;
}

async function loadSynergyTags() {
    try {
        const res = await fetch('data/synergy_tags.json');
        SYNERGY_TAGS = await res.json();
    } catch(e) {
        console.warn('synergy_tags.json failed to load. Synergy scoring disabled.');
        SYNERGY_TAGS = {};
    }
}

function getSynergyScore(card, collectionContext) {
    const synergyData = SYNERGY_TAGS[card.name];
    if (!synergyData) return 0;

    const context = collectionContext || [];
    const tags = synergyData.tags || [];
    let score = synergyData.bonus || 0;

    if (tags.includes('energy_accel_passive') || tags.includes('energy_accel_attack')) {
        const hasHeavyAttacker = context.some(c =>
            c.name?.toLowerCase().includes(' ex') || c.stage === 'Stage 2'
        );
        if (!hasHeavyAttacker) score = Math.floor(score * 0.3);
    }

    if (tags.includes('draw_passive')) {
        const supporterCount = context.filter(c => c.type === 'Supporter').length;
        if (supporterCount >= 4) score = Math.floor(score * 0.5);
    }

    if (tags.includes('damage_boost_trainer') ||
        tags.includes('energy_accel_trainer') ||
        tags.includes('heal_trainer') ||
        tags.includes('disruption_trainer')) {
        const targets = synergyData.targets || [];
        const hasTarget = targets.some(t =>
            context.some(c => c.name === t || c.type === t)
        );
        if (!hasTarget) return 0;
    }

    return score;
}

function scorePokemon(card, collectionContext) {
    if (!card) return 0;
    if (card.type === 'Supporter' || card.type === 'Item') {
        return getSynergyScore(card, collectionContext || []);
    }

    const hp = parseInt(card.hp) || 0;
    const retreat = parseInt(card.retreatCost) || 0;
    const isEX = card.name?.toLowerCase().includes(' ex');

    const bulkScore = hp / 10;

    const stageMultipliers = {
        'Basic':   isEX ? 2.2 : 1.0,
        'Stage 1': isEX ? 2.5 : 1.6,
        'Stage 2': isEX ? 3.0 : 2.2
    };
    const stageMultiplier = stageMultipliers[card.stage] || 1.0;

    const retreatPenalty = retreat * 2;
    const rarityBonus = (typeof getRarityScore === 'function')
        ? getRarityScore(card.rarity) * 3 : 0;
    const synergyBonus = getSynergyScore(card, collectionContext || []);

    return (bulkScore * stageMultiplier) + rarityBonus - retreatPenalty + synergyBonus;
}

/**
 * Recommends Top 2 meta decks based on chosen playstyle and current user collection.
 * @param {string} playstyle - "Aggro", "Control", "Balanced", or "Any"
 * @returns {Promise<Array>} Recommended decks with missing cards analysis
 */
async function recommendDecks(playstyle) {
    if (!cachedMetaDecks) {
        try {
            const res = await fetch('data/meta_decks.json');
            cachedMetaDecks = await res.json();
        } catch (e) {
            console.error("Failed to load meta decks:", e);
            return [];
        }
    }

    let candidates = cachedMetaDecks;
    if (playstyle && playstyle !== 'Any') {
        candidates = candidates.filter(d => d.playstyle === playstyle);
    }

    // Load user collection
    const collectionData = localStorage.getItem('tcgp_collection');
    const myCollection = collectionData ? JSON.parse(collectionData) : {};
    
    // Also load TCGP_CARDS to resolve names to IDs since meta_decks uses names
    // (Assuming window.TCGP_CARDS is populated)
    const allCards = window.TCGP_CARDS || [];

    const recommendations = candidates.map(deck => {
        let missingCards = [];
        let ownedCount = 0;
        
        // Tally up what they need vs what they have
        // Deck fullList is an array of card names (potentially with duplicates)
        // We need to count required quantities
        const required = {};
        deck.fullList.forEach(name => {
            required[name] = (required[name] || 0) + 1;
        });

        for (const [cardName, reqQty] of Object.entries(required)) {
            // Find all variations of this card name in the DB to check ownership across sets
            const cardVariations = allCards.filter(c =>
            c.name.toLowerCase() === cardName.toLowerCase()
        );
            let totalOwnedOfThisCard = 0;
            
            cardVariations.forEach(v => {
                if (myCollection[v.id]) {
                    totalOwnedOfThisCard += myCollection[v.id];
                }
            });

            // Calculate deficit
            ownedCount += Math.min(totalOwnedOfThisCard, reqQty);
            const deficit = reqQty - totalOwnedOfThisCard;
            
            if (deficit > 0) {
                // Determine Next Best Substitution
                const metaRoleData = deck.cardRoles && deck.cardRoles[cardName];
                const targetRole = metaRoleData ? metaRoleData.role : 'Tech'; // Default
                const targetType = cardVariations.length > 0 ? cardVariations[0].type : null;
                
                // Find substitute in collection
                let bestSub = null;
                const availableSubs = [];
                for (const availableId of Object.keys(myCollection)) {
                    if (myCollection[availableId] > 0) {
                        const availCard = allCards.find(c => c.id === availableId);
                        if (availCard && availCard.name !== cardName && 
                           (targetType === 'Supporter' || targetType === 'Item' || availCard.type === targetType)) {
                               const role = inferCardRole(availCard);
                               if (role === targetRole || (role === 'Secondary' && targetRole.includes('Secondary'))) {
                                   availableSubs.push(availCard);
                               }
                        }
                    }
                }
                
                if (availableSubs.length > 0) {
                     // Sort by rarity and HP descending
                     availableSubs.sort((a,b) => {
                         const rarityDiff = getRarityScore(b.rarity) - getRarityScore(a.rarity);
                         if (rarityDiff !== 0) return rarityDiff;
                         return (parseInt(b.hp) || 0) - (parseInt(a.hp) || 0);
                     });
                     bestSub = availableSubs[0];
                }

                if (bestSub) {
                    missingCards.push(`${deficit}x ${cardName} <br><span style="color:var(--text-muted); font-size:0.8rem;">↳ Sub: <span style="color:var(--accent-gold)">${bestSub.name}</span></span>`);
                } else {
                    missingCards.push(`${deficit}x ${cardName}`);
                }
            }
        }

        const completionPct = Math.round((ownedCount / deck.fullList.length) * 100);

        return {
            deckName: deck.deckName,
            archetype: deck.archetype,
            completionPct: completionPct,
            missingCards: missingCards
        };
    });

    // Sort by most complete first
    recommendations.sort((a, b) => b.completionPct - a.completionPct);

    // Return top 2
    return recommendations.slice(0, 2);
}

const BASICS_MAP = {
    "Ivysaur": "Bulbasaur", "Venusaur": "Bulbasaur",
    "Charmeleon": "Charmander", "Charizard": "Charmander",
    "Wartortle": "Squirtle", "Blastoise": "Squirtle",
    "Metapod": "Caterpie", "Butterfree": "Caterpie",
    "Kakuna": "Weedle", "Beedrill": "Weedle",
    "Pidgeotto": "Pidgey", "Pidgeot": "Pidgey",
    "Raticate": "Rattata", "Fearow": "Spearow",
    "Arbok": "Ekans", "Raichu": "Pikachu",
    "Sandslash": "Sandshrew", "Nidorina": "Nidoran♀", "Nidoqueen": "Nidoran♀",
    "Nidorino": "Nidoran♂", "Nidoking": "Nidoran♂",
    "Clefable": "Clefairy", "Ninetales": "Vulpix",
    "Wigglytuff": "Jigglypuff", "Golbat": "Zubat",
    "Gloom": "Oddish", "Vileplume": "Oddish", "Bellossom": "Oddish",
    "Parasect": "Paras", "Venomoth": "Venonat", "Dugtrio": "Diglett",
    "Persian": "Meowth", "Golduck": "Psyduck", "Primeape": "Mankey",
    "Arcanine": "Growlithe", "Poliwhirl": "Poliwag", "Poliwrath": "Poliwag",
    "Kadabra": "Abra", "Alakazam": "Abra", "Machoke": "Machop", "Machamp": "Machop",
    "Weepinbell": "Bellsprout", "Victreebel": "Bellsprout",
    "Tentacruel": "Tentacool", "Graveler": "Geodude", "Golem": "Geodude",
    "Rapidash": "Ponyta", "Slowbro": "Slowpoke", "Magneton": "Magnemite",
    "Dodrio": "Doduo", "Dewgong": "Seel", "Muk": "Grimer",
    "Cloyster": "Shellder", "Haunter": "Gastly", "Gengar": "Gastly",
    "Hypno": "Drowzee", "Kingler": "Krabby", "Electrode": "Voltorb",
    "Exeggutor": "Exeggcute", "Marowak": "Cubone", "Weezing": "Koffing",
    "Rhydon": "Rhyhorn", "Rhyperior": "Rhyhorn", "Seadra": "Horsea",
    "Seaking": "Goldeen", "Starmie": "Staryu", "Gyarados": "Magikarp",
    "Vaporeon": "Eevee", "Jolteon": "Eevee", "Flareon": "Eevee",
    "Omastar": "Omanyte", "Kabutops": "Kabuto", "Dragonair": "Dratini", "Dragonite": "Dratini",
    "Melmetal": "Meltan", "Bisharp": "Pawniard",
    "Swoobat": "Woobat", "Golurk": "Golett", 
    "Mienshao": "Mienfoo", "Grapploct": "Clobbopus", "Salazzle": "Salandit",
    "Centiskorch": "Sizzlipede", "Frosmoth": "Snom", "Whimsicott": "Cottonee",
    "Lilligant": "Petilil", "Gogoat": "Skiddo", "Kirlia": "Ralts", "Gardevoir": "Ralts",
    "Piloswine": "Swinub", "Mamoswine": "Swinub", "Prinplup": "Piplup", "Empoleon": "Piplup",
    "Luxio": "Shinx", "Luxray": "Shinx", "Gabite": "Gible", "Garchomp": "Gible"
};

function getBasicForm(cardName) {
    if(!cardName) return null;
    let clean = cardName.replace(/ ex$/i, '');
    return BASICS_MAP[clean] || null;
}

window.validateAndApplyAIDeck = function(aiNamesArray) {
    const normName = (n) => (n || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!aiNamesArray || !Array.isArray(aiNamesArray) || aiNamesArray.length === 0) {
        if (typeof window.showToast === 'function') {
            window.showToast('AI could not generate a deck. Try a different playstyle.', 'error');
        }
        return;
    }
    console.log("Original AI Suggestion:", aiNamesArray);

    const allCards = window.TCGP_CARDS || [];
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    let tempInventory = { ...myCollection };

    let myCollectionForResolver = JSON.parse(
        localStorage.getItem('tcgp_collection') || '{}'
    );
    let resolvedCards = [];
    aiNamesArray.forEach(name => {
        const nameLower = name.toLowerCase();
        const allMatches = allCards.filter(
            c => c.name.toLowerCase() === nameLower
        );
        if (allMatches.length === 0) return;
        // Prefer the version the user actually owns
        const ownedMatch = allMatches.find(
            c => (myCollectionForResolver[c.id] || 0) > 0
        );
        resolvedCards.push(ownedMatch || allMatches[0]);
    });

    // GUARDRAIL 2 — Proactive evolution cascade: resolve full chain before adding any card
    let validatedDeck = [];

    // Helper: find a card by normalized name from inventory
    function pickFromInventory(nameToFind) {
        const normalized = normName(nameToFind);
        const match = allCards.find(c =>
            normName(c.name) === normalized && (tempInventory[c.id] || 0) > 0
        );
        if (match) {
            tempInventory[match.id] = Math.max(0, (tempInventory[match.id] || 0) - 1);
            return match;
        }
        return null;
    }

    // Helper: get the Stage 1 that evolves from a given Basic name
    function getStage1ForBasic(basicName) {
        return Object.keys(window.BASICS_MAP || {}).find(s1 =>
            normName(window.BASICS_MAP[s1]) === normName(basicName)
        ) || null;
    }

    // Helper: get required Basic for any evolution card
    function getBasicFor(cardName) {
        const clean = normName(cardName).replace(/\s*ex$/, '').trim();
        const key = Object.keys(window.BASICS_MAP || {}).find(k => normName(k) === clean);
        return key ? window.BASICS_MAP[key] : null;
    }

    resolvedCards.forEach(card => {
        if (!card) return;
        const countInDeck = validatedDeck.filter(c => normName(c.name) === normName(card.name)).length;
        if (countInDeck >= 2) return; // 2-copy cap
        if ((tempInventory[card.id] || 0) <= 0) return; // not in inventory

        // --- PROACTIVE CASCADE ---
        // If this card is a Stage 2: ensure Basic + Stage 1 are in deck first
        if (card.stage === 'Stage 2') {
            const requiredBasic = getBasicFor(card.name);
            const requiredStage1 = requiredBasic ? getStage1ForBasic(requiredBasic) : null;

            // Add Basic if not already in deck
            if (requiredBasic && !validatedDeck.some(c => normName(c.name) === normName(requiredBasic))) {
                const basicCard = pickFromInventory(requiredBasic);
                if (!basicCard) return; // can't build line without Basic — skip entire card
                validatedDeck.push(basicCard);
            }

            // Add Stage 1 if not already in deck
            if (requiredStage1 && !validatedDeck.some(c => normName(c.name) === normName(requiredStage1))) {
                const stage1Card = pickFromInventory(requiredStage1);
                if (!stage1Card) return; // can't build line without Stage 1 — skip entire card
                validatedDeck.push(stage1Card);
            }
        }

        // If this card is a Stage 1: ensure Basic is in deck first
        if (card.stage === 'Stage 1') {
            const requiredBasic = getBasicFor(card.name);
            if (requiredBasic && !validatedDeck.some(c => normName(c.name) === normName(requiredBasic))) {
                const basicCard = pickFromInventory(requiredBasic);
                if (!basicCard) return; // can't build line without Basic — skip Stage 1
                validatedDeck.push(basicCard);
            }
        }

        // Now add the card itself
        tempInventory[card.id] = Math.max(0, (tempInventory[card.id] || 0) - 1);
        validatedDeck.push(card);
    });

    // GUARDRAIL 3 — Strip incompatible Gym Leader Trainers
    const BROCK_TARGETS = ['Onix', 'Golem', 'Geodude', 'Graveler', 'Rhyhorn', 'Rhydon'];
    const TRAINER_TYPE_MAP = {
        'Misty':     { type: 'Water' },
        'Blaine':    { type: 'Fire' },
        'Erika':     { type: 'Grass' },
        'Koga':      { type: 'Poison' },
        'Lt. Surge': { type: 'Lightning' }
    };

    validatedDeck = validatedDeck.filter(card => {
        if (card.name === 'Brock') {
            return validatedDeck.some(c => BROCK_TARGETS.includes(c.name));
        }
        const trainerRule = TRAINER_TYPE_MAP[card.name];
        if (trainerRule) {
            return validatedDeck.some(c => c.type === trainerRule.type);
        }
        return true;
    });

    // GUARDRAIL 3b — Full evolution chain enforcement: Basic → Stage 1 → Stage 2
    // Step A: Build a reverse lookup: cardName → its required Basic
    // Step B: For every Stage 2 in deck, ensure Stage 1 AND Basic both exist
    // Step C: For every Stage 1 in deck, ensure Basic exists
    // Step D: If any link is missing, try to add it from collection, else strip the whole line

    const allCards_g3b = window.TCGP_CARDS || [];

    // Helper: given any card name, find its Basic form via BASICS_MAP
    function getRequiredBasic(cardName) {
        const clean = (cardName || '').replace(/ ex$/i, '').trim();
        return (window.BASICS_MAP && window.BASICS_MAP[clean]) || null;
    }

    // Helper: given a Basic name, find the Stage 1 that evolves FROM it
    function getStage1For(basicName) {
        return Object.keys(window.BASICS_MAP || {}).find(s1 =>
            window.BASICS_MAP[s1] === basicName
        ) || null;
    }

    // Helper: try to add a card by name from tempInventory into validatedDeck
    function tryAddFromInventory(nameToFind) {
        const match = allCards_g3b.find(c =>
            c.name === nameToFind && (tempInventory[c.id] || 0) > 0
        );
        if (match && validatedDeck.filter(c => c.name === match.name).length < 2) {
            validatedDeck.push(match);
            tempInventory[match.id] = Math.max(0, (tempInventory[match.id] || 0) - 1);
            return true;
        }
        return false;
    }

    // Step 1: Collect all evolution cards in deck
    const stage2InDeck = validatedDeck.filter(c => c.stage === 'Stage 2');
    const stage1InDeck = () => validatedDeck.filter(c => c.stage === 'Stage 1'); // fn, re-evaluated after mutations

    // Step 2: For each Stage 2, enforce full Basic → Stage 1 → Stage 2 chain
    const linesToStrip = new Set(); // store Basic names of lines to fully remove

    stage2InDeck.forEach(s2Card => {
        const requiredBasic = getRequiredBasic(s2Card.name);
        if (!requiredBasic) return; // unknown line, leave alone

        const requiredStage1 = getStage1For(requiredBasic);

        // Check Stage 1 presence
        const hasStage1 = validatedDeck.some(c =>
            c.stage === 'Stage 1' && getRequiredBasic(c.name) === requiredBasic
        );
        // Check Basic presence
        const hasBasic = validatedDeck.some(c => c.name === requiredBasic);

        let stage1OK = hasStage1;
        let basicOK = hasBasic;

        // Try to add Stage 1 if missing
        if (!hasStage1 && requiredStage1) {
            stage1OK = tryAddFromInventory(requiredStage1);
            if (!stage1OK) {
                console.warn(`Stage 2 line stripped — Stage 1 missing and not in collection: ${requiredStage1}`);
                linesToStrip.add(requiredBasic);
                return;
            }
        }

        // Try to add Basic if missing
        if (!hasBasic) {
            basicOK = tryAddFromInventory(requiredBasic);
            if (!basicOK) {
                console.warn(`Stage 2 line stripped — Basic missing and not in collection: ${requiredBasic}`);
                linesToStrip.add(requiredBasic);
                return;
            }
        }
    });

    // Step 3: For each Stage 1, enforce Basic exists
    stage1InDeck().forEach(s1Card => {
        const requiredBasic = getRequiredBasic(s1Card.name);
        if (!requiredBasic) return;
        if (linesToStrip.has(requiredBasic)) return; // already being stripped

        const hasBasic = validatedDeck.some(c => c.name === requiredBasic);
        if (!hasBasic) {
            const added = tryAddFromInventory(requiredBasic);
            if (!added) {
                console.warn(`Stage 1 stripped — Basic missing and not in collection: ${requiredBasic}`);
                linesToStrip.add(requiredBasic);
            }
        }
    });

    // Step 4: Strip ALL cards belonging to broken lines
    if (linesToStrip.size > 0) {
        validatedDeck = validatedDeck.filter(card => {
            const basic = getRequiredBasic(card.name) || card.name;
            if (linesToStrip.has(basic)) {
                console.warn(`Stripped from broken line (${basic}): ${card.name}`);
                return false;
            }
            return true;
        });
    }

    // GUARDRAIL 4 — Safety Net: fill Basics first, then Trainers
    if (validatedDeck.length < 20) {
        const remaining = Object.keys(tempInventory)
            .map(id => ({ id, qty: tempInventory[id] }))
            .filter(item => item.qty > 0);

        remaining.sort((a, b) => {
            const cardA = (window.TCGP_CARDS || []).find(c => c.id === a.id);
            const cardB = (window.TCGP_CARDS || []).find(c => c.id === b.id);
            const scoreA = cardA ? scorePokemon(cardA, validatedDeck) : 0;
            const scoreB = cardB ? scorePokemon(cardB, validatedDeck) : 0;
            return scoreB - scoreA;
        });

        // Pass A — fill with Basic Pokémon first
        for (let item of remaining) {
            if (validatedDeck.length >= 20) break;
            const card = allCards.find(c => c.id === item.id);
            if (card && card.stage === 'Basic' && card.type !== 'Supporter' && card.type !== 'Item') {
                const countInDeck = validatedDeck.filter(c => c.name === card.name).length;
                if (countInDeck < 2) validatedDeck.push(card);
            }
        }

        // Pass B — fill remaining slots with Trainers (re-check compatibility)
        for (let item of remaining) {
            if (validatedDeck.length >= 20) break;
            const card = allCards.find(c => c.id === item.id);
            if (!card || (card.type !== 'Item' && card.type !== 'Supporter')) continue;

            // Re-apply Gym Leader Trainer compatibility before adding
            if (card.name === 'Brock' && !validatedDeck.some(c => BROCK_TARGETS.includes(c.name))) continue;
            const trainerRule = TRAINER_TYPE_MAP[card.name];
            if (trainerRule && !validatedDeck.some(c => c.type === trainerRule.type)) continue;

            const countInDeck = validatedDeck.filter(c => c.name === card.name).length;
            if (countInDeck < 2) validatedDeck.push(card);
        }
    }

    // GUARDRAIL 5 — Warn if deck is critically short
    if (validatedDeck.length < 15) {
        window.showToast(`Only ${validatedDeck.length} cards validated — try expanding your collection.`, 'error');
    }

    // Deploy
    window.currentDeck = validatedDeck;
    if (typeof window.renderDeckSlots === 'function') window.renderDeckSlots();
    if (typeof window.renderDeckBuilderSidebar === 'function') window.renderDeckBuilderSidebar();
    if (typeof window.showToast === 'function') {
        window.showToast('AI Strategy Validated & Applied \u2713', 'success');
    }

    const out = document.getElementById('recommender-output');
    if (out) {
        out.innerHTML = `<div style="background:var(--bg-dark); border:1px solid var(--accent-gold); padding:12px; border-radius:8px;">
            <p style="color:var(--accent-gold); margin-bottom:8px;">Deck Applied Successfully</p>
            <div style="font-size:0.9rem; color:var(--text-muted);">
                Inventory verified, 2-copy rule enforced, trainer compatibility checked.
                ${validatedDeck.length < 20
                    ? `Only ${validatedDeck.length} cards could be validated.`
                    : 'Full 20-card deck ready.'} Choose "Save Deck" when ready.
            </div>
        </div>`;
    }
};

// Export for module usage or browser env
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        analyzeCurrentDeck, generateStrategyReport, predictOpponentDeck, recommendDecks
    };
} else if (typeof window !== 'undefined') {
    window.predictOpponentDeck = predictOpponentDeck;
    window.recommendDecks = recommendDecks;
    window.scorePokemon = scorePokemon;
    window.BASICS_MAP = BASICS_MAP;
}
