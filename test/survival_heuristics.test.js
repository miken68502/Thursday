const test = require('node:test');
const assert = require('node:assert/strict');

const { UtilityBrain } = require('../src/brain/utility');
const { GuardPlayerJob } = require('../src/jobs/guard_player_job');

class SilentLogger {
  child() { return this; }
  info() {}
}

test('utility retreat score rises sharply at critical health', () => {
  const brain = new UtilityBrain({ logger: new SilentLogger(), interruptRules: { evaluate: () => null } });

  const base = brain.score({
    survival: { health: 20, food: 20, threatLevel: 4 },
    inventory: { fullness: 0.2, pressure: { lowFreeSlots: false, hasJunk: false } },
    lastProgressAgeMs: 1000,
    time: 1000,
    activeJob: null
  });

  const critical = brain.score({
    survival: { health: 6, food: 20, threatLevel: 4 },
    inventory: { fullness: 0.2, pressure: { lowFreeSlots: false, hasJunk: false } },
    lastProgressAgeMs: 1000,
    time: 1000,
    activeJob: null
  });

  assert.ok(critical.retreat > base.retreat);
  assert.ok(critical.defendSelf < base.defendSelf);
});

test('guard job fails fast with retreat hint on low health', async () => {
  const job = new GuardPlayerJob();
  const result = await job.step({
    blackboard: { get: () => 6 },
    bot: { health: 6, players: {} },
    services: { combat: {} },
    data: { hostileCatalog: [] }
  }, { cancelled: false });

  assert.equal(result.ok, false);
  assert.equal(result.details.reason, 'retreat_low_health');
  assert.equal(result.nextHint, 'fallback_retreat');
});
