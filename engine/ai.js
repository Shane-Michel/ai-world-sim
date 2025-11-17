const goals = ['wander', 'gather', 'socialize', 'rest'];

function pickGoal(entity) {
  if (entity.energy < 30) return 'rest';
  if (entity.mood < 40 && Math.random() > 0.5) return 'socialize';
  return goals[Math.floor(Math.random() * goals.length)];
}

function moveToward(target, position) {
  const dx = Math.sign(target.x - position.x);
  const dy = Math.sign(target.y - position.y);
  return { x: position.x + dx, y: position.y + dy };
}

function clampPosition(world, pos) {
  return {
    x: Math.max(0, Math.min(world.width - 1, pos.x)),
    y: Math.max(0, Math.min(world.height - 1, pos.y)),
  };
}

export function updateAI(world, ecs) {
  const bundles = ecs.query(['Brain', 'Position', 'Vitals']);
  for (const bundle of bundles) {
    const { Brain, Position, Vitals, id } = bundle;

    if (Math.random() < 0.02) {
      Brain.goal = pickGoal(Vitals);
    }

    switch (Brain.goal) {
      case 'rest':
        Vitals.energy = Math.min(100, Vitals.energy + 5);
        Vitals.mood = Math.min(100, Vitals.mood + 0.5);
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
      case 'socialize':
        Vitals.mood = Math.min(100, Vitals.mood + 1.5);
        Vitals.energy -= 1;
        if (Math.random() < 0.1) {
          Brain.memory.unshift('Shared stories with travellers.');
        }
        break;
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
      Vitals.mood = Math.max(5, Vitals.mood - 2);
      Brain.goal = 'rest';
    }

    ecs.addComponent(id, 'Brain', Brain);
    ecs.addComponent(id, 'Vitals', Vitals);
    ecs.addComponent(id, 'Position', Position);
  }
}
