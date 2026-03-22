// deck_rules.js — TCGP Legal + Effective Deck Validator
'use strict';

const RULES = {
    DECK_SIZE:           20,
    MAX_COPIES:           2,
    MIN_BASIC_POKEMON:    1,
    RECOMMENDED_BASICS:   4,
    MAX_ENERGY_TYPES:     2
};

const TRAINER_REQUIREMENTS = {
    'Misty':     { types: ['Water'],     minCount: 2, needsEX: true,  desc: 'needs 2+ Water Pokémon, ideally a Water EX' },
    'Brock':     { types: ['Fighting'],  minCount: 2, needsEX: false, desc: 'needs 2+ Fighting Pokémon' },
    'Erika':     { types: ['Grass'],     minCount: 2, needsEX: false, desc: 'needs 2+ Grass Pokémon' },
    'Blaine':    { types: ['Fire'],      minCount: 2, needsEX: false, desc: 'needs 2+ Fire Pokémon or a Fire EX' },
    'Koga':      { names: ['Grimer','Weezing'], minCount: 1, desc: 'needs Grimer or Weezing' },
    'Lt. Surge': { types: ['Lightning'], minCount: 2, needsEX: false, desc: 'needs 2+ Lightning Pokémon' },
    'Sabrina':   { types: ['Psychic'],   minCount: 2, needsEX: false, desc: 'needs 2+ Psychic Pokémon' },
    'Giovanni':  { types: ['Darkness'],  minCount: 1, needsEX: false, desc: 'needs 1+ Darkness Pokémon' }
};

function resolveCards(nameList, cardDb) {
    const resolved = [], unresolved = [];
    for (const name of nameList) {
        const match = cardDb.find(c => c.name === name);
        if (match) resolved.push(match);
        else unresolved.push(name);
    }
    return { resolved, unresolved };
}

function checkDeckSize(deck) {
    return {
        pass: deck.length === RULES.DECK_SIZE,
        count: deck.length,
        message: deck.length === RULES.DECK_SIZE
            ? 'Deck contains exactly 20 cards ✓'
            : `Deck has ${deck.length} cards (must be exactly 20)`
    };
}

function checkDuplicates(deck) {
    const counts = {};
    for (const card of deck) counts[card.name] = (counts[card.name] || 0) + 1;
    const violations = Object.entries(counts)
        .filter(([, n]) => n > RULES.MAX_COPIES)
        .map(([name, count]) => ({ name, count }));
    return {
        pass: violations.length === 0,
        violations,
        message: violations.length === 0
            ? 'No card exceeds 2 copies ✓'
            : violations.map(v => `"${v.name}" appears ${v.count}x (max 2)`).join('; ')
    };
}

function checkBasicPokemon(deck) {
    const basics = deck.filter(c => c.category === 'Pokemon' && c.stage === 'Basic');
    return {
        pass: basics.length >= RULES.MIN_BASIC_POKEMON,
        count: basics.length,
        recommended: basics.length >= RULES.RECOMMENDED_BASICS,
        names: basics.map(c => c.name),
        message: basics.length >= RULES.RECOMMENDED_BASICS
            ? `${basics.length} Basic Pokémon ✓`
            : basics.length >= RULES.MIN_BASIC_POKEMON
                ? `Only ${basics.length} Basic Pokémon — recommend at least 4`
                : 'No Basic Pokémon — deck is illegal'
    };
}

function checkEnergyTypes(deck) {
    const typeSet = new Set();
    for (const card of deck) {
        if (card.category !== 'Pokemon') continue;
        for (const t of (card.types || [card.type])) {
            if (t && t !== 'Colorless') typeSet.add(t);
        }
    }
    const energyTypes = [...typeSet];
    return {
        pass: energyTypes.length <= RULES.MAX_ENERGY_TYPES,
        energyTypes,
        count: energyTypes.length,
        message: energyTypes.length <= RULES.MAX_ENERGY_TYPES
            ? `Energy types: ${energyTypes.join(', ') || 'Colorless only'} ✓`
            : `${energyTypes.length} types found (${energyTypes.join(', ')}) — max is 2`
    };
}

