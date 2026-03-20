
const test = require('node:test');
const assert = require('node:assert/strict');

const { PrepareForJobJob } = require('../src/jobs/prepare_for_job_job');

function makeContext(overrides = {}) {
  const opened = [];
  const inventoryState = { items: [] };
  const context = {
    bot: {
      entity: { position: { x: 0, y: 64, z: 0 } },
      blockAt: (pos) => ({ position: pos, name: 'chest' })
    },
    blackboard: {
      get(path, fallback = null) {
        const map = {
          'base.anchor': { x: 0, y: 64, z: 0 },
          'base.chests': [{ x: 1, y: 64, z: 1 }],
          'home.chests': [{ x: 1, y: 64, z: 1 }]
        };
        return path in map ? map[path] : fallback;
      },
      recordProgress() {}
    },
    services: {
      home: {
        getAnchor: () => ({ x: 0, y: 64, z: 0 }),
        getKnownChests: () => [{ x: 1, y: 64, z: 1 }]
      },
      inventory: {
        getSummary: () => ({ fullness: 0.1, summary: Object.fromEntries(inventoryState.items.map((i) => [i.name, i.count])) }),
        hasEdibleFood: () => inventoryState.items.some((i) => i.name === 'bread'),
        openContainer: async (_block) => {
          opened.push('open');
          return { ok: true, details: { container: { close() {} } } };
        },
        withdrawItems: async (_container, req) => {
          if (req.name === 'bread') inventoryState.items.push({ name: 'bread', count: 8 });
          return { ok: req.name === 'bread' };
        }
      }
    }
  };
  return Object.assign(context, overrides, { inventoryState, opened });
}

test('prepare job does not scan duplicate mirrored chest lists twice', async () => {
  const context = makeContext();
  const job = new PrepareForJobJob({ profile: 'default' });
  const result = await job.tryWithdrawFoodFromKnownChests(context, 'default');
  assert.equal(result, true);
  assert.equal(context.opened.length, 1);
});

test('prepare job fails fast when return home fails', async () => {
  const context = makeContext({
    services: {
      home: { getAnchor: () => null, getKnownChests: () => [] },
      inventory: {
        getSummary: () => ({ fullness: 0.1, summary: {} }),
        hasEdibleFood: () => false,
        openContainer: async () => ({ ok: false })
      }
    }
  });
  const job = new PrepareForJobJob({ profile: 'default' });
  const result = await job.step(context, { cancelled: false });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'FAILED');
});

test('prepare job craft stage falls back through tool candidates until one crafts', async () => {
  const craftedAttempts = [];
  let hasIronPickaxe = false;
  const context = {
    bot: {
      entity: { position: { x: 0, y: 64, z: 0 } },
      blockAt: () => null
    },
    blackboard: {
      get: () => null,
      recordProgress() {}
    },
    services: {
      home: {
        getAnchor: () => ({ x: 0, y: 64, z: 0 }),
        scanStationsNear: () => {},
        getNearestKnownStation: () => null,
        getKnownChests: () => []
      },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      inventory: {
        getSummary: () => ({
          fullness: 0.1,
          summary: hasIronPickaxe ? { bread: 4, iron_pickaxe: 1 } : { bread: 4 }
        }),
        hasEdibleFood: () => true,
        openContainer: async () => ({ ok: false }),
        withdrawItems: async () => ({ ok: false })
      },
      crafting: {
        craft: async (req) => {
          craftedAttempts.push(req.item);
          if (req.item === 'iron_pickaxe') {
            hasIronPickaxe = true;
            return { ok: true, code: 'SUCCESS', retryable: false, details: {} };
          }
          return { ok: false, code: 'MISSING_MATERIALS', retryable: false, details: {} };
        }
      }
    }
  };

  const job = new PrepareForJobJob({ profile: 'mine' });
  const result = await job.step(context, { cancelled: false });
  assert.equal(result.ok, true);
  assert.equal(craftedAttempts[0], 'diamond_pickaxe');
  assert.equal(craftedAttempts.includes('iron_pickaxe'), true);
});
