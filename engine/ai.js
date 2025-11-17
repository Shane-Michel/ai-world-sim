import { clamp } from './utils.js';

const goals = ['wander', 'gather', 'socialize', 'rest', 'explore', 'aid'];

function pickGoal(vitals, identity, weather) {
  if (vitals.energy < 25) return 'rest';
  if (weather.pattern === 'Storm' && vitals.energy < 60) return 'rest';
  if (vitals.mood < 35) return 'socialize';

  const roleBias = {
    scout: 'explore',
    artisan: 'gather',
    mender: 'aid',
    guardian: 'aid',
  };

  const bias = roleBias[identity.role];
  if (bias && Math.random() < 0.35) return bias;

  if (identity.temperament === 'curious' && Math.random() < 0.4) return 'explore';
  if (identity.temperament === 'calm' && Math.random() < 0.3) return 'rest';

  return goals[Math.floor(Math.random() * goals.length)];
}

function moveToward(target, position) {
  const dx = Math.sign(target.x - position.x);
  const dy = Math.sign(target.y - position.y);
  return { x: position.x + dx, y: position.y + dy };
}

function clampPosition(world, pos) {
  return {
    x: clamp(pos.x, 0, world.width - 1),
    y: clamp(pos.y, 0, world.height - 1),
  };
}

function findNearbyPeer(citizens, id, position, radius = 1) {
  return citizens.find(({ id: otherId, Position }) => {
    if (otherId === id) return false;
    const dx = Math.abs(Position.x - position.x);
    const dy = Math.abs(Position.y - position.y);
    return dx <= radius && dy <= radius;
  });
}

function applyWeatherMood(weather) {
  if (weather.pattern === 'Storm') return -0.3;
  if (weather.pattern === 'Fog') return -0.1;
  if (weather.pattern === 'Clear') return 0.2;
  return 0;
}

export function updateAI(world, ecs) {
  const citizens = ecs.query(['Brain', 'Position', 'Vitals', 'Identity']);
  const moodDelta = applyWeatherMood(world.weather);

  for (const bundle of citizens) {
    const { Brain, Position, Vitals, Identity, id } = bundle;

    Vitals.mood = clamp(Vitals.mood + moodDelta, 0, 100);

    if (Math.random() < 0.02) {
      Brain.goal = pickGoal(Vitals, Identity, world.weather);
    }

    switch (Brain.goal) {
      case 'rest':
        Vitals.energy = clamp(Vitals.energy + 5, 0, 100);
        Vitals.mood = clamp(Vitals.mood + 0.5, 0, 100);
        break;
      case 'gather': {
        const tile = world.tiles[Position.y][Position.x];
        if (tile.resources > 0) {
          tile.resources -= 1;
          Brain.memory.unshift(`Gathered resources at ${Position.x},${Position.y}`);
          Vitals.energy -= 2;
          Vitals.mood += 1;
        } else {
          Position.x = clampPosition(world, moveToward({ x: tile.x + 1, y: tile.y + 1 }, Position)).x;
          Position.y = clampPosition(world, moveToward({ x: tile.x + 1, y: tile.y + 1 }, Position)).y;
          Vitals.energy -= 1.5;
        }
        break;
      }
      case 'explore': {
        const target = {
          x: Position.x + Math.round((Math.random() - 0.5) * 6),
          y: Position.y + Math.round((Math.random() - 0.5) * 6),
        };
        const moved = clampPosition(world, moveToward(target, Position));
        Position.x = moved.x;
        Position.y = moved.y;
        Brain.memory.unshift(`Scouted toward ${target.x},${target.y}`);
        Vitals.energy -= 1.5;
        Vitals.mood += 0.4;
        break;
      }
      case 'aid': {
        const nearby = findNearbyPeer(citizens, id, Position, 1);
        if (nearby) {
          const vitals = ecs.getComponent(nearby.id, 'Vitals');
          vitals.mood = clamp(vitals.mood + 2.5, 0, 100);
          vitals.energy = clamp(vitals.energy + 1, 0, 100);
          ecs.addComponent(nearby.id, 'Vitals', vitals);
          Brain.memory.unshift(`Tended to ${nearby.Identity.name}`);
          Vitals.mood = clamp(Vitals.mood + 1, 0, 100);
          Vitals.energy -= 1.2;
        } else {
          Brain.goal = 'wander';
        }
        break;
      }
      case 'socialize': {
        const partner = findNearbyPeer(citizens, id, Position, 2);
        if (partner) {
          const partnerVitals = ecs.getComponent(partner.id, 'Vitals');
          partnerVitals.mood = clamp(partnerVitals.mood + 1.5, 0, 100);
          ecs.addComponent(partner.id, 'Vitals', partnerVitals);
          Brain.memory.unshift(`Traded tales with ${partner.Identity.name}`);
        }
        Vitals.mood = clamp(Vitals.mood + 1.5, 0, 100);
        Vitals.energy -= 1;
        break;
      }
      default:
      case 'wander': {
        const target = {
          x: Position.x + Math.round((Math.random() - 0.5) * 3),
          y: Position.y + Math.round((Math.random() - 0.5) * 3),
        };
        const moved = clampPosition(world, moveToward(target, Position));
        Position.x = moved.x;
        Position.y = moved.y;
        Vitals.energy -= 1;
        break;
      }
    }

    Brain.memory = Brain.memory.slice(0, 5);
    if (Vitals.energy < 10) {
      Vitals.mood = clamp(Vitals.mood - 2, 5, 100);
      Brain.goal = 'rest';
    }

    Vitals.energy = clamp(Vitals.energy, 0, 100);
    Vitals.mood = clamp(Vitals.mood, 0, 100);

    ecs.addComponent(id, 'Brain', Brain);
    ecs.addComponent(id, 'Vitals', Vitals);
    ecs.addComponent(id, 'Position', Position);
    ecs.addComponent(id, 'Identity', { ...Identity, mood: Vitals.mood });
  }
}
