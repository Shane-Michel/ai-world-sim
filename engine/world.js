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
    seat,
  };
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

  return {
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
  };
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
