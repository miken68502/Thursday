const test = require('node:test');
const assert = require('node:assert/strict');

const { HarvestCropsJob } = require('../src/jobs/harvest_crops_job');

test('harvest crops prefers world collectBlock when available', async () => {
  let collectCalls = 0;
  const context = {
    services: {
      world: {
        findMatureCrops: () => [{ name: 'wheat', position: { x: 1, y: 64, z: 1 } }],
        collectBlock: async () => {
          collectCalls += 1;
          return { ok: true, code: 'SUCCESS', retryable: false };
        }
      }
    }
  };

  const job = new HarvestCropsJob();
  const out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, true);
  assert.equal(out.code, 'SUCCESS');
  assert.equal(collectCalls, 1);
});

test('harvest crops falls back to dig when collectBlock is unavailable', async () => {
  let digs = 0;
  const context = {
    bot: {
      dig: async () => { digs += 1; }
    },
    services: {
      world: {
        findMatureCrops: () => [{ name: 'wheat', position: { x: 1, y: 64, z: 1 } }]
      }
    }
  };

  const job = new HarvestCropsJob();
  const out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, true);
  assert.equal(digs, 1);
});

test('harvest crops respects home protection before collecting', async () => {
  let collectCalls = 0;
  const context = {
    services: {
      world: {
        findMatureCrops: () => [{ name: 'wheat', position: { x: 1, y: 64, z: 1 } }],
        collectBlock: async () => {
          collectCalls += 1;
          return { ok: true, code: 'SUCCESS', retryable: false };
        }
      },
      home: { isProtectedPosition: () => true, getProtectionRadius: () => 25 }
    }
  };

  const job = new HarvestCropsJob();
  const out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'HOME_PROTECTED');
  assert.equal(collectCalls, 0);
});
