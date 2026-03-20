const test = require('node:test');
const assert = require('node:assert/strict');
const { Blackboard } = require('../src/core/blackboard');
const { Logger } = require('../src/core/logger');
const { HomeService } = require('../src/services/home_service');

function vec(x, y, z) {
  return {
    x, y, z,
    clone() { return vec(this.x, this.y, this.z); },
    distanceTo(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  };
}

test('scanStationsNear searches around anchor and deduplicates results', () => {
  const bb = new Blackboard();
  const home = new HomeService(bb, new Logger('Test'));
  const anchor = vec(10, 64, 10);
  home.setAnchor(anchor);

  const calls = [];
  const chestPos = vec(11, 64, 10);
  const bot = {
    entity: { position: vec(0, 64, 0) },
    findBlocks(opts) {
      calls.push(opts);
      if (opts.matching({ name: 'chest' })) return [chestPos, chestPos.clone()];
      return [];
    },
    blockAt(pos) {
      return { position: pos, name: 'chest' };
    }
  };

  const summary = home.scanStationsNear(bot, 25, { reset: true });
  assert.equal(summary.chests, 1);
  assert.deepEqual(bb.get('base.chests').map((p) => [p.x, p.y, p.z]), [[11, 64, 10]]);
  assert.equal(calls[0].point, anchor);
});
