import { randomChoice } from './utils.js';

const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
const patterns = ['Clear', 'Rain', 'Storm', 'Fog', 'Windy'];

function createTile(x, y) {
  const biomes = ['plains', 'forest', 'hills', 'coast'];
  return {
    x,
    y,
    biome: randomChoice(biomes),
    fertility: Math.random() * 0.8 + 0.2,
    moisture: Math.random(),
    elevation: Math.random(),
    resources: Math.floor(Math.random() * 3),
    controlledBy: null,
  };
}

function createKingdom(id, name, color, seat) {
  return {
    id,
    name,
    color,
    influence: 0,
    wealth: 0,
    territory: 1,
    military: 0,
    diplomacy: 0,
    population: 0,
    stores: {
      food: 80,
      water: 80,
    },
    seat,
    edict: 'prosper',
    kingId: null,
  };
}

function initializeRelationships(kingdoms) {
  const relationships = new Map();
  kingdoms.forEach((a) => {
    if (!relationships.has(a.id)) relationships.set(a.id, new Map());
    kingdoms.forEach((b) => {
      if (a.id === b.id) return;
      const base = 0.1 + Math.random() * 0.1;
      relationships.get(a.id).set(b.id, {
        attitude: base,
        treaty: 'neutral',
        lastTradeDay: -1,
      });
    });
  });
  return relationships;
}

function assignTerritories(world) {
  const nearestSeat = (x, y) => {
    let best = null;
    let bestDistance = Infinity;
    for (const kingdom of world.kingdoms) {
      const dx = kingdom.seat.x - x;
      const dy = kingdom.seat.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = kingdom.id;
      }
    }
    return best;
  };

  const territoryCounts = new Map();

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const controllingKingdom = nearestSeat(x, y);
      world.tiles[y][x].controlledBy = controllingKingdom;
      territoryCounts.set(controllingKingdom, (territoryCounts.get(controllingKingdom) || 0) + 1);
    }
  }

  world.kingdoms.forEach((kingdom) => {
    kingdom.territory = territoryCounts.get(kingdom.id) || 0;
  });
}

export function claimTile(world, x, y, kingdomId) {
  const tile = world.tiles?.[y]?.[x];
  if (!tile) return null;
  if (tile.controlledBy === kingdomId) return null;

  const previous = tile.controlledBy;
  tile.controlledBy = kingdomId;

  const gained = world.kingdoms.find((k) => k.id === kingdomId);
  if (gained) {
    gained.territory = Math.max(0, gained.territory + 1);
  }

  const lost = world.kingdoms.find((k) => k.id === previous);
  if (lost) {
    lost.territory = Math.max(0, lost.territory - 1);
  }

  return { tile, previous };
}

export function createWorld({ width = 64, height = 36 }) {
  const tiles = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(createTile(x, y));
    }
    tiles.push(row);
  }

  const northernSeat = { x: 2, y: Math.floor(height / 4) };
  const southernSeat = { x: width - 3, y: Math.floor((height / 4) * 3) };

  const world = {
    width,
    height,
    tiles,
    time: { day: 0, hour: 6 },
    weather: {
      season: 'Spring',
      pattern: 'Clear',
      temperature: 18,
    },
    kingdoms: [
      createKingdom('aurora', 'Aurora Coalition', '#6dd5ff', northernSeat),
      createKingdom('ember', 'Ember Concord', '#ff8c42', southernSeat),
    ],
    relationships: new Map(),
  };

  assignTerritories(world);

  world.relationships = initializeRelationships(world.kingdoms);

  return world;
}

export function advanceWorld(world, deltaHours) {
  const { time, weather } = world;
  time.hour += deltaHours;
  while (time.hour >= 24) {
    time.hour -= 24;
    time.day += 1;
    weather.season = seasons[(world.time.day % seasons.length)];
  }

  if (Math.random() < 0.02) {
    weather.pattern = randomChoice(patterns);
  }

  const seasonalBase = weather.season === 'Winter' ? 3 : weather.season === 'Summer' ? 28 : 16;
  weather.temperature = seasonalBase + Math.sin(time.hour / 24 * Math.PI * 2) * 5 + (Math.random() - 0.5) * 2;
}
