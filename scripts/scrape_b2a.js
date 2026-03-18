// scripts/scrape_b2a.js
// Scrapes Paldean Wonders (B2a) from pocket.limitlesstcg.com
// Merges into data/all_cards.json and data/synergy_tags.json
// Run: node scripts/scrape_b2a.js

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const SET_CODE     = 'B2a';
const SET_NAME     = 'Paldean Wonders';
const TOTAL_CARDS  = 131;
const CARDS_FILE   = path.join(__dirname, '../data/all_cards.json');
const SYNERGY_FILE = path.join(__dirname, '../data/synergy_tags.json');

const B2A_SYNERGY = {
  "Meowscarada EX": { "tags": ["bench_snipe"],                    "bonus": 16, "targets": [] },
  "Skeledirge EX":  { "tags": ["heal_passive"],                   "bonus": 14, "targets": [] },
  "Quaquaval EX":   { "tags": ["energy_accel_attack"],            "bonus": 16, "targets": [] },
  "Armarouge EX":   { "tags": ["energy_accel_passive"],           "bonus": 18, "targets": [] },
  "Ceruledge EX":   { "tags": ["bench_snipe","status_on_attack"], "bonus": 16, "targets": [] },
  "Farigiraf":      { "tags": ["draw_passive"],                   "bonus": 12, "targets": [] },
  "Tinkaton EX":    { "tags": ["bench_snipe"],                    "bonus": 14, "targets": [] },
  "Palafin EX":     { "tags": ["energy_accel_attack"],            "bonus": 14, "targets": [] },
  "Klawf EX":       { "tags": ["pivot_tool"],                     "bonus": 8,  "targets": [] },
  "Tulip":          { "tags": ["heal_trainer"],                   "bonus": 10, "targets": ["Psychic"] },
  "Kieran":         { "tags": ["damage_boost_trainer"],           "bonus": 10, "targets": ["Dragon"] },
  "Penny":          { "tags": ["disruption_trainer"],             "bonus": 8,  "targets": [] }
};

function getPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return getPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extract(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1].trim() : null;
}

function parseCard(html, num) {
  const paddedNum = String(num).padStart(3, '0');
  const cardId    = `${SET_CODE}-${paddedNum}`;

  // Name
  const name = extract(html, /<title>([^- \-]+)[- \-]/);
  if (!name) return null;
  const cleanName = name.trim();

  // Type — from "Grass - 60 HP" or "Supporter" or "Item"
  let type = 'Colorless';
  const titleLineMatch = html.match(/- (Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Dragon|Colorless) -/i);
  if (titleLineMatch) {
    type = titleLineMatch[1].charAt(0).toUpperCase() + titleLineMatch[1].slice(1).toLowerCase();
  } else if (html.includes('Trainer - Supporter')) {
    type = 'Supporter';
  } else if (html.includes('Trainer - Item') || html.includes('Trainer - Tool')) {
    type = 'Item';
  }

  // HP
  const hpMatch = html.match(/(\d+)\s*HP/i);
  const hp = hpMatch ? parseInt(hpMatch, 10) : 0;

  // Stage
  let stage = 'Basic';
  if (html.includes('Trainer - Supporter') || html.includes('Trainer - Item') || html.includes('Trainer - Tool')) {
    stage = 'Trainer';
  } else if (html.includes('Stage 2') || html.includes('Stage2')) {
    stage = 'Stage2';
  } else if (html.includes('Stage 1') || html.includes('Stage1')) {
    stage = 'Stage1';
  }

  // Weakness
  const weaknessMatch = html.match(/Weakness[^a-zA-Z]+(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Dragon|Colorless)/i);
  const weakness = weaknessMatch ? weaknessMatch : '';

  // Retreat
  const retreatMatch = html.match(/Retreat[^0-9]+(\d+)/i);
  const retreatCost = retreatMatch ? parseInt(retreatMatch, 10) : 0;

  // Rarity — Limitless shows rarity as text in the page
  let rarity = '';
  if (html.includes('Crown Rare'))                       rarity = '👑';
  else if (html.includes('Special Illustration Rare'))   rarity = '☆☆☆';
  else if (html.includes('Illustration Rare'))           rarity = '☆☆';
  else if (html.includes('Full Art'))                    rarity = '☆☆';
  else if (html.includes('Double Rare'))                 rarity = '◇◇◇◇';
  else if (html.includes('Rare EX') || html.includes('Ultra Rare')) rarity = '☆';
  else if (html.includes('Rare') && !html.includes('Double')) rarity = '◇◇◇';
  else if (html.includes('Uncommon'))                    rarity = '◇◇';
  else if (html.includes('Common'))                      rarity = '◇';

  return {
    id:          cardId,
    name:        cleanName,
    set:         SET_NAME,
    setCode:     SET_CODE,
    rarity,
    type,
    hp,
    stage,
    weakness,
    retreatCost,
    img: `https://assets.tcgdex.net/en/tcgp/${SET_CODE}/${paddedNum}/high.webp`
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const newCards = [];

  for (let i = 1; i <= TOTAL_CARDS; i++) {
    const url = `https://pocket.limitlesstcg.com/cards/${SET_CODE}/${i}`;
    process.stdout.write(`  [${i}/${TOTAL_CARDS}] Fetching...`);
    try {
      const html = await getPage(url);
      const card = parseCard(html, i);
      if (card) {
        newCards.push(card);
        console.log(` ✓  ${card.name} | ${card.type} | ${card.stage} | rarity:${card.rarity}`);
      } else {
        console.log(` ⚠ Could not parse card ${i}`);
      }
    } catch(e) {
      console.log(` ✗ Error: ${e.message}`);
    }
    await sleep(200);
  }

  // Merge into all_cards.json
  console.log(`\nLoading all_cards.json...`);
  const existing    = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
  const existingIds = new Set(existing.map(c => c.id));
  const toAdd       = newCards.filter(c => !existingIds.has(c.id));
  const skipped     = newCards.length - toAdd.length;
  console.log(`Existing: ${existing.length} | New: ${toAdd.length} | Skipped: ${skipped}`);
  const merged = [...existing, ...toAdd];
  fs.writeFileSync(CARDS_FILE, JSON.stringify(merged));
  console.log(`✅ all_cards.json: ${existing.length} → ${merged.length} cards`);

  // Merge into synergy_tags.json
  console.log(`\nLoading synergy_tags.json...`);
  const synergy = JSON.parse(fs.readFileSync(SYNERGY_FILE, 'utf8'));
  let synergyAdded = 0;
  for (const [name, entry] of Object.entries(B2A_SYNERGY)) {
    if (!synergy[name]) {
      synergy[name] = entry;
      synergyAdded++;
      console.log(`  + Synergy: ${name}`);
    } else {
      console.log(`  ~ Already exists: ${name}`);
    }
  }
  fs.writeFileSync(SYNERGY_FILE, JSON.stringify(synergy, null, 2));
  console.log(`✅ synergy_tags.json: +${synergyAdded} entries`);

  console.log('\n══════════════════════════════════');
  console.log(`DONE — B2a cards added : ${toAdd.length}`);
  console.log(`       Synergy entries : ${synergyAdded}`);
  console.log(`       Total cards now : ${merged.length}`);
  console.log('══════════════════════════════════');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
