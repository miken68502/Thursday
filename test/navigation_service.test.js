const test = require('node:test');
const assert = require('node:assert/strict');

const { NavigationService } = require('../src/services/navigation_service');

function logger() {
  return { child() { return this; }, warn() {} };
}

test('navigation normalizes plain object positions to Vec3-compatible target', async () => {
  const bot = {
    pathfinder: {
      setMovements: () => {},
      goto: async () => {}
    }
  };
  const service = new NavigationService(bot, { worker_general: {} }, logger(), null);
  service.buildMovements = () => null;

  const out = await service.moveToPosition({ x: 10, y: 64, z: -5 }, { range: 2, profile: 'worker_general' });
  assert.equal(out.ok, true);
  assert.equal(out.code, 'SUCCESS');
});

test('navigation rejects invalid positions cleanly', async () => {
  const bot = {
    pathfinder: {
      setMovements: () => {},
      goto: async () => {}
    }
  };
  const service = new NavigationService(bot, { worker_general: {} }, logger(), null);
  service.buildMovements = () => null;

  const out = await service.moveToPosition({ x: 'a', y: 2, z: 3 });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'NO_TARGET');
});
