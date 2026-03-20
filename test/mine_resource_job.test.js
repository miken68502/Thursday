const test = require('node:test');
const assert = require('node:assert/strict');

const { MineResourceJob } = require('../src/jobs/mine_resource_job');
const { Blackboard } = require('../src/core/blackboard');

test('mine job returns DONE when goal already met', async () => {
  const job = new MineResourceJob({ resource: 'coal', amount: 0 });
  const context = {
    bot: {},
    blackboard: new Blackboard(),
    data: { resourceCatalog: { coal: ['coal_ore'] } },
    services: { world: { findBlocksByNames: () => [] } },
    recovery: { recover: async () => ({ ok: false, code: 'FAILED', retryable: false, details: {} }) }
  };

  const result = await job.step(context, { cancelled: false });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'DONE');
});

test('mine job invokes recovery and blacklists failed target', async () => {
  const blackboard = new Blackboard();
  let recovered = 0;

  const job = new MineResourceJob({ resource: 'coal', amount: 1 });
  const context = {
    bot: {
      blockAt: () => ({ name: 'coal_ore', position: { x: 1, y: 2, z: 3 } })
    },
    blackboard,
    data: { resourceCatalog: { coal: ['coal_ore'] } },
    services: {
      world: { findBlocksByNames: () => [{ x: 1, y: 2, z: 3 }] },
      navigation: { moveToPosition: async () => ({ ok: false, code: 'NO_PATH', retryable: true, details: {} }) }
    },
    recovery: {
      recover: async (_ctx, failure) => {
        recovered += 1;
        return { ok: false, code: failure.code, retryable: true, details: {}, nextHint: 'retry' };
      }
    }
  };

  const result = await job.step(context, { cancelled: false });
  assert.equal(result.ok, false);
  assert.equal(result.retryable, true);
  assert.equal(recovered, 1);
  assert.equal(blackboard.isTargetBlacklisted('1:2:3'), false);

  // simulate NO_TARGET recovery response that triggers blacklist path
  context.recovery.recover = async () => ({ ok: false, code: 'NO_TARGET', retryable: true, details: {}, nextHint: 'new_target' });
  const result2 = await job.step(context, { cancelled: false });
  assert.equal(result2.ok, false);
  assert.equal(blackboard.isTargetBlacklisted('1:2:3'), true);
});


test('mine job prefers lower wood targets before higher ones', () => {
  const job = new MineResourceJob({ resource: 'wood', amount: 4 });
  const blackboard = new Blackboard();
  const context = {
    bot: {
      entity: {
        position: {
          x: 0,
          y: 64,
          z: 0,
          distanceTo(pos) {
            const dx = this.x - pos.x;
            const dy = this.y - pos.y;
            const dz = this.z - pos.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
          }
        }
      }
    },
    blackboard,
    services: {
      home: { isProtectedPosition: () => false }
    }
  };

  const selected = job.selectTarget(context, [
    { x: 1, y: 70, z: 0 },
    { x: 1, y: 66, z: 0 },
    { x: 1, y: 68, z: 0 }
  ]);

  assert.deepEqual(selected, { x: 1, y: 66, z: 0 });
});

test('mine job uses wider approach range for tall wood targets', () => {
  const job = new MineResourceJob({ resource: 'wood', amount: 4 });
  const context = {
    bot: {
      entity: {
        position: { x: 0, y: 64, z: 0 }
      }
    }
  };

  assert.equal(job.getApproachRange(context, { position: { x: 2, y: 69, z: 0 } }), 2);
  assert.equal(job.getApproachRange(context, { position: { x: 0, y: 74, z: 0 } }), 3);
  assert.equal(job.getApproachRange(context, { position: { x: 0, y: 64, z: 0 } }), 1);
});

