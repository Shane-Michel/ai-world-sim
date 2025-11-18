import { clamp } from './utils.js';

const goals = ['wander', 'gather', 'socialize', 'rest', 'explore', 'aid', 'trade', 'court', 'war', 'rally'];

function pickGoal(vitals, identity, weather, lineage, edict, nearKing) {
  if (vitals.energy < 25) return 'rest';
  if (weather.pattern === 'Storm' && vitals.energy < 60) return 'rest';
  if (vitals.mood < 35) return 'socialize';
  if (!lineage.partnerId && vitals.mood > 55 && Math.random() < 0.35) return 'court';
  if (lineage.partnerId && lineage.fertilityCooldown <= 0 && Math.random() < 0.15) return 'court';

  if (!nearKing && Math.random() < 0.12) return 'rally';

  const roleBias = {
    scout: 'explore',
    artisan: 'trade',
    mender: 'aid',
    guardian: 'war',
    king: edict === 'prosper' ? 'socialize' : 'war',
  };

  const bias = roleBias[identity.role];
  if (bias && Math.random() < 0.35) return bias;

  const edictBias = {
    prosper: 'gather',
    fortify: 'aid',
    expand: 'explore',
    conquer: 'war',
  };

  if (edictBias[edict] && Math.random() < 0.45) return edictBias[edict];

  if (identity.temperament === 'curious' && Math.random() < 0.4) return 'explore';
  if (identity.temperament === 'calm' && Math.random() < 0.3) return 'rest';

  return goals[Math.floor(Math.random() * goals.length)];
}

function getKingPosition(world, ecs, kingdomId) {
  const kingdom = world.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom?.kingId) return null;
  const pos = ecs.getComponent(kingdom.kingId, 'Position');
  if (!pos) return null;
  return { ...pos, id: kingdom.kingId };
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

function findNearbyPeer(citizens, id, position, radius = 1, filter = () => true) {
  return citizens.find(({ id: otherId, Position }) => {
    if (otherId === id) return false;
    const dx = Math.abs(Position.x - position.x);
    const dy = Math.abs(Position.y - position.y);
    return dx <= radius && dy <= radius && filter(otherId, Position);
  });
}

function nudgeKingdom(world, kingdomId, delta) {
  const kingdom = world.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom) return;
  kingdom.wealth = Math.max(0, kingdom.wealth + (delta.wealth || 0));
  kingdom.territory = Math.max(0, kingdom.territory + (delta.territory || 0));
  kingdom.military = Math.max(0, kingdom.military + (delta.military || 0));
  kingdom.diplomacy = Math.max(0, kingdom.diplomacy + (delta.diplomacy || 0));
  kingdom.influence = clamp(kingdom.influence + (delta.influence || 0), 0, 1);
}

function applyWeatherMood(weather) {
  if (weather.pattern === 'Storm') return -0.3;
  if (weather.pattern === 'Fog') return -0.1;
  if (weather.pattern === 'Clear') return 0.2;
  return 0;
}

