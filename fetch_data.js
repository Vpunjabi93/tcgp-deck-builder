// fetch_data.js — Full enrichment + expansion script
// Fetches all TCG Pocket sets from TCGdex API and writes enriched all_cards.json
// Run with: node fetch_data.js

const fs = require('fs');
const https = require('https');
const path = require('path');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Node/18' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)); }
            });
        }).on('error', reject);
    });
}

function mapRarity(rarityStr) {
    const map = {
        'One Diamond': '◇', 'Two Diamond': '◇◇',
        'Three Diamond': '◇◇◇', 'Four Diamond': '◇◇◇◇',
        'One Star': '☆', 'Two Star': '☆☆', 'Three Star': '☆☆☆',
        'Crown': '👑', 'None': ''
    };
    return map[rarityStr] !== undefined ? map[rarityStr] : (rarityStr || '');
}

function normaliseStage(stage) {
    if (!stage) return 'Basic';
    return stage.replace('Stage1', 'Stage 1').replace('Stage2', 'Stage 2');
}

// FIX 2: Derive trainerType robustly — handles null/missing Stadium entries from API
function resolveTrainerType(cardDetail) {
    if (cardDetail.trainerType) return cardDetail.trainerType;
    const effect = (cardDetail.effect || '').toLowerCase();
    if (effect.includes('stadium')) return 'Stadium';
    if (Array.isArray(cardDetail.subtypes)) {
        const sub = cardDetail.subtypes[0];
        if (sub) return sub;
    }
    return 'Item'; // safe default for unknown trainer subtypes
}

// FIX 3: Unified effect summary for ALL card categories
// Pokémon → ability texts + attack effect texts concatenated
// Trainers/Energy → the card's effect text
// This gives the Gemini prompt one consistent field to read for every card
function buildEffectSummary(cardDetail, isPokemon, isTrainer, isEnergy) {
    if (isTrainer || isEnergy) {
        return cardDetail.effect || '';
    }
    if (isPokemon) {
        const parts = [];
        (cardDetail.abilities || []).forEach(ab => {
            if (ab.text) parts.push(`[${ab.type || 'Ability'}: ${ab.name}] ${ab.text}`);
        });
        (cardDetail.attacks || []).forEach(atk => {
            if (atk.text) parts.push(`[Attack: ${atk.name}] ${atk.text}`);
        });
        return parts.join(' | ') || null;
    }
    return null;
}

function buildCard(cardDetail, setId, setName) {
    const category  = cardDetail.category || 'Pokemon';
    const isPokemon = category === 'Pokemon';
    const isTrainer = category === 'Trainer';
    const isEnergy  = category === 'Energy';
    const number    = (cardDetail.id || '').split('-')[1] || '000';

    let type;
    if (isPokemon)      type = (cardDetail.types && cardDetail.types[0]) || 'Colorless';
    else if (isTrainer) type = cardDetail.trainerType || 'Trainer';
    else                type = 'Energy';

    const attacks = (cardDetail.attacks || []).map(atk => ({
        name:                atk.name || '',
        cost:                atk.cost || [],
        convertedEnergyCost: atk.convertedEnergyCost || (atk.cost ? atk.cost.length : 0),
        damage:              String(atk.damage || '0'),
        text:                atk.text || ''
    }));

    const abilities = (cardDetail.abilities || []).map(ab => ({
        name: ab.name || '',
        text: ab.effect || ab.text || '',
        type: ab.type || 'Ability'
    }));

    const trainerType    = isTrainer ? resolveTrainerType(cardDetail) : null;
    const effectSummary  = buildEffectSummary(cardDetail, isPokemon, isTrainer, isEnergy);

    return {
        // ── Identity ──────────────────────────────────────────────────
        id:       cardDetail.id,
        name:     cardDetail.name,
        set:      setName,
        setCode:  setId,
        rarity:   mapRarity(cardDetail.rarity || 'None'),
        category, // 'Pokemon' | 'Trainer' | 'Energy'

        // ── Backward-compat type string ────────────────────────────────
        type,

        // ── Pokémon fields (null for non-Pokémon) ──────────────────────
        types:       isPokemon ? (cardDetail.types || ['Colorless']) : null,
        hp:          isPokemon ? (cardDetail.hp || 0) : 0,
        stage:       isPokemon ? normaliseStage(cardDetail.stage) : null,
        evolvesFrom: isPokemon ? (cardDetail.evolveFrom || null) : null, // FIX 1: renamed from evolveFrom
        weakness:    isPokemon ? (cardDetail.weaknesses?.[0]?.type  || '') : '',
        resistance:  isPokemon ? (cardDetail.resistances?.[0]?.type || '') : '',
        retreatCost: isPokemon ? (cardDetail.retreat || 0) : 0,
        attacks,
        abilities,
        suffix:      cardDetail.suffix || null,

        // ── Unified effect field (all categories) ──────────────────────
        // Pokémon: ability texts + attack effect texts joined
        // Trainers/Energy: the card's effect text
        effect: effectSummary,

        // ── Trainer / Energy fields (null for Pokémon) ─────────────────
        trainerType, // FIX 2: uses resolveTrainerType()
        energyType:  isEnergy ? (cardDetail.energyType || 'Basic') : null,

        // ── Image ──────────────────────────────────────────────────────
        img: `https://assets.tcgdex.net/en/tcgp/${setId}/${number}/high.webp`
    };
}

