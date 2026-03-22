// gemini_parser.js — Prompt builder + response parser for AI deck building
'use strict';

function buildGeminiPrompt(ownedCards, simSignals = {}, playstyle = 'Balanced', type1 = 'Any', type2 = 'None') {
    const sorted = [...ownedCards].sort((a, b) => (b._powerScore || 0) - (a._powerScore || 0));

    const collectionLines = sorted.map(({ card, qty, _powerScore, _sim }) => {
        const attackLines = (card.attacks || []).map(atk => {
            const cost = atk.cost?.length > 0 ? atk.cost.join('+') : 'Free';
            const effect = atk.text ? ` [${atk.text.slice(0, 80)}${atk.text.length > 80 ? '...' : ''}]` : '';
            return `      ATK: ${atk.name} | Cost:${cost}(${atk.convertedEnergyCost}) | Dmg:${atk.damage}${effect}`;
        }).join('\n');

        const abilityLines = (card.abilities || []).map(ab =>
            `      ABILITY: ${ab.name} — ${ab.text?.slice(0, 100) || ''}`
        ).join('\n');

        const effectLine = card.effect
            ? `      EFFECT: ${card.effect.slice(0, 120)}${card.effect.length > 120 ? '...' : ''}`
            : '';

        const simLine = _sim
            ? `      SIM: WeightedFit=${_sim.weightedScore.toFixed(3)} Consistency=${_sim.consistencyRating.toFixed(3)}`
            : '';

        let header;
        if (card.category === 'Pokemon') {
            const evo = card.evolveFrom ? ` evolveFrom:${card.evolveFrom}` : '';
            header = `[POKEMON] ${card.name} | type:${card.type} stage:${card.stage} HP:${card.hp} retreat:${card.retreatCost}${evo} | qty:${qty} score:${(_powerScore||0).toFixed(1)}`;
        } else if (card.category === 'Trainer') {
            header = `[TRAINER:${card.trainerType || 'Item'}] ${card.name} | qty:${qty}`;
        } else {
            header = `[ENERGY:${card.energyType || 'Basic'}] ${card.name} | qty:${qty}`;
        }

        return [header, attackLines, abilityLines, effectLine, simLine].filter(Boolean).join('\n');
    }).join('\n\n');

    const energyTypes = [...new Set(
        sorted.filter(({ card }) => card.category === 'Pokemon')
              .flatMap(({ card }) => card.types || [card.type])
              .filter(t => t && t !== 'Colorless')
    )];

    return `You are a world-class Pokémon TCG Pocket deck architect.
All card data below is ground truth. Use ONLY the listed cards. Do NOT invent cards.

═══════════════════════════════════════════════════════════
TCGP HARD RULES (enforce all — non-negotiable)
═══════════════════════════════════════════════════════════
1. DECK SIZE: Exactly 20 cards.
2. COPY LIMIT: Max 2 copies of any single card name.
3. BASICS: At least 4 Basic Pokémon for consistency.
4. ENERGY TYPES: Max 2 distinct non-Colorless Pokémon energy types.
   Colorless / Trainer / Energy cards do NOT count toward this limit.
5. EVOLUTION INTEGRITY:
   Every Stage 1 needs its Basic. Every Stage 2 needs Stage 1 + Basic.
   The evolveFrom field tells you exactly what is required.
   If a pre-evolution is not in MY COLLECTION below, remove the entire line.
6. TRAINER SYNERGY:
   Misty = 2+ Water Pokémon (ideally a Water EX).
   Brock = 2+ Fighting Pokémon.
   Erika = 2+ Grass Pokémon.
   Blaine = 2+ Fire Pokémon or a Fire EX.
   Koga = Grimer or Weezing in deck.
   Lt. Surge = 2+ Lightning Pokémon.
   Sabrina = 2+ Psychic Pokémon.
   Do NOT include 2 copies of a Gym Leader unless 3+ matching Pokémon exist.
7. ENERGY FEASIBILITY:
   If win condition costs 3+ energy, include an energy-acceleration ability
   Pokémon OR an energy-boosting Supporter (Misty/Blaine/Lt. Surge).

═══════════════════════════════════════════════════════════
PHASE 1 — DECK PLAN
═══════════════════════════════════════════════════════════
WIN CONDITION: Best EX or Stage 2 from my collection with highest damage/energy ratio.
  Check evolveFrom chain — every ancestor must exist in my collection.

ENERGY ACCELERATION: Check ABILITY fields below.
  If any Pokémon has an energy-attaching ability, it is MANDATORY.
  If none, win condition must cost ≤2 energy OR include Misty/Blaine.

SUPPORTER SELECTION: For each Supporter:
  State its EFFECT, name every Pokémon in THIS deck it targets.
  If fewer than 2 match, do NOT include it.

EVOLUTION LINES: For each evolution card:
  evolveFrom = [name]. Is [name] in MY COLLECTION? Yes/No. If No, remove line.

TYPE DISCIPLINE: List all non-Colorless types. If 3+, remove least-represented.

═══════════════════════════════════════════════════════════
PHASE 2 — SELF-CHECK
═══════════════════════════════════════════════════════════
1. COUNT: Total = ?
2. DUPLICATES: Any name >2 times?
3. BASICS: Number of Basic Pokémon = ?
4. ENERGY TYPES: Distinct non-Colorless types = ?
5. EVOLUTION CHAINS: All pre-evolutions present?
6. TRAINER SYNERGY: Each Gym Leader has 2+ matching Pokémon?
7. ENERGY FEASIBILITY: Win condition cost vs acceleration?

═══════════════════════════════════════════════════════════
PLAYSTYLE: ${playstyle}
  Aggro = fast basics, low retreat, 1-2 energy attacks
  Control = status, disruption, defensive bulk
  Balanced = reliable setup with mid-game power spike
- Restrict Pokémon to these energy types: ${[type1, type2 !== 'None' ? type2 : null].filter(Boolean).filter(t => t !== 'Any').join(' and ') || 'Any'}
═══════════════════════════════════════════════════════════

AVAILABLE ENERGY TYPES: ${energyTypes.join(', ') || 'Colorless only'}

MY COLLECTION (use ONLY these cards):
${'─'.repeat(60)}
${collectionLines}
${'─'.repeat(60)}

OUTPUT FORMAT:
Write PHASE 1 reasoning, then PHASE 2 answers, then the final deck.
Final deck = A plain text list of EXACTLY 20 card names, one per line.
Do NOT output JSON.
`;
}

