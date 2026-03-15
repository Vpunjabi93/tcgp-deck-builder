// strategy.js - Deck Analyzer and Synergy Suggester

document.addEventListener('DOMContentLoaded', () => {
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

    // 2. Archetype Detection
    let archetype = "Custom Rogue Deck";
    const hasCharizard = deck.some(c => c.name === 'Charizard EX');
    const hasMewtwo = deck.some(c => c.name === 'Mewtwo EX');
    const hasPikachu = deck.some(c => c.name === 'Pikachu EX');
    const hasArticuno = deck.some(c => c.name === 'Articuno EX');

    if (hasCharizard) archetype = "🔥 Charizard EX Aggro";
    else if (hasMewtwo) archetype = "👁️ Mewtwo EX Control";
    else if (hasPikachu) archetype = "⚡ Pikachu EX Fast Aggro";
    else if (hasArticuno) archetype = "💧 Articuno EX Freeze";

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

        // Adjust for small sample size
        if (revealedCards.length < 3) {
             confidenceScore = Math.min(confidenceScore, 60 + (revealedCards.length * 10)); // Cap early certainty
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

function inferCardRole(card) {
    if (!card) return 'Tech';
    if (card.type === 'Supporter' || card.type === 'Item') return card.type;
    if ((card.name && card.name.toLowerCase().includes('ex')) || card.stage === 'Stage 2') return 'Main Attacker';
    const hp = parseInt(card.hp) || 0;
    if (hp <= 70) return 'Setup';
    return 'Secondary';
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
            const cardVariations = allCards.filter(c => c.name === cardName);
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
    if(!aiNamesArray || !Array.isArray(aiNamesArray)) return;
    console.log("Original AI Suggestion:", aiNamesArray);
    
    // Step 1: The Resolver
    let resolvedCards = [];
    aiNamesArray.forEach(name => {
        let match = window.TCGP_CARDS.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (match) {
            resolvedCards.push(match);
        }
    });

    // Step 2: The Inventory Filter
    let validatedDeck = [];
    let myCollection = JSON.parse(localStorage.getItem('tcgp_collection') || '{}');
    let tempInventory = { ...myCollection };

    resolvedCards.forEach(card => {
        let countInDeck = validatedDeck.filter(c => c.name === card.name).length;
        if (tempInventory[card.id] > 0 && countInDeck < 2) {
            validatedDeck.push(card);
            tempInventory[card.id]--;
        }
    });

    // Step 3: The Evolution Safeguard
    validatedDeck = validatedDeck.filter(card => {
        if (card.stage === 'Stage 1' || card.stage === 'Stage 2' || card.stage === 'Stage1' || card.stage === 'Stage2') {
            const basicName = getBasicForm(card.name);
            if (basicName) {
                const hasBasic = validatedDeck.some(c => c.name.startsWith(basicName));
                if (!hasBasic) {
                    console.warn(`Removing ${card.name} due to missing Basic (${basicName})`);
                    return false;
                }
            }
        }
        return true;
    });

    // Step 4: The Safety Net (Fill to 20)
    if (validatedDeck.length < 20) {
        console.log(`Auto-filling ${20 - validatedDeck.length} slots...`);
        
        let remainingCards = Object.keys(tempInventory).map(id => ({
            id: id,
            qty: tempInventory[id]
        })).filter(item => item.qty > 0);

        remainingCards.sort((a, b) => b.qty - a.qty);

        for (let item of remainingCards) {
            if (validatedDeck.length >= 20) break;
            let cardObj = window.TCGP_CARDS.find(c => c.id === item.id);
            if (cardObj && (cardObj.type === 'Item' || cardObj.type === 'Supporter')) {
                let countInDeck = validatedDeck.filter(c => c.name === cardObj.name).length;
                let canAdd = Math.min(item.qty, 2 - countInDeck);
                for (let i = 0; i < canAdd; i++) {
                    if (validatedDeck.length < 20) {
                        validatedDeck.push(cardObj);
                    }
                }
            }
        }
    }

    // Step 5: Deployment
    window.currentDeck = validatedDeck;
    
    if (typeof window.renderDeckSlots === 'function') window.renderDeckSlots();
    if (typeof window.renderDeckBuilderSidebar === 'function') window.renderDeckBuilderSidebar();
    
    if (typeof window.showToast === 'function') {
        window.showToast('AI Strategy Validated & Applied \u2713', 'success');
    }
    
    // Update the recommender output
    const out = document.getElementById('recommender-output');
    if(out) {
        out.innerHTML = `<div style="background:var(--bg-dark); border: 1px solid var(--accent-gold); padding:12px; border-radius:8px;">
            <p style="color:var(--accent-gold); margin-bottom:8px;">Deck Applied Successfully</p>
            <div style="font-size:0.9rem; color:var(--text-muted);">
                We validated your inventory, enforced the 2-copy rule, and checked for evolution orphans. ${validatedDeck.length < 20 ? 'We could only find ' + validatedDeck.length + ' cards.' : 'You have a full 20-card deck!'} Choose "Save Deck" when ready.
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
}
