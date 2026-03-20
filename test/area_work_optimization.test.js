const test = require('node:test');
const assert = require('node:assert/strict');

const { ClearAreaJob } = require('../src/jobs/clear_area_job');

function pos(x, y, z) {
  return {
    x, y, z,
    offset(dx, dy, dz) { return pos(this.x + dx, this.y + dy, this.z + dz); },
    distanceTo(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  };
}

test('clear area job uses batch anchor movement and nearest dequeue', async () => {
  const bot = {
    entity: { position: pos(0, 0, 0) },
    dig: async () => {},
    pathfinder: { goto: async () => {} }
  };

  const world = {
    buildAreaWorkQueue() {
      return [
        { action: 'break', block: { name: 'stone', position: pos(5, 0, 0) } },
        { action: 'break', block: { name: 'stone', position: pos(1, 0, 0) } }
      ];
    },
    computeBatchAnchor() { return pos(2, 0, 0); },
    nearestWorkItem(queue) { return queue.splice(1, 1)[0] || queue.shift(); },
    collectDrops: async () => ({ ok: true, code: 'SUCCESS', retryable: false, details: { collected: 0 } })
  };

  const context = {
    bot,
    services: {
      world,
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      inventory: { inventoryPressure: () => ({ lowFreeSlots: false }) }
    }
  };

  const job = new ClearAreaJob({ batchSize: 2, radius: 3 });
  const r = await job.step(context, { cancelled: false });
  assert.equal(r.ok, true);
  assert.equal(['SUCCESS', 'DONE'].includes(r.code), true);
  assert.equal(job.batchBudget <= 1, true);
});
