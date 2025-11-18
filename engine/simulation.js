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

  #registerCitizen(kingdomId) {
    const kingdom = this.world.kingdoms.find((k) => k.id === kingdomId);
    if (kingdom) {
      kingdom.population += 1;
      kingdom.influence = Math.min(1, kingdom.influence + 0.002);
    }
    this.population += 1;
  }

  #createCitizenEntity({
    x,
    y,
    kingdom,
    role,
    temperament,
    name,
    memory,
    lineage,
  }) {
    const entityId = this.ecs.createEntity();
    this.ecs.addComponent(entityId, 'Position', { x, y });
    this.ecs.addComponent(entityId, 'Vitals', { energy: 80, mood: 70 });
    this.ecs.addComponent(entityId, 'Brain', {
      goal: 'wander',
      memory: [memory ?? `Spawned near ${kingdom}`],
      kingdom,
    });
    this.ecs.addComponent(entityId, 'Identity', { name, mood: 70, role, temperament });
    this.ecs.addComponent(entityId, 'Lineage', {
      partnerId: lineage?.partnerId ?? null,
      offspring: lineage?.offspring ?? 0,
      ageDays: lineage?.ageDays ?? Math.floor(Math.random() * 30) + 18,
      fertilityCooldown: lineage?.fertilityCooldown ?? 0,
    });
    this.#registerCitizen(kingdom);
    return entityId;
  }

  #spawnChild({ kingdom, x, y, parents }) {
    const id = this.ecs.createEntity();
    const name = `Heir-${id}`;
    const role = ['scout', 'artisan', 'mender', 'guardian'][id % 4];
    const temperament = ['bold', 'curious', 'calm', 'steady'][(id + 1) % 4];
    const safeX = Math.max(0, Math.min(this.world.width - 1, x + Math.round((Math.random() - 0.5) * 2)));
    const safeY = Math.max(0, Math.min(this.world.height - 1, y + Math.round((Math.random() - 0.5) * 2)));

    this.ecs.addComponent(id, 'Position', { x: safeX, y: safeY });
    this.ecs.addComponent(id, 'Vitals', { energy: 90, mood: 75 });
    this.ecs.addComponent(id, 'Brain', {
      goal: 'rest',
      memory: [`Born to ${parents.join(' & ')}`],
      kingdom,
    });
    this.ecs.addComponent(id, 'Identity', { name, mood: 75, role, temperament });
    this.ecs.addComponent(id, 'Lineage', { partnerId: null, offspring: 0, ageDays: 0, fertilityCooldown: 200 });

    this.#registerCitizen(kingdom);
    this.statusListeners.forEach((fn) => fn(`${name} joins the ${kingdom} banner.`));
    const parentNames = parents
      .map((parentId) => this.ecs.getComponent(parentId, 'Identity')?.name || 'unknown')
      .join(' & ');
    this.addStoryEvent({
      title: 'A new generation rises',
      description: `${name} is born under the ${kingdom} flag, child of ${parentNames}.`,
    });
  }

  #seedWorld() {
    const total = 40;
    const roles = ['scout', 'artisan', 'mender', 'guardian'];
    const temperaments = ['bold', 'curious', 'calm', 'steady'];

    const spawnAroundSeat = (kingdom, count) => {
      for (let i = 0; i < count; i++) {
        const seat = kingdom.seat;
        const x = Math.max(0, Math.min(this.world.width - 1, seat.x + Math.round((Math.random() - 0.5) * 6)));
        const y = Math.max(0, Math.min(this.world.height - 1, seat.y + Math.round((Math.random() - 0.5) * 6)));
        const entityId = this.ecs.createEntity();
        const citizen = createCitizen(entityId, x, y, kingdom);
        const role = roles[(entityId + i) % roles.length];
        const temperament = temperaments[(entityId + i + 1) % temperaments.length];
        this.ecs.addComponent(entityId, 'Position', { x, y });
        this.ecs.addComponent(entityId, 'Vitals', { energy: citizen.energy, mood: citizen.mood });
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
        this.ecs.addComponent(entityId, 'Lineage', {
          partnerId: null,
          offspring: 0,
          ageDays: Math.floor(Math.random() * 20) + 18,
          fertilityCooldown: 0,
        });
        this.#registerCitizen(kingdom.id);
        if (i === 0 && kingdom.id === 'aurora') this.focusedEntity = citizen;
      }
    };

    const half = Math.floor(total / this.world.kingdoms.length);
    this.world.kingdoms.forEach((kingdom, index) => {
      const allotment = index === this.world.kingdoms.length - 1 ? total - half : half;
      spawnAroundSeat(kingdom, allotment);
    });

    this.addStoryEvent({
      title: 'The world breathes awake',
      description: 'Forty pioneers wake at opposite edges of the world, ready to carve kingdoms from nothing.',
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

    updateAI(this.world, this.ecs, {
      spawnChild: (baby) => this.#spawnChild(baby),
    });

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
    this.ecs.addComponent(entityId, 'Lineage', { partnerId: null, offspring: 0, ageDays: 24, fertilityCooldown: 0 });
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