test('mine job prefers collectblock plugin path when available', async () => {
  const job = new MineResourceJob({ resource: 'coal', amount: 1 });
  let collectBlockCalls = 0;
  let digs = 0;
  const context = {
    bot: {
      dig: async () => { digs += 1; },
      blockAt: () => ({ name: 'coal_ore', position: { x: 2, y: 12, z: 2 } }),
      entity: {
        position: {
          x: 0, y: 0, z: 0,
          distanceTo(pos) {
            const dx = this.x - pos.x;
            const dy = this.y - pos.y;
            const dz = this.z - pos.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
          }
        }
      }
    },
    blackboard: new Blackboard(),
    data: { resourceCatalog: { coal: ['coal_ore'] } },
    services: {
      world: {
        findBlocksByNames: () => [{ x: 2, y: 12, z: 2 }],
        collectBlock: async () => {
          collectBlockCalls += 1;
          return { ok: true, code: 'SUCCESS', retryable: false };
        }
      },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      inventory: { equipBestTool: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) }
    },
    recovery: { recover: async () => ({ ok: false, code: 'FAILED', retryable: false, details: {} }) },
    logger: { child() { return this; }, info() {}, warn() {}, debug() {} }
  };

  const result = await job.step(context, { cancelled: false });
  assert.equal(result.ok, true);
  assert.equal(collectBlockCalls, 1);
  assert.equal(digs, 0);
});

test('mine job can use collectblock vein batches for wood progress', async () => {
  const job = new MineResourceJob({ resource: 'wood', amount: 4 });
  const context = {
    bot: {
      blockAt: () => ({ name: 'oak_log', position: { x: 2, y: 65, z: 2 } }),
      entity: {
        position: {
          x: 0, y: 64, z: 0,
          distanceTo(pos) {
            const dx = this.x - pos.x;
            const dy = this.y - pos.y;
            const dz = this.z - pos.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
          }
        }
      }
    },
    blackboard: new Blackboard(),
    data: { resourceCatalog: { wood: ['oak_log'] } },
    services: {
      world: {
        findBlocksByNames: () => [{ x: 2, y: 65, z: 2 }],
        findFromVein: () => [
          { name: 'oak_log', position: { x: 2, y: 65, z: 2 } },
          { name: 'oak_log', position: { x: 2, y: 66, z: 2 } },
          { name: 'oak_log', position: { x: 2, y: 67, z: 2 } }
        ],
        collectBlockBatch: async () => ({ ok: true, code: 'SUCCESS', retryable: false, details: { collected: 3 } }),
        collectBlock: async () => ({ ok: true, code: 'SUCCESS', retryable: false, details: { collected: 1 } })
      },
      home: { isProtectedPosition: () => false },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      inventory: { equipBestTool: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) }
    },
    recovery: { recover: async () => ({ ok: false, code: 'FAILED', retryable: false, details: {} }) },
    logger: { child() { return this; }, info() {}, warn() {}, debug() {} }
  };

  const result = await job.step(context, { cancelled: false });
  assert.equal(result.ok, true);
  assert.equal(result.details.progress, 3);
});


test('mine job search movement is progress not a retryable failure', async () => {
  const job = new MineResourceJob({ resource: 'sand', amount: 8 });
  const blackboard = new Blackboard();
  const context = {
    bot: {
      entity: {
        position: {
          x: 0,
          y: 64,
          z: 0,
          distanceTo(pos) {
            const dx = this.x - pos.x;
            const dy = this.y - pos.y;
            const dz = this.z - pos.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
          }
        }
      }
    },
    blackboard,
    data: { resourceCatalog: { sand: ['sand', 'red_sand'] } },
    services: {
      world: { findBlocksByNames: () => [] },
      home: { getProtectionRadius: () => 25, getAnchor: () => ({ x: 0, y: 64, z: 0 }) },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false, details: {} }) }
    },
    recovery: { recover: async () => ({ ok: false, code: 'FAILED', retryable: false, details: {} }) },
    logger: { child() { return this; }, info() {}, warn() {} }
  };

  const result = await job.step(context, { cancelled: false });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'SUCCESS');
  assert.equal(result.details.code, 'SEARCHING');
  assert.equal(result.retryable, false);
});

test('mine job search points include diagonals and more than first ring', () => {
  const job = new MineResourceJob({ resource: 'sand', amount: 8 });
  const points = job.getSearchPoints({
    services: { home: { getProtectionRadius: () => 25, getAnchor: () => ({ x: 0, y: 64, z: 0 }) } },
    bot: { entity: { position: { x: 0, y: 64, z: 0 } } }
  });

  assert.equal(points.some((p) => p.label.startsWith('north_east_')), true);
  assert.equal(points.length >= 24, true);
});
