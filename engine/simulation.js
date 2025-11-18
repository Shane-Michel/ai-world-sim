import { ECS } from './ecs.js';
import { advanceWorld, claimTile } from './world.js';
import { updateAI } from './ai.js';
import { drawStoryEvent } from './storyEvents.js';
import { clamp, getLifeStage } from './utils.js';

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
    this.nomadStores = new Map();
    this.objectiveListeners = [];
    this.objectives = this.#createObjectives();
    this.godMoodStreak = 0;
    this.heroMilestones = 0;
    this.lastAverageMood = 0;
    this.lastFestivalSeason = new Map();
    this.running = false;

    this.#seedWorld();
    this.#emitObjectives();
  }

  #addSkills(entityId, role, seed = 10) {
    const mastery = seed + Math.random() * 10;
    this.ecs.addComponent(entityId, 'Skills', { mastery, specialty: role });
  }

  #createObjectives() {
    return {
      god: {
        description: 'Maintain average mood above 65 for three consecutive days.',
        progress: 0,
        target: 3,
        completed: false,
      },
      kingdom: {
        description: 'Seize six contested tiles from rival banners.',
        progress: 0,
        target: 6,
        completed: false,
      },
      rpg: {
        description: 'Guide heroes to accomplish four notable milestones.',
        progress: 0,
        target: 4,
        completed: false,
      },
    };
  }

  #registerCitizen(kingdomId) {
    const kingdom = this.world.kingdoms.find((k) => k.id === kingdomId);
    if (kingdom) {
      kingdom.population += 1;
      kingdom.influence = Math.min(1, kingdom.influence + 0.002);
    }
    this.population += 1;
  }

  #spawnKing(kingdom) {
    const entityId = this.ecs.createEntity();
    const { x, y } = kingdom.seat;
    this.ecs.addComponent(entityId, 'Position', { x, y });
    this.ecs.addComponent(entityId, 'Vitals', { energy: 95, mood: 85 });
    this.ecs.addComponent(entityId, 'Brain', {
      goal: 'wander',
      memory: [`Crowned ruler of ${kingdom.name}`],
      kingdom: kingdom.id,
      commander: null,
    });
    this.ecs.addComponent(entityId, 'Identity', {
      name: `${kingdom.name.split(' ')[0]} King`,
      mood: 85,
      role: 'king',
      temperament: 'steady',
      rank: 'king',
    });
    this.ecs.addComponent(entityId, 'Lineage', {
      partnerId: null,
      offspring: 0,
      ageDays: 60,
      fertilityCooldown: 0,
    });
    this.#addSkills(entityId, 'king', 22);
    kingdom.kingId = entityId;
    this.#registerCitizen(kingdom.id);
    return entityId;
  }

  #deregisterCitizen(kingdomId) {
    const kingdom = this.world.kingdoms.find((k) => k.id === kingdomId);
    if (kingdom && kingdom.population > 0) {
      kingdom.population -= 1;
    }
    this.population = Math.max(0, this.population - 1);
  }

  #reapCitizen(id, reason) {
    const brain = this.ecs.getComponent(id, 'Brain');
    const identity = this.ecs.getComponent(id, 'Identity');
    const lineage = this.ecs.getComponent(id, 'Lineage');
    const skills = this.ecs.getComponent(id, 'Skills');
    const name = identity?.name || `Entity-${id}`;

    this.#deregisterCitizen(brain?.kingdom);

    if (lineage?.partnerId) {
      const partnerLineage = this.ecs.getComponent(lineage.partnerId, 'Lineage');
      if (partnerLineage?.partnerId === id) {
        partnerLineage.partnerId = null;
        this.ecs.addComponent(lineage.partnerId, 'Lineage', partnerLineage);
      }
    }

    this.ecs.removeEntity(id);
    this.statusListeners.forEach((fn) => fn(`${name} has died (${reason}).`));

    if (identity) {
      const lifeSummary = lineage ? `${lineage.ageDays.toFixed(1)} winters known` : 'life cut short';
      this.addStoryEvent({
        title: `${name} passes`,
        description: `${name} of ${brain?.kingdom || 'no banner'} dies (${reason}); ${lifeSummary}.`,
      });
      const stage = lineage ? getLifeStage(lineage.ageDays) : 'adult';
      if (stage === 'elder' && brain?.kingdom) {
        const kingdom = this.world.kingdoms.find((k) => k.id === brain.kingdom);
        if (kingdom) {
          const legacy = Math.max(1, (skills?.mastery || 6) * 0.15);
          kingdom.wealth += legacy;
          this.#boostMorale(kingdom.id, 1.5);
          this.addStoryEvent({
            title: 'Inheritance shared',
            description: `${name} leaves a legacy to ${kingdom.name}, bolstering coffers and hearts.`,
          });
        }
      }
    }
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
    const commander = this.world.kingdoms.find((k) => k.id === kingdom)?.kingId ?? null;
    this.ecs.addComponent(entityId, 'Brain', {
      goal: 'wander',
      memory: [memory ?? `Spawned near ${kingdom}`],
      kingdom,
      commander,
    });
    this.ecs.addComponent(entityId, 'Identity', { name, mood: 70, role, temperament, rank: 'subject' });
    this.ecs.addComponent(entityId, 'Lineage', {
      partnerId: lineage?.partnerId ?? null,
      offspring: lineage?.offspring ?? 0,
      ageDays: lineage?.ageDays ?? Math.floor(Math.random() * 30) + 18,
      fertilityCooldown: lineage?.fertilityCooldown ?? 0,
    });
    this.#addSkills(entityId, role, 8);
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
    const commander = this.world.kingdoms.find((k) => k.id === kingdom)?.kingId ?? null;
    this.ecs.addComponent(id, 'Brain', {
      goal: 'rest',
      memory: [`Born to ${parents.join(' & ')}`],
      kingdom,
      commander,
    });
    this.ecs.addComponent(id, 'Identity', { name, mood: 75, role, temperament, rank: 'subject' });
    this.ecs.addComponent(id, 'Lineage', { partnerId: null, offspring: 0, ageDays: 0, fertilityCooldown: 200 });
    this.#addSkills(id, role, 4);

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
        const commander = kingdom.kingId ?? null;
        this.ecs.addComponent(entityId, 'Position', { x, y });
        this.ecs.addComponent(entityId, 'Vitals', { energy: citizen.energy, mood: citizen.mood });
        this.ecs.addComponent(entityId, 'Brain', {
          goal: 'wander',
          memory: [`Spawned near ${kingdom.name}`],
          kingdom: kingdom.id,
          commander,
        });
        this.ecs.addComponent(entityId, 'Identity', {
          name: citizen.name,
          mood: citizen.mood,
          role,
          temperament,
          rank: 'subject',
        });
        this.ecs.addComponent(entityId, 'Lineage', {
          partnerId: null,
          offspring: 0,
          ageDays: Math.floor(Math.random() * 20) + 18,
          fertilityCooldown: 0,
        });
        this.#addSkills(entityId, role, 6);
        this.#registerCitizen(kingdom.id);
        if (i === 0 && kingdom.id === 'aurora') this.focusedEntity = citizen;
      }
    };

    const half = Math.floor(total / this.world.kingdoms.length);
    this.world.kingdoms.forEach((kingdom) => this.#spawnKing(kingdom));

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
      onConquest: (payload) => this.#handleConquest(payload),
      onHeroMilestone: (payload) => this.#handleHeroMilestone(payload),
    });

    this.statusListeners.forEach((fn) => fn(`Day ${this.world.time.day} • Temp ${this.world.weather.temperature.toFixed(1)}°C`));
  }

  onStatus(handler) {
    this.statusListeners.push(handler);
  }

  onStory(handler) {
    this.storyListeners.push(handler);
  }

  onObjectives(handler) {
    this.objectiveListeners.push(handler);
  }

  getStoryLog() {
    return [...this.storyLog];
  }

  getObjectives() {
    return JSON.parse(JSON.stringify(this.objectives));
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
    this.#addSkills(entityId, 'wanderer', 12);
    this.focusEntity(entityId);
    this.population += 1;
    this.statusListeners.forEach((fn) => fn(`${name} enters the world.`));
    this.addStoryEvent({
      title: 'A new hero rises',
      description: `${name} steps onto the map, ready to chase legends without a kingdom banner.`,
    });
  }

  #emitObjectives() {
    const snapshot = this.getObjectives();
    this.objectiveListeners.forEach((fn) => fn(snapshot));
  }

  #updateObjective(key, delta = 1) {
    const objective = this.objectives[key];
    if (!objective || objective.completed) return;
    objective.progress = Math.min(objective.target, objective.progress + delta);
    if (objective.progress >= objective.target) objective.completed = true;
    this.#emitObjectives();
  }

  addStoryEvent(event) {
    const timestamp = `Day ${this.world.time.day}, ${this.world.time.hour.toFixed(0)}h`;
    this.storyLog.unshift({ timestamp, ...event });
    this.storyLog = this.storyLog.slice(0, 8);
    this.storyListeners.forEach((fn) => fn(this.getStoryLog()));
  }

  #handleNewDay() {
    this.#updateKingdomEdicts();
    this.#applyDailyUpkeep();
    this.#applySeasonalDynamics();
    this.#updateDiplomacyAndTrade();
    this.#evaluateObjectives();
    const event = drawStoryEvent(this.world, this.ecs);
    if (event) {
      this.addStoryEvent({ title: event.title, description: event.description });
    }
  }

  #handleConquest({ x, y, attacker, defender }) {
    const result = claimTile(this.world, x, y, attacker);
    if (!result) return;

    const attackerName = this.world.kingdoms.find((k) => k.id === attacker)?.name || attacker;
    const defenderName = this.world.kingdoms.find((k) => k.id === defender)?.name || defender || 'the wilds';
    this.addStoryEvent({
      title: 'Border shifts',
      description: `${attackerName} seize ${x},${y} from ${defenderName}.`,
    });

    if (defender) {
      this.#updateObjective('kingdom', 1);
    }
  }

  #handleHeroMilestone({ id, action, detail }) {
    const identity = this.ecs.getComponent(id, 'Identity');
    const heroName = identity?.name || 'Hero';
    this.heroMilestones += 1;
    this.#updateObjective('rpg', 1);
    this.addStoryEvent({
      title: 'Heroic deed',
      description: `${heroName} completes a ${action} quest${detail ? ` — ${detail}` : ''}.`,
    });
  }

  #updateKingdomEdicts() {
    const totalTiles = this.world.width * this.world.height;
    this.world.kingdoms.forEach((kingdom) => {
      const previous = kingdom.edict;
      const scarcity = kingdom.stores.food + kingdom.stores.water < Math.max(40, kingdom.population * 6);
      const risingPower = kingdom.military > kingdom.diplomacy + 2 && kingdom.population > 10;
      const compactRealm = kingdom.territory / totalTiles < 0.35;

      if (scarcity) {
        kingdom.edict = 'prosper';
      } else if (risingPower) {
        kingdom.edict = 'conquer';
      } else if (compactRealm) {
        kingdom.edict = 'expand';
      } else {
        kingdom.edict = 'fortify';
      }

      if (kingdom.edict !== previous) {
        this.addStoryEvent({
          title: `${kingdom.name} shifts course`,
          description: `The king commands the realm to ${kingdom.edict} and rallies their vassals.`,
        });
      }
    });
  }

  #applySeasonalDynamics() {
    const { season } = this.world.weather;

    if (season === 'Winter' && Math.random() < 0.45) {
      this.world.kingdoms.forEach((kingdom) => {
        kingdom.stores.food = Math.max(0, kingdom.stores.food - 6);
        kingdom.stores.water = Math.max(0, kingdom.stores.water - 4);
      });
      this.ecs.query(['Vitals']).forEach(({ id, Vitals }) => {
        Vitals.energy = Math.max(0, Vitals.energy - 4);
        Vitals.mood = Math.max(0, Vitals.mood - 2);
        this.ecs.addComponent(id, 'Vitals', Vitals);
      });
      this.addStoryEvent({ title: 'Winter blizzard', description: 'Blinding snowstorms drain supplies and sap the people’s strength.' });
    }

    if (season === 'Spring' && Math.random() < 0.5) {
      for (let i = 0; i < 5; i++) {
        const y = Math.floor(Math.random() * this.world.height);
        const x = Math.floor(Math.random() * this.world.width);
        this.world.tiles[y][x].resources += 1;
      }
      this.ecs.query(['Lineage']).forEach(({ id, Lineage }) => {
        Lineage.fertilityCooldown = Math.max(0, Lineage.fertilityCooldown - 10);
        this.ecs.addComponent(id, 'Lineage', Lineage);
      });
      this.addStoryEvent({ title: 'Spring growth', description: 'Fresh shoots refill the wilds and families feel new momentum.' });
    }

    const hosts = [];
    this.world.kingdoms.forEach((kingdom) => {
      const lastSeason = this.lastFestivalSeason.get(kingdom.id);
      if (lastSeason === season) return;
      if (kingdom.stores.food < 30 || kingdom.stores.water < 30) return;
      if (Math.random() < 0.35) {
        kingdom.stores.food = Math.max(0, kingdom.stores.food - 5);
        kingdom.stores.water = Math.max(0, kingdom.stores.water - 3);
        kingdom.diplomacy += 0.4;
        kingdom.influence = Math.min(1, kingdom.influence + 0.03);
        this.lastFestivalSeason.set(kingdom.id, season);
        hosts.push(kingdom.name);
        this.#boostMorale(kingdom.id, 3.5);
      }
    });

    if (hosts.length > 0) {
      this.addStoryEvent({
        title: 'Seasonal festivals',
        description: `${hosts.join(' & ')} host lantern nights that raise spirits and diplomatic clout.`,
      });
    }
  }

  #updateDiplomacyAndTrade() {
    const processed = new Set();
    const day = this.world.time.day;
    this.world.kingdoms.forEach((kingdom) => {
      const relations = this.world.relationships.get(kingdom.id);
      if (!relations) return;

      for (const [otherId, relation] of relations.entries()) {
        const key = [kingdom.id, otherId].sort().join('-');
        if (processed.has(key)) continue;
        const other = this.world.kingdoms.find((k) => k.id === otherId);
        if (!other) continue;
        processed.add(key);

        const seatDistance = Math.hypot(kingdom.seat.x - other.seat.x, kingdom.seat.y - other.seat.y);
        const attitudeDrift = (kingdom.diplomacy - other.diplomacy) * 0.01 - (kingdom.military - other.military) * 0.005 - seatDistance * 0.001;
        relation.attitude = clamp(relation.attitude + attitudeDrift, -1, 1);

        let treaty = 'neutral';
        if (relation.attitude > 0.35) {
          treaty = 'alliance';
        } else if (relation.attitude < -0.3) {
          treaty = 'embargo';
        } else if (kingdom.wealth > other.wealth * 1.2 && relation.attitude > 0.1) {
          treaty = 'tribute';
        }
        relation.treaty = treaty;

        const reverse = this.world.relationships.get(otherId)?.get(kingdom.id);
        if (reverse) {
          reverse.attitude = relation.attitude;
          reverse.treaty = treaty;
        }

        const canTrade = treaty !== 'embargo' && relation.lastTradeDay !== day && Math.random() < 0.4;
        if (canTrade) {
          const foodFlow = Math.max(-3, Math.min(3, Math.round((kingdom.stores.food - other.stores.food) / 12)));
          const waterFlow = Math.max(-3, Math.min(3, Math.round((kingdom.stores.water - other.stores.water) / 12)));
          if (foodFlow > 0) {
            const amount = Math.min(foodFlow, kingdom.stores.food);
            kingdom.stores.food -= amount;
            other.stores.food += amount;
          } else if (foodFlow < 0) {
            const amount = Math.min(Math.abs(foodFlow), other.stores.food);
            other.stores.food -= amount;
            kingdom.stores.food += amount;
          }

          if (waterFlow > 0) {
            const amount = Math.min(waterFlow, kingdom.stores.water);
            kingdom.stores.water -= amount;
            other.stores.water += amount;
          } else if (waterFlow < 0) {
            const amount = Math.min(Math.abs(waterFlow), other.stores.water);
            other.stores.water -= amount;
            kingdom.stores.water += amount;
          }
          relation.attitude = clamp(relation.attitude + 0.08, -1, 1);
          kingdom.diplomacy += 0.1;
          other.diplomacy += 0.08;
          relation.lastTradeDay = day;
          if (reverse) reverse.lastTradeDay = day;
          this.addStoryEvent({
            title: 'Trade caravan',
            description: `${kingdom.name} caravans exchange supplies with ${other.name}, boosting ties.`,
          });
        }
      }
    });
  }

  #evaluateObjectives() {
    let changed = false;
    const godObjective = this.objectives.god;
    if (godObjective && !godObjective.completed) {
      const previous = godObjective.progress;
      if (this.lastAverageMood >= 65) {
        this.godMoodStreak += 1;
        godObjective.progress = Math.min(godObjective.target, this.godMoodStreak);
        if (godObjective.progress >= godObjective.target) godObjective.completed = true;
      } else {
        this.godMoodStreak = 0;
        godObjective.progress = 0;
      }
      changed = changed || previous !== godObjective.progress || godObjective.completed;
    }

    if (changed) {
      this.#emitObjectives();
    }
  }

  #boostMorale(kingdomId, amount) {
    this.ecs.query(['Brain', 'Vitals']).forEach(({ id, Brain, Vitals }) => {
      if (Brain.kingdom !== kingdomId) return;
      Vitals.mood = clamp(Vitals.mood + amount, 0, 100);
      this.ecs.addComponent(id, 'Vitals', Vitals);
    });
  }

  #applyDailyUpkeep() {
    const citizens = this.ecs.query(['Brain', 'Vitals', 'Lineage', 'Identity', 'Position']);
    const byKingdom = new Map();
    let totalMood = 0;
    let moodCount = 0;

    citizens.forEach((bundle) => {
      const kingdomId = bundle.Brain.kingdom;
      if (!byKingdom.has(kingdomId)) byKingdom.set(kingdomId, []);
      byKingdom.get(kingdomId).push(bundle);
    });

    const pendingDeaths = [];

    for (const [kingdomId, members] of byKingdom.entries()) {
      const kingdom = this.world.kingdoms.find((k) => k.id === kingdomId);
      const stores = kingdom?.stores || this.nomadStores.get(kingdomId) || { food: 25, water: 25 };
      const needFood = members.length * 1;
      const needWater = members.length * 1;

      const consumedFood = Math.min(stores.food, needFood);
      const consumedWater = Math.min(stores.water, needWater);
      stores.food -= consumedFood;
      stores.water -= consumedWater;

      if (kingdom) {
        kingdom.stores = stores;
      } else {
        this.nomadStores.set(kingdomId, stores);
      }

      const shortageRatio = (needFood + needWater - (consumedFood + consumedWater)) / Math.max(1, needFood + needWater);

      members.forEach(({ id, Vitals, Lineage, Identity }) => {
        if (shortageRatio > 0) {
          Vitals.energy = Math.max(0, Vitals.energy - shortageRatio * 20);
          Vitals.mood = Math.max(0, Vitals.mood - shortageRatio * 15);
          if (Math.random() < shortageRatio * 0.35 || Vitals.energy <= 0) {
            pendingDeaths.push({ id, reason: 'starvation' });
            return;
          }
        }

        const oldAgeThreshold = 75;
        if (Lineage.ageDays > oldAgeThreshold) {
          const ageRisk = Math.min(0.8, (Lineage.ageDays - oldAgeThreshold) / 80);
          if (Math.random() < ageRisk) {
            pendingDeaths.push({ id, reason: 'old age' });
          }
        }
        const stage = getLifeStage(Lineage.ageDays);
        if (Identity.lifeStage !== stage) {
          this.ecs.addComponent(id, 'Identity', { ...Identity, lifeStage: stage });
        }
        totalMood += Vitals.mood;
        moodCount += 1;
        this.ecs.addComponent(id, 'Vitals', Vitals);
      });
    }

    pendingDeaths.forEach(({ id, reason }) => this.#reapCitizen(id, reason));
    this.lastAverageMood = moodCount > 0 ? totalMood / moodCount : 0;
  }
}
