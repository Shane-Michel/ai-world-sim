export class ECS {
  constructor() {
    this.nextId = 1;
    this.entities = new Map();
    this.components = new Map();
  }

  createEntity(initial = {}) {
    const id = this.nextId++;
    this.entities.set(id, { id, ...initial });
    return id;
  }

  addComponent(entityId, name, data) {
    if (!this.components.has(name)) {
      this.components.set(name, new Map());
    }
    this.components.get(name).set(entityId, data);
  }

  removeComponent(entityId, name) {
    if (this.components.has(name)) {
      this.components.get(name).delete(entityId);
    }
  }

  getComponent(entityId, name) {
    return this.components.get(name)?.get(entityId);
  }

  query(componentNames) {
    if (componentNames.length === 0) return [];
    const [first, ...rest] = componentNames;
    const base = this.components.get(first) || new Map();
    const results = [];
    for (const [entityId, firstData] of base.entries()) {
      let match = true;
      const bundle = { id: entityId, [first]: firstData };
      for (const name of rest) {
        const data = this.components.get(name)?.get(entityId);
        if (!data) {
          match = false;
          break;
        }
        bundle[name] = data;
      }
      if (match) {
        results.push(bundle);
      }
    }
    return results;
  }

  allEntities() {
    return Array.from(this.entities.values());
  }
}
