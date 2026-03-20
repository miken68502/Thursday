const test = require('node:test');
const assert = require('node:assert/strict');

const { JobSequenceJob } = require('../src/jobs/job_sequence_job');

test('job sequence advances through subjobs and completes', async () => {
  const mk = (type) => ({ type, async step() { return { ok: true, code: 'DONE', retryable: false, details: {} }; } });
  const seq = new JobSequenceJob({ jobs: [mk('A'), mk('B')] });

  const r1 = await seq.step({}, { cancelled: false });
  assert.equal(r1.ok, true);
  assert.equal(r1.code, 'SUCCESS');

  const r2 = await seq.step({}, { cancelled: false });
  assert.equal(r2.ok, true);
  assert.equal(r2.code, 'DONE');
});


test('job sequence persists snapshot to blackboard checkpoints', async () => {
  const mk = (type) => ({ type, async step() { return { ok: true, code: 'DONE', retryable: false, details: {} }; } });
  const store = {};
  const blackboard = {
    get(path, fallback = null) {
      if (path === 'activeJob.id') return 'seq-1';
      if (path === 'checkpoints.sequence') return store.sequence || fallback || {};
      return fallback;
    },
    patch(path, value) {
      if (path === 'checkpoints.sequence') store.sequence = value;
      if (path === 'checkpoints.lastSequenceId') store.last = value;
    }
  };
  const seq = new JobSequenceJob({ jobs: [mk('A')] });
  await seq.step({ blackboard }, { cancelled: false });
  assert.equal(!!store.sequence['seq-1'], true);
  assert.equal(store.last, 'seq-1');
});
