const test = require('node:test');
const assert = require('node:assert/strict');

const { PlannerService } = require('../src/services/planner_service');

class SilentLogger {
  child() { return this; }
  info() {}
}

test('planner builds iron pickaxe prerequisite chain', () => {
  const planner = new PlannerService({ jobs: {}, priorities: {}, logger: new SilentLogger() });
  const plan = planner.createPlan({ type: 'craft', item: 'iron_pickaxe', amount: 1 });
  assert.equal(plan.length, 3);
  assert.equal(plan[0].item, 'stick');
  assert.equal(plan[1].item, 'iron_ingot');
  assert.equal(plan[2].kind, 'CraftItem');
});


test('planner schedules a JobSequenceJob wrapper', () => {
  const jobs = {
    JobSequenceJob: class { constructor(params) { this.type = 'JobSequenceJob'; this.params = params; } },
    SmeltItemsJob: class { constructor(params) { this.type = 'SmeltItemsJob'; this.params = params; } },
    CraftItemJob: class { constructor(params) { this.type = 'CraftItemJob'; this.params = params; } }
  };
  const planner = new PlannerService({ jobs, priorities: { playerCritical: 70 }, logger: new SilentLogger() });
  let queued;
  const scheduler = { enqueue(job) { queued = job; return 'id-1'; } };
  const result = planner.schedulePlan({ type: 'craft', item: 'iron_pickaxe', amount: 1 }, scheduler);
  assert.equal(result.sequenceType, 'JobSequenceJob');
  assert.equal(queued.type, 'JobSequenceJob');
  assert.equal(queued.params.jobs.length, 3);
});