function parseGeminiResponse(responseText) {
    if (!responseText) return { nameList: [], reasoning: '', parseMethod: 'none', error: 'Empty response' };

    let cleanText = responseText.replace(/```json?/gi, '').replace(/```/g, '').replace(/`/g, '').trim();

    let nameList = [], parseMethod = 'none', error = null;
    const arrayBlocks = [];
    let depth = 0;
    let startIdx = -1;

    for (let i = 0; i < cleanText.length; i++) {
        if (cleanText[i] === '[') {
            if (depth === 0) startIdx = i;
            depth++;
        } else if (cleanText[i] === ']') {
            depth--;
            if (depth === 0 && startIdx !== -1) {
                arrayBlocks.push({
                    text: cleanText.substring(startIdx, i + 1),
                    lastIdx: i,
                    length: i - startIdx + 1
                });
                startIdx = -1;
            }
        }
    }

    if (arrayBlocks.length === 0) {
        // Fallback: try raw JSON.parse of everything, just in case
        try {
            const parsed = JSON.parse(cleanText);
            if (Array.isArray(parsed)) arrayBlocks.push({ text: cleanText, lastIdx: 0, length: cleanText.length });
        } catch (e) {}
    }

    const validateArray = (arr) => Array.isArray(arr) && arr.length >= 10 && arr.length <= 25 && arr.every(s => typeof s === 'string' && s.length >= 2 && s.length <= 50);

    // Strategy 1: longest first
    const byLength = [...arrayBlocks].sort((a, b) => b.length - a.length);
    for (const block of byLength) {
        try {
            const parsed = JSON.parse(block.text);
            if (validateArray(parsed)) {
                nameList = parsed;
                parseMethod = 'longest-block';
                break;
            }
        } catch (e) { continue; }
    }

    // Strategy 2: last occurrence first
    if (nameList.length === 0) {
        const byPos = [...arrayBlocks].sort((a, b) => b.lastIdx - a.lastIdx);
        for (const block of byPos) {
            try {
                const parsed = JSON.parse(block.text);
                if (validateArray(parsed) || (Array.isArray(parsed) && parsed.length >= 10 && parsed.every(s => typeof s === 'string'))) {
                    nameList = parsed;
                    parseMethod = 'last-block';
                    break;
                }
            } catch (e) { continue; }
        }
    }

    if (nameList.length === 0) {
        console.error("Failed to parse Gemini JSON output. Raw response:", responseText);
        error = 'Could not extract deck list from Gemini response. Ensure it returned a valid JSON array.';
    }

    return { nameList, reasoning: '', parseMethod, error };
}

async function runGeminiDeckBuild({ ownedCards, cardDb, ownedCardIds, playstyle, apiKey, modelName, type1 = 'Any', type2 = 'None', simSignals = {} }) {
    const prompt1 = buildGeminiPrompt(ownedCards, simSignals, playstyle, type1, type2);
    
    // CALL 1: Reasoning
    const res1 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt1 }] }], generationConfig: { temperature: 0.4 } })
        }
    );

    if (!res1.ok) {
        const err = await res1.json();
        throw new Error(err.error?.message || 'Gemini API error (Call 1)');
    }

    const data1 = await res1.json();
    if (!data1.candidates?.length) throw new Error(`Gemini blocked (Call 1): ${data1.promptFeedback?.blockReason || 'Unknown'}`);
    const reasoningText = data1.candidates[0].content.parts[0].text;

    // CALL 2: JSON Extraction
    const validNames = [...new Set(ownedCards.map(o => o.card.name))];
    const prompt2 = `From the deck plan above, output ONLY a JSON array of exactly 20 strings. Each string must exactly match one name from this list: ${JSON.stringify(validNames)}. No other text.`;

    const res2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [
                    { role: 'user', parts: [{ text: prompt1 }] },
                    { role: 'model', parts: [{ text: reasoningText }] },
                    { role: 'user', parts: [{ text: prompt2 }] }
                ], 
                generationConfig: { temperature: 0.0 } 
            })
        }
    );

    if (!res2.ok) {
        const err = await res2.json();
        throw new Error(err.error?.message || 'Gemini API error (Call 2)');
    }

    const data2 = await res2.json();
    if (!data2.candidates?.length) throw new Error(`Gemini blocked (Call 2): ${data2.promptFeedback?.blockReason || 'Unknown'}`);
    
    const jsonText = data2.candidates[0].content.parts[0].text;
    const { nameList, parseMethod, error: parseError } = parseGeminiResponse(jsonText);

    if (!nameList.length) throw new Error(parseError || 'Failed to extract deck from Gemini response');

    const DeckRules = typeof window !== 'undefined' ? window.DeckRules : require('./deck_rules.js');
    const { deck, nameList: fixedNames, log: fixLog, report } = DeckRules.autoFixDeck(nameList, cardDb, ownedCardIds);

    return { rawText: reasoningText + '\n\n' + jsonText, reasoning: reasoningText, parseMethod, parseError, originalNames: nameList, fixedNames, fixLog, deck, report };
}

const GeminiParser = { buildGeminiPrompt, parseGeminiResponse, runGeminiDeckBuild };
if (typeof module !== 'undefined' && module.exports) module.exports = GeminiParser;
else window.GeminiParser = GeminiParser;
