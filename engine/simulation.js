import { ECS } from './ecs.js';
import { advanceWorld } from './world.js';
import { updateAI } from './ai.js';

function createCitizen(id, x, y, kingdom) {
  const names = ['Ari', 'Caspian', 'Mira', 'Lena', 'Jaro', 'Kade'];
  const name = `${names[id % names.length]}-${id}`;
  return {
    id,
    name,
    x,
    y,
    kingdom,
    energy: 80,
    mood: 70,
    goal: 'wander',
  };
}

export class Simulation {
  constructor(world, canvas) {
    this.world = world;
    this.canvas = canvas;
    this.ecs = new ECS();
    this.population = 0;
    this.focusedEntity = null;
    this.statusListeners = [];
    this.running = false;

    this.#seedWorld();
  }

  #seedWorld() {
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * this.world.width);
      const y = Math.floor(Math.random() * this.world.height);
      const kingdom = this.world.kingdoms[i % this.world.kingdoms.length];
      const entityId = this.ecs.createEntity();
      const citizen = createCitizen(entityId, x, y, kingdom);
      this.ecs.addComponent(entityId, 'Position', { x, y });
      this.ecs.addComponent(entityId, 'Vitals', {
        energy: citizen.energy,
        mood: citizen.mood,
      });
      this.ecs.addComponent(entityId, 'Brain', {
        goal: 'wander',
        memory: [`Spawned near ${kingdom.name}`],
        kingdom: kingdom.id,
      });
      this.ecs.addComponent(entityId, 'Identity', {
        name: citizen.name,
        mood: citizen.mood,
      });
      this.population += 1;
      if (i === 0) this.focusedEntity = citizen;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      const deltaMs = now - last;
      last = now;
      this.tick(deltaMs / 1000);
      if (this.running) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  tick(deltaSeconds) {
    advanceWorld(this.world, deltaSeconds * 0.25);
    updateAI(this.world, this.ecs);

    this.statusListeners.forEach((fn) => fn(`Day ${this.world.time.day} • Temp ${this.world.weather.temperature.toFixed(1)}°C`));
  }

  onStatus(handler) {
    this.statusListeners.push(handler);
  }

  getFocusedEntity() {
    if (!this.focusedEntity) return null;
    const id = this.focusedEntity.id || this.focusedEntity;
    const identity = this.ecs.getComponent(id, 'Identity');
    const vitals = this.ecs.getComponent(id, 'Vitals');
    const brain = this.ecs.getComponent(id, 'Brain');
    if (!identity || !vitals || !brain) return null;
    return {
      id,
      name: identity.name,
      energy: vitals.energy,
      mood: vitals.mood,
      goal: brain.goal,
    };
  }

  focusEntity(id) {
    this.focusedEntity = { id };
  }

  applyBlessing() {
    const targets = this.ecs.query(['Vitals']);
    targets.forEach(({ id, Vitals }) => {
      Vitals.energy = Math.min(100, Vitals.energy + 20);
      Vitals.mood = Math.min(100, Vitals.mood + 10);
      this.ecs.addComponent(id, 'Vitals', Vitals);
    });
    this.statusListeners.forEach((fn) => fn('A divine blessing renews the land.'));
  }

  spawnHero(name = 'Wanderer') {
    const x = Math.floor(Math.random() * this.world.width);
    const y = Math.floor(Math.random() * this.world.height);
    const entityId = this.ecs.createEntity();
    this.ecs.addComponent(entityId, 'Position', { x, y });
    this.ecs.addComponent(entityId, 'Vitals', { energy: 90, mood: 80 });
    this.ecs.addComponent(entityId, 'Brain', { goal: 'wander', memory: ['New adventurer'], kingdom: 'independent' });
    this.ecs.addComponent(entityId, 'Identity', { name, mood: 80 });
    this.focusEntity(entityId);
    this.population += 1;
    this.statusListeners.forEach((fn) => fn(`${name} enters the world.`));
  }
}
