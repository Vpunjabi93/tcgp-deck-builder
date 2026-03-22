// gemini_parser.js — Prompt builder + response parser for AI deck building
'use strict';

function buildGeminiPrompt(ownedCards, simSignals = {}, playstyle = 'Balanced') {
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
═══════════════════════════════════════════════════════════

AVAILABLE ENERGY TYPES: ${energyTypes.join(', ') || 'Colorless only'}

MY COLLECTION (use ONLY these cards):
${'─'.repeat(60)}
${collectionLines}
${'─'.repeat(60)}

OUTPUT FORMAT:
Write PHASE 1 reasoning, then PHASE 2 answers, then the final deck.
Final deck = JSON array of EXACTLY 20 card name strings.
The JSON array MUST be the last thing in your response.
Format: ["Card Name", "Card Name", ...]
No markdown fences. No objects. Plain strings only. No text after ].
`;
}

function parseGeminiResponse(responseText) {
    if (!responseText) return { nameList: [], reasoning: '', parseMethod: 'none', error: 'Empty response' };

    const lastBracket = responseText.lastIndexOf('[');
    const reasoning   = lastBracket > 0 ? responseText.slice(0, lastBracket).trim() : '';
    let nameList = [], parseMethod = 'none', error = null;

    // Strategy 1: scan all [...] blocks, pick last valid string array ≥ 10
    const arrayMatches = [...responseText.matchAll(/\[[\s\S]*?\]/g)];
    for (let i = arrayMatches.length - 1; i >= 0; i--) {
        try {
            const raw = arrayMatches[i][0].replace(/```json?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length >= 10 && parsed.every(s => typeof s === 'string')) {
                nameList = parsed; parseMethod = 'regex-scan'; break;
            }
        } catch (_) { continue; }
    }

    // Strategy 2: lastIndexOf with bracket depth tracking
    if (nameList.length === 0 && lastBracket !== -1) {
        try {
            let slice = responseText.slice(lastBracket).replace(/```json?/gi, '').replace(/```/g, '').trim();
            let depth = 0, closingIdx = -1;
            for (let i = 0; i < slice.length; i++) {
                if (slice[i] === '[') depth++;
                else if (slice[i] === ']') { depth--; if (depth === 0) { closingIdx = i; break; } }
            }
            if (closingIdx !== -1) {
                const parsed = JSON.parse(slice.slice(0, closingIdx + 1));
                if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) {
                    nameList = parsed; parseMethod = 'lastIndexOf';
                }
            }
        } catch (e) { error = `JSON parse failed: ${e.message}`; }
    }

    // Strategy 3: extract quoted title-case strings as last resort
    if (nameList.length === 0) {
        const likelyCards = [...responseText.matchAll(/"([^"]+)"/g)]
            .map(m => m[1])
            .filter(s => s.length >= 3 && s.length <= 40 && /^[A-Z]/.test(s) && !/http|Error|Phase|Rule|Step/i.test(s));
        if (likelyCards.length >= 10) {
            nameList = likelyCards.slice(0, 20);
            parseMethod = 'quoted-string-fallback';
            error = 'Used fallback string extraction — verify deck manually';
        }
    }

    if (nameList.length === 0) error = error || 'Could not extract deck list from Gemini response';
    return { nameList, reasoning, parseMethod, error };
}

async function runGeminiDeckBuild({ ownedCards, cardDb, ownedCardIds, playstyle, apiKey, modelName, simSignals = {} }) {
    const prompt = buildGeminiPrompt(ownedCards, simSignals, playstyle);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
        }
    );

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    if (!data.candidates?.length) throw new Error(`Gemini blocked: ${data.promptFeedback?.blockReason || 'Unknown'}`);

    const rawText = data.candidates[0].content.parts[0].text;
    const { nameList, reasoning, parseMethod, error: parseError } = parseGeminiResponse(rawText);

    if (!nameList.length) throw new Error(parseError || 'Failed to extract deck from Gemini response');

    const DeckRules = typeof window !== 'undefined' ? window.DeckRules : require('./deck_rules.js');
    const { deck, nameList: fixedNames, log: fixLog, report } = DeckRules.autoFixDeck(nameList, cardDb, ownedCardIds);

    return { rawText, reasoning, parseMethod, parseError, originalNames: nameList, fixedNames, fixLog, deck, report };
}

const GeminiParser = { buildGeminiPrompt, parseGeminiResponse, runGeminiDeckBuild };
if (typeof module !== 'undefined' && module.exports) module.exports = GeminiParser;
else window.GeminiParser = GeminiParser;
