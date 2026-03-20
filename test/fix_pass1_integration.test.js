const test = require('node:test');
const assert = require('node:assert/strict');

const { Blackboard } = require('../src/core/blackboard');
const { Scheduler } = require('../src/core/scheduler');
const { JobSequenceJob } = require('../src/jobs/job_sequence_job');
const { FollowPlayerJob } = require('../src/jobs/follow_player_job');
const { GuardPlayerJob } = require('../src/jobs/guard_player_job');
const { Watchdog } = require('../src/core/watchdog');
const { PrepareForJobJob } = require('../src/jobs/prepare_for_job_job');
const { MineResourceJob } = require('../src/jobs/mine_resource_job');

class SilentLogger {
  child() { return this; }
  info() {}
  warn() {}
  error() {}
  debug() {}
}

const vec = (x, y, z) => ({
  x, y, z,
  distanceTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },
  offset(dx, dy, dz) { return vec(this.x + dx, this.y + dy, this.z + dz); }
});

test('prepare -> mine sequence success executes both steps', async () => {
  let prepCalled = 0;
  let mineCalled = 0;
  const prep = { type: 'PrepareForJobJob', step: async () => { prepCalled += 1; return { ok: true, code: 'DONE' }; } };
  const mine = { type: 'MineResourceJob', step: async () => { mineCalled += 1; return { ok: true, code: 'DONE' }; } };

  const seq = new JobSequenceJob({ jobs: [prep, mine] });
  const token = { cancelled: false };
  await seq.step({}, token);
  const out = await seq.step({}, token);
  assert.equal(out.code, 'DONE');
  assert.equal(prepCalled, 1);
  assert.equal(mineCalled, 1);
});

test('prepare failure prevents mine start in sequence', async () => {
  let mineCalled = 0;
  const prep = { type: 'PrepareForJobJob', step: async () => ({ ok: false, code: 'MISSING_TOOL', retryable: false }) };
  const mine = { type: 'MineResourceJob', step: async () => { mineCalled += 1; return { ok: true, code: 'DONE' }; } };
  const seq = new JobSequenceJob({ jobs: [prep, mine] });
  const out = await seq.step({}, { cancelled: false });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'MISSING_TOOL');
  assert.equal(mineCalled, 0);
});

test('follow job persists until cancelled', async () => {
  const job = new FollowPlayerJob({ scanIntervalMs: 0, followRadius: 2 });
  const blackboard = new Blackboard();
  blackboard.patch('designatedPlayer', 'Owner');
  const context = {
    blackboard,
    bot: {
      entity: { position: vec(0, 0, 0) },
      players: { Owner: { entity: { position: vec(10, 0, 0) } } }
    },
    services: {
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) }
    }
  };

  const r1 = await job.step(context, { cancelled: false });
  const r2 = await job.step(context, { cancelled: false });
  assert.equal(r1.ok, true);
  assert.equal(r1.code, 'SUCCESS');
  assert.equal(r2.code, 'SUCCESS');
});

test('guard job persists and resumes guard mode after threat handling', async () => {
  const job = new GuardPlayerJob({ scanIntervalMs: 0, guardRadius: 6 });
  const blackboard = new Blackboard();
  blackboard.patch('designatedPlayer', 'Owner');
  let firstThreat = true;
  const context = {
    blackboard,
    data: { hostileCatalog: ['zombie'] },
    bot: {
      health: 20,
      attack: () => {},
      entity: { position: vec(0, 0, 0) },
      players: { Owner: { entity: { position: vec(0, 0, 0) } } }
    },
    services: {
      inventory: { equipBestWeapon: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      combat: {
        getThreatNearPosition: () => {
          if (!firstThreat) return null;
          firstThreat = false;
          return { id: 1, name: 'zombie', position: vec(1, 0, 0) };
        }
      }
    }
  };

  const engaged = await job.step(context, { cancelled: false });
  const guarding = await job.step(context, { cancelled: false });
  assert.equal(engaged.code, 'SUCCESS');
  assert.equal(guarding.code, 'SUCCESS');
  assert.equal(guarding.details.reason, 'area_safe');
});

test('guard job passes hostile catalog to getThreatNearPosition in expected argument order', async () => {
  const job = new GuardPlayerJob({ scanIntervalMs: 0, guardRadius: 6 });
  const blackboard = new Blackboard();
  blackboard.patch('designatedPlayer', 'Owner');
  let callArgs = null;
  const context = {
    blackboard,
    data: { hostileCatalog: ['zombie', 'skeleton'] },
    bot: {
      health: 20,
      attack: () => {},
      entity: { position: vec(0, 0, 0) },
      players: { Owner: { entity: { position: vec(0, 0, 0) } } }
    },
    services: {
      inventory: { equipBestWeapon: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      combat: {
        getThreatNearPosition: (...args) => {
          callArgs = args;
          return null;
        }
      }
    }
  };

  const out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, true);
  assert.deepEqual(callArgs[0], ['zombie', 'skeleton']);
});

test('watchdog does not cancel healthy persistent jobs with heartbeat', async () => {
  const blackboard = new Blackboard();
  const scheduler = {
    active: { job: { type: 'FollowPlayerJob' } },
    cancelled: false,
    cancelActive() { this.cancelled = true; }
  };
  const watchdog = new Watchdog({ blackboard, logger: new SilentLogger(), scheduler });
  blackboard.patch('lastProgressTs', Date.now() - 200000);
  blackboard.patch('lastHeartbeatTs', Date.now());
  await watchdog.tick();
  assert.equal(scheduler.cancelled, false);
});

test('repeated mine target failures trigger blacklist and alternate target selection', async () => {
  const blackboard = new Blackboard();
  const posA = vec(1, 10, 1);
  const posB = vec(2, 10, 2);
  blackboard.recordPathFailure(posA, {});
  blackboard.recordPathFailure(posA, {});
  blackboard.recordPathFailure(posA, {});

  let digs = 0;
  const context = {
    blackboard,
    data: { resourceCatalog: { coal: ['coal_ore'] } },
    bot: {
      dig: async () => { digs += 1; },
      blockAt: (pos) => ({ name: 'coal_ore', position: pos }),
      entity: { position: vec(0, 0, 0) }
    },
    services: {
      world: {
        findBlocksByNames: () => [posA, posB],
        collectDrops: async () => ({ ok: true, code: 'SUCCESS', retryable: false }),
        logger: new SilentLogger()
      },
      navigation: { moveToPosition: async (pos) => ({ ok: true, code: 'SUCCESS', retryable: false, details: { pos } }) },
      inventory: { equipBestTool: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) }
    },
    recovery: { recover: async () => ({ ok: false, code: 'RECOVERING', retryable: true, nextHint: 'retry' }) }
  };

  const job = new MineResourceJob({ resource: 'coal', amount: 1 });
  const out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, true);
  assert.equal(digs, 1);
  assert.equal(blackboard.isPositionBlacklisted(posA), true);
});

