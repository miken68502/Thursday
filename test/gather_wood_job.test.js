const test = require('node:test');
const assert = require('node:assert/strict');

const { GatherWoodJob } = require('../src/jobs/gather_wood_job');

test('gather wood replantAtTarget plants sapling on valid soil', async () => {
  const job = new GatherWoodJob({ replant: true });
  let placed = 0;
  const context = {
    bot: {
      blockAt: (pos) => {
        if (pos.y === 63) return { name: 'dirt' };
        if (pos.y === 64) return { name: 'air' };
        return null;
      },
      equip: async () => {},
      placeBlock: async (_block, faceVector) => {
        placed += 1;
        assert.equal(faceVector.y, 1);
      }
    },
    services: {
      inventory: {
        findBestInventoryItem: () => ({ name: 'oak_sapling', count: 1 })
      }
    }
  };

  const planted = await job.replantAtTarget(context, '5:64:8');
  assert.equal(planted, true);
  assert.equal(placed, 1);
});

test('gather wood replantAtTarget skips when placement spot is invalid', async () => {
  const job = new GatherWoodJob({ replant: true });
  const context = {
    bot: {
      blockAt: (pos) => {
        if (pos.y === 63) return { name: 'stone' };
        if (pos.y === 64) return { name: 'air' };
        return null;
      },
      equip: async () => {},
      placeBlock: async () => {
        throw new Error('should_not_place');
      }
    },
    services: {
      inventory: {
        findBestInventoryItem: () => ({ name: 'oak_sapling', count: 1 })
      }
    }
  };

  const planted = await job.replantAtTarget(context, '5:64:8');
  assert.equal(planted, false);
});