function checkEvolutionIntegrity(deck, cardDb) {
    const deckNames = new Set(deck.map(c => c.name));
    const hasRareCandy = deck.some(c => c.name === 'Rare Candy');
    const violations = [];

    for (const card of deck) {
        if (card.category !== 'Pokemon' || card.stage === 'Basic') continue;

        let current = card;
        while (current.evolveFrom) {
            const prev = cardDb.find(c => c.name === current.evolveFrom && c.category === 'Pokemon');
            if (!prev) break;

            const missingLink = !deckNames.has(prev.name);
            // Rare Candy can substitute a missing Stage 1 ONLY when:
            // - the missing card is a Stage 1 (not a Basic)
            // - the deck has the Basic for that line
            // - the deck has Rare Candy
            if (missingLink) {
                const isMissingStage1 = prev.stage === 'Stage 1';
                const basicName = prev.evolveFrom;
                const hasBasic = basicName ? deckNames.has(basicName) : false;
                if (isMissingStage1 && hasBasic && hasRareCandy) {
                    // Valid — Rare Candy bridges Basic → Stage 2, skip violation
                } else {
                    violations.push({ card: card.name, missing: prev.name });
                }
            }

            if (prev.stage === 'Basic') break;
            current = prev;
        }
    }

    return {
        pass: violations.length === 0,
        violations,
        message: violations.length === 0
            ? 'All evolution lines complete ✓'
            : violations.map(v => `"${v.card}" missing pre-evo "${v.missing}"`).join('; ')
    };
}

function checkTrainerSynergy(deck) {
    const warnings = [];
    const pokemon = deck.filter(c => c.category === 'Pokemon');
    for (const card of deck) {
        if (card.category !== 'Trainer' || card.trainerType !== 'Supporter') continue;
        const req = TRAINER_REQUIREMENTS[card.name];
        if (!req) continue;
        let matchCount = 0;
        if (req.types) matchCount = pokemon.filter(p => (p.types || [p.type]).some(t => req.types.includes(t))).length;
        if (req.names) matchCount = pokemon.filter(p => req.names.includes(p.name)).length;
        if (matchCount < req.minCount)
            warnings.push({ trainer: card.name, issue: `Only ${matchCount} matching Pokémon — ${req.desc}` });
        const copies = deck.filter(c => c.name === card.name).length;
        if (copies === 2 && matchCount < 3)
            warnings.push({ trainer: card.name, issue: `2 copies but only ${matchCount} matching Pokémon — reduce to 1` });
    }
    return {
        pass: warnings.length === 0,
        warnings,
        message: warnings.length === 0
            ? 'All Trainer cards have valid synergy ✓'
            : warnings.map(w => `"${w.trainer}": ${w.issue}`).join('; ')
    };
}

function checkEnergyFeasibility(deck) {
    const pokemon = deck.filter(c => c.category === 'Pokemon');
    let maxCost = 0, expensiveCard = null;
    for (const card of pokemon) {
        for (const atk of (card.attacks || [])) {
            if (atk.convertedEnergyCost > maxCost) {
                maxCost = atk.convertedEnergyCost;
                expensiveCard = card.name;
            }
        }
    }
    const hasEnergyAbility = pokemon.some(p =>
        (p.abilities || []).some(ab => /attach|energy|accelerat/i.test(ab.text))
    );
    const hasEnergySupporter = deck.some(c =>
        c.category === 'Trainer' && c.trainerType === 'Supporter' &&
        ['Misty', 'Blaine', 'Lt. Surge'].includes(c.name)
    );
    const warnings = [];
    if (maxCost >= 3 && !hasEnergyAbility && !hasEnergySupporter) {
        warnings.push({ card: expensiveCard, cost: maxCost,
            issue: `Costs ${maxCost} energy with no acceleration` });
    }
    return {
        pass: warnings.length === 0,
        warnings, maxEnergyCost: maxCost,
        hasAcceleration: hasEnergyAbility || hasEnergySupporter,
        message: warnings.length === 0
            ? 'Energy economy is feasible ✓'
            : warnings.map(w => `"${w.card}" (${w.cost} energy): ${w.issue}`).join('; ')
    };
}

function validateDeck(nameList, cardDb) {
    const { resolved, unresolved } = resolveCards(nameList, cardDb);
    const report = {
        isLegal: false, isValid: false, unresolved,
        rules: {
            deckSize:           checkDeckSize(resolved),
            duplicates:         checkDuplicates(resolved),
            basicPokemon:       checkBasicPokemon(resolved),
            energyTypes:        checkEnergyTypes(resolved),
            evolutionIntegrity: checkEvolutionIntegrity(resolved, cardDb),
            trainerSynergy:     checkTrainerSynergy(resolved),
            energyFeasibility:  checkEnergyFeasibility(resolved)
        }
    };
    const hard = [report.rules.deckSize, report.rules.duplicates,
                  report.rules.basicPokemon, report.rules.energyTypes,
                  report.rules.evolutionIntegrity];
    const soft = [report.rules.trainerSynergy, report.rules.energyFeasibility];
    report.isLegal = hard.every(r => r.pass) && unresolved.length === 0;
    report.isValid = report.isLegal && soft.every(r => r.pass);
    report.summary = report.isValid ? '✅ Legal and effective'
        : report.isLegal ? '⚠️ Legal with effectiveness warnings' : '❌ Illegal deck';
    return report;
}