async function fetchSet(setId, setName) {
    console.log(`\n[${setId}] Fetching set index...`);
    let setData;
    try {
        setData = await fetchJson(`https://api.tcgdex.net/v2/en/sets/${setId}`);
    } catch (e) {
        console.error(`  ERROR fetching set index for ${setId}:`, e.message);
        return [];
    }

    if (!setData.cards || setData.cards.length === 0) {
        console.log(`  No cards found for ${setId}`);
        return [];
    }

    const cards = [];
    const batchSize = 10;

    for (let i = 0; i < setData.cards.length; i += batchSize) {
        const batch = setData.cards.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(async (c) => {
                try {
                    const detail = await fetchJson(`https://api.tcgdex.net/v2/en/cards/${c.id}`);
                    return buildCard(detail, setId, setName);
                } catch (e) {
                    console.log(`  WARN: failed to fetch ${c.id} — ${e.message}`);
                    return null;
                }
            })
        );
        cards.push(...results.filter(Boolean));
        console.log(`  [${setId}] ${cards.length}/${setData.cards.length} cards fetched`);
    }
    return cards;
}

async function main() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

    const setsToFetch = [
        { id: 'A1',  name: 'Genetic Apex' },
        { id: 'A1a', name: 'Mythical Island' },
        { id: 'A2',  name: 'Space-Time Smackdown' },
        { id: 'A2a', name: 'Triumphant Light' },
        { id: 'A2b', name: 'Shining Revelry' },
        { id: 'A3',  name: 'Celestial Guardians' },
        { id: 'A3a', name: 'Extradimensional Crisis' },
        { id: 'A3b', name: 'Eevee Grove' },
        { id: 'A4',  name: 'Wisdom of Sea and Sky' },
        { id: 'A4a', name: 'Secluded Springs' },
        { id: 'A4b', name: 'Deluxe Pack ex' },
        { id: 'B1',  name: 'Mega Rising' },
        { id: 'B1a', name: 'Crimson Blaze' },
        { id: 'B2',  name: 'Fantastical Parade' },
        { id: 'B2a', name: 'Paldean Wonders' },
        { id: 'B2b', name: 'Mega Shine' },
        { id: 'P-A', name: 'Promo-A' },
        { id: 'P-B', name: 'Promo-B' }
    ];

    const allCards = [];
    for (const set of setsToFetch) {
        const setCards = await fetchSet(set.id, set.name);
        allCards.push(...setCards);
    }

    const outPath = path.join(dataDir, 'all_cards.json');
    fs.writeFileSync(outPath, JSON.stringify(allCards, null, 2), { encoding: 'utf8' });
    console.log(`\n✅ Done! ${allCards.length} cards saved to ${outPath}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
