import { randomChoice } from './utils.js';

function adjustAllVitals(ecs, deltaEnergy, deltaMood) {
  ecs.query(['Vitals']).forEach(({ id, Vitals }) => {
    const updated = {
      energy: Math.min(100, Math.max(0, Vitals.energy + deltaEnergy)),
      mood: Math.min(100, Math.max(0, Vitals.mood + deltaMood)),
    };
    ecs.addComponent(id, 'Vitals', updated);
  });
}

function amplifyKingdom(world, amount) {
  world.kingdoms.forEach((kingdom) => {
    kingdom.influence = Math.min(1, Math.max(0, kingdom.influence + amount));
  });
}

function empowerRandomHero(ecs) {
  const candidates = ecs.query(['Identity', 'Vitals']);
  if (candidates.length === 0) return 'The stars watch silently.';
  const hero = randomChoice(candidates);
  const vitals = hero.Vitals;
  vitals.energy = Math.min(100, vitals.energy + 12);
  vitals.mood = Math.min(100, vitals.mood + 8);
  ecs.addComponent(hero.id, 'Vitals', vitals);
  return `${hero.Identity.name} receives a spark of insight and newfound stamina.`;
}

function addResources(world, amount) {
  const y = Math.floor(Math.random() * world.height);
  const x = Math.floor(Math.random() * world.width);
  const tile = world.tiles[y][x];
  tile.resources += amount;
  return `A rare deposit appears near ${x},${y}, boosting local resources.`;
}

function weatherCalamity(world, ecs) {
  adjustAllVitals(ecs, -6, -5);
  world.weather.pattern = 'Storm';
  return 'A raging storm lashes the land, draining energy and dampening spirits.';
}

function goldenFestival(world, ecs) {
  amplifyKingdom(world, 0.05);
  adjustAllVitals(ecs, 4, 6);
  return 'Both kingdoms host lantern festivals, lifting morale and strengthening alliances.';
}

function quietDiplomacy(world) {
  amplifyKingdom(world, 0.02);
  return 'Envoys trade stories at the border, gently raising each kingdom\'s influence.';
}

const deck = [
  {
    title: 'Stormfront',
    weight: 2,
    resolve: (world, ecs) => weatherCalamity(world, ecs),
  },
  {
    title: 'Golden Festival',
    weight: 3,
    resolve: (world, ecs) => goldenFestival(world, ecs),
  },
  {
    title: 'Gifted Hero',
    weight: 2,
    resolve: (world, ecs) => empowerRandomHero(ecs),
  },
  {
    title: 'Hidden Vein',
    weight: 2,
    resolve: (world, ecs) => addResources(world, 3),
  },
  {
    title: 'Quiet Diplomacy',
    weight: 1,
    resolve: (world) => quietDiplomacy(world),
  },
];

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[0];
}

export function drawStoryEvent(world, ecs) {
  const shouldFire = Math.random() < 0.55;
  if (!shouldFire) return null;
  const event = weightedPick(deck);
  const description = event.resolve(world, ecs);
  return {
    title: event.title,
    description,
  };
}
