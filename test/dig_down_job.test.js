const test = require('node:test');
const assert = require('node:assert/strict');

const { DigDownJob } = require('../src/jobs/dig_down_job');

test('dig down returns DONE when already at target y', async () => {
  const job = new DigDownJob({ targetY: -64, direction: 'north' });
  const out = await job.step({
    bot: { entity: { position: { x: 0, y: -64, z: 0 } } }
  }, { cancelled: false });
  assert.equal(out.ok, true);
  assert.equal(out.code, 'DONE');
});

test('dig down clears and moves one step downward', async () => {
  const dug = [];
  const moved = [];
  const job = new DigDownJob({ targetY: -64, direction: 'north' });
  const context = {
    bot: {
      entity: { position: { x: 0, y: 10, z: 0 } },
      blockAt: (pos) => ({ name: 'stone', position: pos }),
      dig: async (block) => { dug.push(block.position); }
    },
    services: {
      world: {},
      inventory: { equipBestTool: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      navigation: {
        moveToPosition: async (pos) => {
          moved.push(pos);
          return { ok: true, code: 'SUCCESS', retryable: false };
        }
      }
    }
  };
  const out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, true);
  assert.equal(out.code, 'SUCCESS');
  assert.equal(dug.length, 8);
  assert.equal(moved.length, 1);
  assert.deepEqual(moved[0], { x: 0, y: 9, z: -1 });
});
