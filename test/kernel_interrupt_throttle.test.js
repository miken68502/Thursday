const test = require('node:test');
const assert = require('node:assert/strict');

const { Kernel } = require('../src/core/kernel');

class SilentLogger {
  child() { return this; }
  info() {}
  warn() {}
  error() {}
}

function makeKernel({ decision }) {
  const scheduler = {
    active: null,
    queued: [],
    enqueued: 0,
    isActiveType() { return false; },
    hasQueuedType() { return false; },
    interruptWith() { this.enqueued += 1; },
    async tick() {}
  };

  const stateMachine = { transition() { return true; } };
  const watchdog = { async tick() {} };
  const perceptionService = { async update() {} };
  const decisionContext = { build() { return { home: {}, inventory: {}, survival: {} }; } };
  const utilityBrain = { chooseInterrupt() { return decision; } };
  const blackboard = { snapshot() { return {}; } };

  const kernel = new Kernel({
    bot: {},
    blackboard,
    logger: new SilentLogger(),
    scheduler,
    stateMachine,
    watchdog,
    perceptionService,
    decisionContext,
    utilityBrain,
    runtimeContext: {}
  });

  return { kernel, scheduler };
}

test('kernel uses decision-specific cooldown for repeated threat interrupts', async () => {
  const decision = {
    reason: 'threat_detected',
    cooldownMs: 4000,
    interruptJob: { job: { type: 'GuardPlayerJob' }, options: { priority: 90 } }
  };

  const { kernel, scheduler } = makeKernel({ decision });

  const realNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    await kernel.tick();
    assert.equal(scheduler.enqueued, 1);

    now += 1000;
    await kernel.tick();
    assert.equal(scheduler.enqueued, 1);

    now += 3501;
    await kernel.tick();
    assert.equal(scheduler.enqueued, 2);
  } finally {
    Date.now = realNow;
  }
});

test('kernel still blocks duplicate active or queued interrupt jobs', async () => {
  const decision = {
    reason: 'threat_detected',
    cooldownMs: 10,
    interruptJob: { job: { type: 'GuardPlayerJob' }, options: { priority: 90 } }
  };

  const { kernel, scheduler } = makeKernel({ decision });
  scheduler.isActiveType = () => true;

  await kernel.tick();
  assert.equal(scheduler.enqueued, 0);

  scheduler.isActiveType = () => false;
  scheduler.hasQueuedType = () => true;

  await kernel.tick();
  assert.equal(scheduler.enqueued, 0);
});