export function updateAI(world, ecs, callbacks = {}) {
  const citizens = ecs.query(['Brain', 'Position', 'Vitals', 'Identity', 'Lineage']);
  const moodDelta = applyWeatherMood(world.weather);

  for (const bundle of citizens) {
    const { Brain, Position, Vitals, Identity, Lineage, id } = bundle;
    const lineage = Lineage || { partnerId: null, offspring: 0, ageDays: 20, fertilityCooldown: 0 };
    const kingdom = world.kingdoms.find((k) => k.id === Brain.kingdom);
    const kingPosition = getKingPosition(world, ecs, Brain.kingdom);
    const distanceToKing = kingPosition
      ? Math.max(Math.abs(kingPosition.x - Position.x), Math.abs(kingPosition.y - Position.y))
      : null;
    const edict = kingdom?.edict || 'prosper';

    Vitals.mood = clamp(Vitals.mood + moodDelta, 0, 100);
    lineage.ageDays += 0.05;
    lineage.fertilityCooldown = Math.max(0, lineage.fertilityCooldown - 1);

    if (distanceToKing !== null && distanceToKing < 2) {
      Vitals.mood = clamp(Vitals.mood + 0.1, 0, 100);
    }

    if (Math.random() < 0.02) {
      Brain.goal = pickGoal(Vitals, Identity, world.weather, lineage, edict, distanceToKing !== null && distanceToKing <= 3);
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
          const kingdom = world.kingdoms.find((k) => k.id === Brain.kingdom);
          if (kingdom) {
            kingdom.stores.food += 1.5;
            kingdom.stores.water += 1.2;
          }
          nudgeKingdom(world, Brain.kingdom, { wealth: 0.5, influence: 0.002 });
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
        nudgeKingdom(world, Brain.kingdom, { territory: 0.05, influence: 0.003 });
        break;
      }
      case 'trade': {
        const partner = findNearbyPeer(
          citizens,
          id,
          Position,
          3,
          (otherId) => ecs.getComponent(otherId, 'Brain')?.kingdom !== Brain.kingdom,
        );
        const tradeValue = partner ? 1 : 0.5;
        nudgeKingdom(world, Brain.kingdom, { wealth: tradeValue, diplomacy: 0.05 * tradeValue, influence: 0.01 });
        Vitals.energy -= 1.2;
        Vitals.mood += 1.1;
        Brain.memory.unshift(partner ? `Traded with ${partner.Identity.name}` : 'Brokered a small trade route');
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
      case 'court': {
        const eligible = findNearbyPeer(
          citizens,
          id,
          Position,
          2,
          (otherId) => {
            const otherLineage = ecs.getComponent(otherId, 'Lineage');
            const otherBrain = ecs.getComponent(otherId, 'Brain');
            return (
              otherBrain?.kingdom === Brain.kingdom &&
              otherLineage &&
              !otherLineage.partnerId &&
              otherLineage.ageDays > 18
            );
          },
        );

        if (eligible && !lineage.partnerId) {
          lineage.partnerId = eligible.id;
          const otherLineage = ecs.getComponent(eligible.id, 'Lineage');
          otherLineage.partnerId = id;
          ecs.addComponent(eligible.id, 'Lineage', otherLineage);
          Brain.goal = 'rest';
          Brain.memory.unshift(`Bonded with ${eligible.Identity.name}`);
          Vitals.mood = clamp(Vitals.mood + 3, 0, 100);
        } else if (lineage.partnerId) {
          const partner = ecs.getComponent(lineage.partnerId, 'Position');
          if (partner) {
            const moved = clampPosition(world, moveToward(partner, Position));
            Position.x = moved.x;
            Position.y = moved.y;
            if (Math.abs(Position.x - partner.x) <= 1 && Math.abs(Position.y - partner.y) <= 1) {
              if (lineage.fertilityCooldown <= 0 && callbacks.spawnChild) {
                lineage.fertilityCooldown = 240;
                lineage.offspring += 1;
                const partnerLineage = ecs.getComponent(lineage.partnerId, 'Lineage');
                if (partnerLineage) {
                  partnerLineage.offspring += 1;
                  partnerLineage.fertilityCooldown = 240;
                  ecs.addComponent(lineage.partnerId, 'Lineage', partnerLineage);
                }
                callbacks.spawnChild({ kingdom: Brain.kingdom, x: Position.x, y: Position.y, parents: [id, lineage.partnerId] });
              }
              Brain.memory.unshift(`Shared time with partner`);
              Vitals.mood = clamp(Vitals.mood + 2, 0, 100);
            }
          }
        }
        Vitals.energy -= 0.8;
        break;
      }
      case 'war': {
        const currentTile = world.tiles[Position.y]?.[Position.x];
        const rival = findNearbyPeer(
          citizens,
          id,
          Position,
          2,
          (otherId) => ecs.getComponent(otherId, 'Brain')?.kingdom !== Brain.kingdom,
        );
        if (rival) {
          const vitals = ecs.getComponent(rival.id, 'Vitals');
          vitals.energy = clamp(vitals.energy - 4, 0, 100);
          vitals.mood = clamp(vitals.mood - 2, 0, 100);
          ecs.addComponent(rival.id, 'Vitals', vitals);
          nudgeKingdom(world, Brain.kingdom, { military: 0.1, influence: 0.01 });
          const rivalBrain = ecs.getComponent(rival.id, 'Brain');
          nudgeKingdom(world, rivalBrain?.kingdom, { military: -0.05, influence: -0.005 });
          Brain.memory.unshift(`Clashed with ${rival.Identity.name}`);
        } else {
          const nearestEnemy = world.kingdoms.find((k) => k.id !== Brain.kingdom);
          if (nearestEnemy) {
            const marched = clampPosition(world, moveToward(nearestEnemy.seat, Position));
            Position.x = marched.x;
            Position.y = marched.y;
            Brain.memory.unshift('Marching toward enemy lines');
          }
          nudgeKingdom(world, Brain.kingdom, { military: 0.05 });
          Brain.memory.unshift('Drilled for battle');
        }
        if (currentTile?.controlledBy !== Brain.kingdom) {
          callbacks.onConquest?.({ x: Position.x, y: Position.y, attacker: Brain.kingdom, defender: currentTile?.controlledBy });
        }
        Vitals.energy -= 2.2;
        Vitals.mood = clamp(Vitals.mood - 0.6, 0, 100);
        break;
      }
      case 'rally': {
        const target = kingPosition || kingdom?.seat || Position;
        const moved = clampPosition(world, moveToward(target, Position));
        Position.x = moved.x;
        Position.y = moved.y;
        Brain.memory.unshift('Answered the king’s summons');
        Vitals.energy -= 1.1;
        Vitals.mood = clamp(Vitals.mood + 0.2, 0, 100);
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
    ecs.addComponent(id, 'Lineage', lineage);
  }
}