test('PrepareForJobJob fails when tool/food remain unsatisfied', async () => {
  const job = new PrepareForJobJob({ profile: 'mine' });
  const context = {
    blackboard: new Blackboard(),
    bot: { entity: { position: vec(0, 0, 0) } },
    services: {
      home: {
        getAnchor: () => vec(0, 0, 0),
        getNearestKnownStation: () => null,
        getKnownChests: () => []
      },
      inventory: {
        getSummary: () => ({ usedSlots: 2, freeSlots: 34, fullness: 0.1, summary: { dirt: 2 } })
      },
      crafting: {
        craft: async () => ({ ok: false, code: 'MISSING_MATERIALS', retryable: false })
      },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) }
    }
  };

  let out;
  for (let i = 0; i < 4; i += 1) out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, false);
  assert.match(out.code, /MISSING_TOOL|MISSING_FOOD/);
});


test('PrepareForJobJob can pull required tool from known chest before crafting', async () => {
  const job = new PrepareForJobJob({ profile: 'mine' });
  const bb = new Blackboard();
  bb.patch('base.chests', [vec(3, 0, 3)]);
  let hasPickaxe = false;
  const context = {
    blackboard: bb,
    bot: { entity: { position: vec(0, 0, 0) }, blockAt: () => ({ name: 'chest' }) },
    services: {
      home: { getAnchor: () => vec(0, 0, 0), getNearestKnownStation: () => null, getKnownChests: () => [vec(3, 0, 3)] },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      inventory: {
        getSummary: () => ({ usedSlots: 2, freeSlots: 34, fullness: 0.1, summary: hasPickaxe ? { iron_pickaxe: 1, bread: 2 } : { bread: 2 } }),
        openContainer: async () => ({ ok: true, code: 'SUCCESS', retryable: false, details: { container: { close() {} } } }),
        withdrawItems: async (_container, request) => {
          if (/_pickaxe$/.test(request.name)) hasPickaxe = true;
          return { ok: true, code: 'SUCCESS', retryable: false, details: request };
        }
      },
      crafting: { craft: async () => ({ ok: false, code: 'MISSING_MATERIALS', retryable: false }) }
    }
  };

  let out;
  for (let i = 0; i < 4; i += 1) out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, true);
  assert.equal(out.code, 'DONE');
});


test('PrepareForJobJob uses profile-specific tool candidates', async () => {
  const job = new PrepareForJobJob({ profile: 'wood' });
  const bb = new Blackboard();
  bb.patch('base.chests', [vec(3, 0, 3)]);
  let hasAxe = false;
  const context = {
    blackboard: bb,
    bot: { entity: { position: vec(0, 0, 0) }, blockAt: () => ({ name: 'chest' }) },
    services: {
      home: { getAnchor: () => vec(0, 0, 0), getNearestKnownStation: () => null, getKnownChests: () => [vec(3, 0, 3)] },
      navigation: { moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
      inventory: {
        getSummary: () => ({ usedSlots: 2, freeSlots: 34, fullness: 0.1, summary: hasAxe ? { iron_axe: 1, bread: 2 } : { bread: 2 } }),
        openContainer: async () => ({ ok: true, code: 'SUCCESS', retryable: false, details: { container: { close() {} } } }),
        withdrawItems: async (_container, request) => {
          if (/_axe$/.test(request.name)) hasAxe = true;
          return { ok: /_axe$/.test(request.name), code: /_axe$/.test(request.name) ? 'SUCCESS' : 'FAILED', retryable: false, details: request };
        }
      },
      crafting: { craft: async () => ({ ok: false, code: 'MISSING_MATERIALS', retryable: false }) }
    }
  };

  let out;
  for (let i = 0; i < 4; i += 1) out = await job.step(context, { cancelled: false });
  assert.equal(out.ok, true);
  assert.equal(out.code, 'DONE');
});
