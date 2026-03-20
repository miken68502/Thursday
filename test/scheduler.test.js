const test = require('node:test');
const assert = require('node:assert/strict');

const { Scheduler } = require('../src/core/scheduler');
const { Blackboard } = require('../src/core/blackboard');

class SilentLogger {
  child() { return this; }
  info() {}
  warn() {}
  error() {}
  debug() {}
}

test('scheduler retries retryable job and then completes', async () => {
  const blackboard = new Blackboard();
  const scheduler = new Scheduler(blackboard, new SilentLogger());

  let calls = 0;
  const job = {
    type: 'RetryJob',
    currentStepId: null,
    async step() {
      calls += 1;
      if (calls === 1) return { ok: false, code: 'NO_PATH', retryable: true, details: {} };
      return { ok: true, code: 'DONE', retryable: false, details: {} };
    }
  };

  scheduler.enqueue(job, { maxRetries: 2 });
  await scheduler.tick({});
  assert.equal(calls, 1);
  assert.ok(scheduler.active);

  await scheduler.tick({});
  assert.equal(calls, 2);
  assert.equal(scheduler.active, null);
  assert.equal(blackboard.get('activeJob.type'), null);
});

test('scheduler records failure and enqueues fallback when retries exhausted', async () => {
  const blackboard = new Blackboard();
  const scheduler = new Scheduler(blackboard, new SilentLogger());

  const fallbackJob = {
    type: 'FallbackJob',
    async step() {
      return { ok: true, code: 'DONE', retryable: false, details: {} };
    }
  };

  const badJob = {
    type: 'BadJob',
    async step() {
      return { ok: false, code: 'FAILED', retryable: false, details: { why: 'x' } };
    }
  };

  scheduler.enqueue(badJob, {
    fallbackFactory: () => ({ job: fallbackJob, options: { priority: 1 } })
  });

  await scheduler.tick({});
  assert.equal(blackboard.get('recentFailures').length, 1);
  assert.equal(scheduler.queue.length, 1);
  assert.equal(scheduler.queue[0].job.type, 'FallbackJob');
});

test('scheduler interrupt cancels active token and starts higher priority job', async () => {
  const blackboard = new Blackboard();
  const scheduler = new Scheduler(blackboard, new SilentLogger());

  const longJob = {
    type: 'LongJob',
    async step() {
      return { ok: false, code: 'FAILED', retryable: true, details: {} };
    }
  };

  const urgentJob = {
    type: 'UrgentJob',
    async step() {
      return { ok: true, code: 'DONE', retryable: false, details: {} };
    }
  };

  scheduler.enqueue(longJob, { priority: 1 });
  await scheduler.tick({});

  const activeToken = scheduler.active.token;
  scheduler.interruptWith(urgentJob, { priority: 99 });
  assert.equal(activeToken.cancelled, true);
  assert.equal(scheduler.active, null);

  await scheduler.tick({});
  assert.equal(scheduler.active, null);
  assert.equal(scheduler.isActiveType('UrgentJob'), false);
});


test('cancelActive stores sequence snapshot when job supports snapshot()', async () => {
  const blackboard = new Blackboard();
  const scheduler = new Scheduler(blackboard, new SilentLogger());

  const job = {
    type: 'JobSequenceJob',
    snapshot() { return { type: 'JobSequenceJob', index: 1, total: 3 }; },
    async step() { return { ok: false, code: 'FAILED', retryable: true, details: {} }; }
  };

  scheduler.enqueue(job, { priority: 1, id: 'seq-cancel-1' });
  await scheduler.tick({});
  scheduler.cancelActive('manual');

  const seq = blackboard.get('checkpoints.sequence', {});
  assert.equal(seq['seq-cancel-1'].status, 'cancelled');
  assert.equal(blackboard.get('checkpoints.lastSequenceId'), 'seq-cancel-1');
});


test('hasQueuedType detects queued job type and clears after dequeue', async () => {
  const blackboard = new Blackboard();
  const scheduler = new Scheduler(blackboard, new SilentLogger());

  const queuedJob = {
    type: 'GuardPlayerJob',
    async step() {
      return { ok: true, code: 'DONE', retryable: false, details: {} };
    }
  };

  scheduler.enqueue(queuedJob, { priority: 10 });
  assert.equal(scheduler.hasQueuedType('GuardPlayerJob'), true);

  await scheduler.tick({});
  assert.equal(scheduler.hasQueuedType('GuardPlayerJob'), false);
});
