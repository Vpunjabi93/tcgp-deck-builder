const fs = require('fs');
const https = require('https');
const path = require('path');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Node/18' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function mapRarity(rarityStr) {
    const map = {
        "One Diamond": "◇",
        "Two Diamond": "◇◇",
        "Three Diamond": "◇◇◇",
        "Four Diamond": "◇◇◇◇",
        "One Star": "☆",
        "Two Star": "☆☆",
        "Three Star": "☆☆☆",
        "Crown": "👑",
        "None": ""
    };
    return map[rarityStr] !== undefined ? map[rarityStr] : rarityStr;
}

async function fetchSet(setId, setName) {
    console.log(`Fetching set: ${setId}...`);
    try {
        const setData = await fetchJson(`https://api.tcgdex.net/v2/en/sets/${setId}`);
        let cards = [];
        let count = 0;
        
        // Fetch card details in batches to be nice to the API
        const batchSize = 10;
        for (let i = 0; i < setData.cards.length; i += batchSize) {
            const batch = setData.cards.slice(i, i + batchSize);
            const promises = batch.map(async (c) => {
                let cardDetail;
                try {
                    cardDetail = await fetchJson(`https://api.tcgdex.net/v2/en/cards/${c.id}`);
                } catch(e) {
                    console.log(`Failed to fetch card ${c.id}`);
                    return null;
                }
                const number = cardDetail.id.split('-')[1];
                return {
                    id: cardDetail.id,
                    name: cardDetail.name,
                    set: setName,
                    setCode: setId,
                    rarity: mapRarity(cardDetail.rarity || 'None'),
                    type: cardDetail.types ? cardDetail.types[0] : (cardDetail.category === 'Trainer' ? cardDetail.trainerType : 'Colorless'),
                    hp: cardDetail.hp || 0,
                    stage: cardDetail.stage || (cardDetail.category === 'Trainer' ? 'Trainer' : 'Basic'),
                    weakness: cardDetail.weaknesses ? (cardDetail.weaknesses[0] ? cardDetail.weaknesses[0].type : '') : '',
                    retreatCost: cardDetail.retreat || 0,
                    img: `https://assets.tcgdex.net/en/tcgp/${setId}/${number}/high.webp`
                };
            });
            const results = (await Promise.all(promises)).filter(c => c !== null);
            cards.push(...results);
            count += results.length;
            console.log(`Fetched ${count}/${setData.cards.length} cards for ${setId}`);
        }
        
        return cards;
    } catch (e) {
        console.error(`Error fetching set ${setId}:`, e);
        return [];
    }
}

async function main() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }
    
    const setsToFetch = [
        { id: 'A1', name: 'Genetic Apex' },
        { id: 'A1a', name: 'Mythical Island' },
        { id: 'A2', name: 'Space-Time Smackdown' },
        { id: 'A2a', name: 'Triumphant Light' },
        { id: 'A2b', name: 'Shining Revelry' },
        { id: 'A3', name: 'Celestial Guardians' },
        { id: 'A3a', name: 'Extradimensional Crisis' },
        { id: 'A3b', name: 'Eevee Grove' },
        { id: 'A4', name: 'Wisdom of Sea and Sky' },
        { id: 'A4a', name: 'Secluded Springs' },
        { id: 'B1', name: 'Mega Rising' },
        { id: 'B1a', name: 'Crimson Blaze' },
        { id: 'B2', name: 'Fantastical Parade' },
        { id: 'B2a', name: 'Paldean Wonders' },
        { id: 'P-A', name: 'Promo-A' }
    ];

    let allCards = [];

    for (const set of setsToFetch) {
        const setCards = await fetchSet(set.id, set.name);
        allCards.push(...setCards);
    }
    
    fs.writeFileSync(path.join(dataDir, 'all_cards.json'), JSON.stringify(allCards, null, 2));
    console.log("All sets fetched and saved to all_cards.json!");
}

main();
