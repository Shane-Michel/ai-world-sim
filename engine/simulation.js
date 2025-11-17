import { ECS } from './ecs.js';
import { advanceWorld } from './world.js';
import { updateAI } from './ai.js';
import { drawStoryEvent } from './storyEvents.js';

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
    this.storyListeners = [];
    this.storyLog = [];
    this.running = false;

    this.#seedWorld();
  }

  #seedWorld() {
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * this.world.width);
      const y = Math.floor(Math.random() * this.world.height);
      const kingdom = this.world.kingdoms[i % this.world.kingdoms.length];
      const roles = ['scout', 'artisan', 'mender', 'guardian'];
      const temperaments = ['bold', 'curious', 'calm', 'steady'];
      const role = roles[i % roles.length];
      const temperament = temperaments[(i + 1) % temperaments.length];
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
        role,
        temperament,
      });
      this.population += 1;
      if (i === 0) this.focusedEntity = citizen;
    }

    this.addStoryEvent({
      title: 'The world breathes awake',
      description: 'Forty pioneers wake across Aurora and Ember lands, ready to act out countless stories.',
    });
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
    const previousDay = this.world.time.day;
    advanceWorld(this.world, deltaSeconds * 0.25);

    if (this.world.time.day !== previousDay) {
      this.#handleNewDay();
    }

    updateAI(this.world, this.ecs);

    this.statusListeners.forEach((fn) => fn(`Day ${this.world.time.day} • Temp ${this.world.weather.temperature.toFixed(1)}°C`));
  }

  onStatus(handler) {
    this.statusListeners.push(handler);
  }

  onStory(handler) {
    this.storyListeners.push(handler);
  }

  getStoryLog() {
    return [...this.storyLog];
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
    this.addStoryEvent({
      title: 'Divine blessing',
      description: 'A wave of warmth passes through every soul, leaving the kingdoms humming with vigor.',
    });
  }

  spawnHero(name = 'Wanderer') {
    const x = Math.floor(Math.random() * this.world.width);
    const y = Math.floor(Math.random() * this.world.height);
    const entityId = this.ecs.createEntity();
    this.ecs.addComponent(entityId, 'Position', { x, y });
    this.ecs.addComponent(entityId, 'Vitals', { energy: 90, mood: 80 });
    this.ecs.addComponent(entityId, 'Brain', { goal: 'wander', memory: ['New adventurer'], kingdom: 'independent' });
    this.ecs.addComponent(entityId, 'Identity', { name, mood: 80, role: 'wanderer', temperament: 'curious' });
    this.focusEntity(entityId);
    this.population += 1;
    this.statusListeners.forEach((fn) => fn(`${name} enters the world.`));
    this.addStoryEvent({
      title: 'A new hero rises',
      description: `${name} steps onto the map, ready to chase legends without a kingdom banner.`,
    });
  }

  addStoryEvent(event) {
    const timestamp = `Day ${this.world.time.day}, ${this.world.time.hour.toFixed(0)}h`;
    this.storyLog.unshift({ timestamp, ...event });
    this.storyLog = this.storyLog.slice(0, 8);
    this.storyListeners.forEach((fn) => fn(this.getStoryLog()));
  }

  #handleNewDay() {
    const event = drawStoryEvent(this.world, this.ecs);
    if (event) {
      this.addStoryEvent({ title: event.title, description: event.description });
    }
  }
}
