const test = require('node:test');
const assert = require('node:assert/strict');

const { WorldService } = require('../src/services/world_service');

function vec(x, y, z) {
  return {
    x, y, z,
    distanceTo(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  };
}

function logger() {
  return { child() { return this; }, debug() {}, info() {}, warn() {} };
}

test('collectDrops uses nearestEntity loop and collects until exhausted', async () => {
  const queue = [
    { name: 'item', displayName: 'Coal', position: vec(1, 64, 0) },
    { name: 'item', displayName: 'Coal', position: vec(2, 64, 0) }
  ];
  let moves = 0;
  const bot = {
    entity: { position: vec(0, 64, 0) },
    nearestEntity: () => queue.shift() || null,
    pathfinder: {
      goto: async () => { moves += 1; }
    }
  };

  const service = new WorldService(bot, logger());
  const out = await service.collectDrops((drop) => drop.name === 'coal');
  assert.equal(out.ok, true);
  assert.equal(out.details.collected, 2);
  assert.equal(moves, 2);
});

test('collectDrops falls back to getDropsAround sorting when nearestEntity is unavailable', async () => {
  let movedTo = null;
  const bot = {
    entity: { position: vec(0, 64, 0) },
    entities: {
      a: { name: 'item', displayName: 'Cobblestone', position: vec(5, 64, 0) },
      b: { name: 'item', displayName: 'Cobblestone', position: vec(2, 64, 0) }
    },
    pathfinder: {
      goto: async (goal) => { movedTo = goal; throw new Error('blocked'); }
    }
  };

  const service = new WorldService(bot, logger());
  const out = await service.collectDrops();
  assert.equal(out.ok, true);
  assert.equal(out.details.collected, 0);
  assert.ok(movedTo);
});

test('collectDrops returns UNAVAILABLE when pathfinder is missing', async () => {
  const bot = {
    entity: { position: vec(0, 64, 0) },
    nearestEntity: () => null
  };
  const service = new WorldService(bot, logger());
  const out = await service.collectDrops();
  assert.equal(out.ok, false);
  assert.equal(out.code, 'UNAVAILABLE');
});
