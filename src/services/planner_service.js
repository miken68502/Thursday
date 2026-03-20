class PlannerService {
  constructor({ jobs, priorities, logger }) {
    this.jobs = jobs;
    this.priorities = priorities;
    this.logger = logger.child('PlannerService');
  }

  createPlan(goal) {
    if (!goal || goal.type !== 'craft' || !goal.item) return [];

    if (goal.item === 'iron_pickaxe') {
      return [
        { kind: 'EnsureItem', item: 'stick', amount: 2 },
        { kind: 'EnsureItem', item: 'iron_ingot', amount: 3 },
        { kind: 'CraftItem', item: 'iron_pickaxe', amount: 1 }
      ];
    }

    return [{ kind: 'CraftItem', item: goal.item, amount: goal.amount || 1 }];
  }

  planToSubJobs(plan) {
    const queue = [];
    for (const step of plan) {
      if (step.kind === 'EnsureItem' && step.item === 'iron_ingot') {
        queue.push(new this.jobs.SmeltItemsJob({ item: 'iron_ore', amount: step.amount }));
      } else if (step.kind === 'EnsureItem' && step.item === 'stick') {
        queue.push(new this.jobs.CraftItemJob({ item: 'stick', amount: step.amount }));
      } else if (step.kind === 'CraftItem') {
        queue.push(new this.jobs.CraftItemJob({ item: step.item, amount: step.amount || 1 }));
      }
    }
    return queue;
  }

  schedulePlan(goal, scheduler) {
    const plan = this.createPlan(goal);
    const subJobs = this.planToSubJobs(plan);
    const sequenceJob = new this.jobs.JobSequenceJob({ jobs: subJobs });
    const id = scheduler.enqueue(sequenceJob, { priority: this.priorities.playerCritical });
    this.logger.info('Plan scheduled', { goal, steps: plan, id, subJobs: subJobs.map((j) => j.type) });
    return { plan, ids: [id], sequenceType: sequenceJob.type };
  }
}

module.exports = { PlannerService };
