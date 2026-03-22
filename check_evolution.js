const cards = require('./data/all_cards.json');

// How many cards have evolveFrom populated?
const withEvolve = cards.filter(c => c.evolveFrom);
const stage1 = cards.filter(c => c.stage === 'Stage 1');
const stage2 = cards.filter(c => c.stage === 'Stage 2');

console.log(`Total cards: ${cards.length}`);
console.log(`Stage 1 cards: ${stage1.length}`);
console.log(`Stage 2 cards: ${stage2.length}`);
console.log(`Cards with evolveFrom: ${withEvolve.length}`);
console.log('\nSample evolveFrom values:');
withEvolve.slice(0, 5).forEach(c => console.log(`  ${c.name} (${c.id}) evolves from: ${c.evolveFrom}`));