function autoFixDeck(nameList, cardDb, ownedCardIds) {
    const ownedSet   = new Set(ownedCardIds);
    const ownedCards = cardDb.filter(c => ownedSet.has(c.id));
    let deck = resolveCards(nameList, cardDb).resolved;
    const log = [];

    const { unresolved } = resolveCards(nameList, cardDb);
    if (unresolved.length > 0) log.push(`Removed unrecognised: ${unresolved.join(', ')}`);

    // Cap duplicates at 2
    const counts = {};
    deck = deck.filter(card => {
        counts[card.name] = (counts[card.name] || 0) + 1;
        if (counts[card.name] > 2) { log.push(`Capped "${card.name}" at 2 copies`); return false; }
        return true;
    });

    // Add missing pre-evolutions, strip orphans, or allow Rare Candy bridge
    const hasRareCandy = deck.some(c => c.name === 'Rare Candy');
    const deckNames = () => new Set(deck.map(c => c.name));

    for (const card of [...deck]) {
        if (card.category !== 'Pokemon' || card.stage === 'Basic') continue;
        let current = card;
        while (current.evolveFrom) {
            const prev = cardDb.find(c => c.name === current.evolveFrom && c.category === 'Pokemon');
            if (!prev) break;

            if (!deckNames().has(prev.name)) {
                const isMissingStage1 = prev.stage === 'Stage 1';
                const basicName = prev.evolveFrom;
                const hasBasic = basicName ? deckNames().has(basicName) : false;

                // Rare Candy bridge: Basic + Stage 2 + Rare Candy = legal, no Stage 1 needed
                if (isMissingStage1 && hasBasic && hasRareCandy) {
                    log.push(`Rare Candy bridges "${basicName}" → "${card.name}" (skipping "${prev.name}")`);
                    break;
                }

                // Try to add the missing link from owned cards
                if (ownedCards.find(c => c.name === prev.name)) {
                    deck.push(prev);
                    log.push(`Added missing pre-evo "${prev.name}" for "${card.name}"`);
                } else {
                    deck = deck.filter(c => c.name !== card.name);
                    log.push(`Removed "${card.name}" — pre-evo "${prev.name}" not owned`);
                    break;
                }
            }

            if (prev.stage === 'Basic') break;
            current = prev;
        }
    }

    // Remove Trainers without synergy
    deck = deck.filter(card => {
        if (card.category !== 'Trainer' || card.trainerType !== 'Supporter') return true;
        const req = TRAINER_REQUIREMENTS[card.name];
        if (!req) return true;
        const pokemon = deck.filter(c => c.category === 'Pokemon');
        let n = 0;
        if (req.types) n = pokemon.filter(p => (p.types || [p.type]).some(t => req.types.includes(t))).length;
        if (req.names) n = pokemon.filter(p => req.names.includes(p.name)).length;
        if (n < req.minCount) { log.push(`Removed "${card.name}" — ${n} matching Pokémon < ${req.minCount}`); return false; }
        return true;
    });

    // Trim to 20 (Trainers/Items first)
    while (deck.length > 20) {
        const idx = [...deck.entries()].reverse().find(([, c]) => c.category === 'Trainer');
        if (idx) { log.push(`Trimmed "${idx[1].name}"`); deck.splice(idx[0], 1); }
        else { log.push('Trimmed last card'); deck.pop(); }
    }

    // Pad to 20 with owned Basics
    if (deck.length < 20) {
        const already = deckNames();
        for (const c of ownedCards.filter(c => c.category === 'Pokemon' && c.stage === 'Basic' && !already.has(c.name))) {
            if (deck.length >= 20) break;
            deck.push(c); log.push(`Padded with "${c.name}"`);
        }
    }

    return { deck, nameList: deck.map(c => c.name), log, report: validateDeck(deck.map(c => c.name), cardDb) };
}

const DeckRules = { RULES, TRAINER_REQUIREMENTS, validateDeck, autoFixDeck, resolveCards };
if (typeof module !== 'undefined' && module.exports) module.exports = DeckRules;
else window.DeckRules = DeckRules;
