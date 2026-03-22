const fs = require('fs');
const path = require('path');

const rarityMap = {
    'â—‡': '◇',
    'â—‡â—‡': '◇◇',
    'â—‡â—‡â—‡': '◇◇◇',
    'â—‡â—‡â—‡â—‡': '◇◇◇◇',
    'â˜†': '☆',
    'â˜†â˜†': '☆☆',
    'â˜†â˜†â˜†': '☆☆☆',
    'ðŸ‘‘': '👑'
};

const filePath = path.join(__dirname, 'data', 'all_cards.json');
const cards = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const fixed = cards.map(card => ({
    ...card,
    rarity: rarityMap[card.rarity] ?? card.rarity
}));

fs.writeFileSync(filePath, JSON.stringify(fixed, null, 2), { encoding: 'utf8' });
console.log(`✅ Fixed rarity encoding for ${fixed.length} cards.`);
