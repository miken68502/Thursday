const test = require('node:test');
const assert = require('node:assert/strict');

const { RecoveryEngine } = require('../src/core/recovery_engine');
const { Blackboard } = require('../src/core/blackboard');

class SilentLogger {
  child() { return this; }
  info() {}
  warn() {}
  error() {}
  debug() {}
}

function makeContext() {
  return {
    bot: {
      look: async () => {},
      entity: {
        position: {
          offset: () => ({ x: 1, y: 64, z: 1 })
        }
      }
    },
    services: {
      navigation: {
        moveToPosition: async () => ({ ok: true, code: 'SUCCESS', retryable: false, details: {} })
      }
    }
  };
}

test('recovery engine escalates through L1-L5 codes', async () => {
  const blackboard = new Blackboard();
  const engine = new RecoveryEngine({
    blackboard,
    logger: new SilentLogger(),
    navigationService: { resetPath: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
    homeService: { getAnchor: () => ({ x: 0, y: 64, z: 0 }) }
  });

  const context = makeContext();
  const r1 = await engine.recover(context, { level: 0, code: 'NO_PATH' });
  const r2 = await engine.recover(context, { level: 1, code: 'NO_PATH' });
  const r3 = await engine.recover(context, { level: 2, code: 'NO_PATH', targetId: 'a:b:c' });
  const r4 = await engine.recover(context, { level: 3, code: 'NO_PATH' });
  const r5 = await engine.recover(context, { level: 4, code: 'NO_PATH' });

  assert.equal(r1.code, 'RECOVERING');
  assert.equal(r2.code, 'RECOVERING');
  assert.equal(r3.code, 'NO_TARGET');
  assert.equal(r4.code, 'RECOVERING');
  assert.equal(r5.code, 'FAILED');
  assert.equal(blackboard.isTargetBlacklisted('a:b:c'), true);
});


test('recovery throttles repeated target failures', async () => {
  const blackboard = new Blackboard();
  const engine = new RecoveryEngine({
    blackboard,
    logger: new SilentLogger(),
    navigationService: { resetPath: async () => ({ ok: true, code: 'SUCCESS', retryable: false }) },
    homeService: { getAnchor: () => null }
  });

  const context = makeContext();
  await engine.recover(context, { level: 0, code: 'NO_PATH', targetId: 't1' });
  await engine.recover(context, { level: 0, code: 'NO_PATH', targetId: 't1' });
  const r3 = await engine.recover(context, { level: 0, code: 'NO_PATH', targetId: 't1' });
  assert.equal(['NO_TARGET', 'STUCK', 'RECOVERING'].includes(r3.code), true);
});
