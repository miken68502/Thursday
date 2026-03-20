class SustainabilityService {
  constructor({ blackboard, logger, jobs, priorities }) {
    this.blackboard = blackboard;
    this.logger = logger.child('SustainabilityService');
    this.jobs = jobs;
    this.priorities = priorities;
    this.enabled = false;
    this.lastRunTick = 0;
    this.cooldownTicks = 120;
    this.stockTargets = {
      bread: 16,
      coal: 32,
      oak_log: 64,
      wheat_seeds: 16
    };
  }

  setEnabled(value) {
    this.enabled = !!value;
    this.blackboard.patch('checkpoints.sustainability.enabled', this.enabled);
  }

  status() {
    return {
      enabled: this.enabled,
      targets: this.stockTargets,
      lastRunTick: this.lastRunTick
    };
  }

  count(summary, item) {
    return summary?.[item] || 0;
  }

  buildMissingStock(summary = {}) {
    const missing = {};
    for (const [item, target] of Object.entries(this.stockTargets)) {
      const have = this.count(summary, item);
      if (have < target) missing[item] = target - have;
    }
    return missing;
  }

  buildJobsForMissing(missing) {
    const jobs = [];
    if (missing.coal) jobs.push(new this.jobs.MineResourceJob({ resource: 'coal', amount: Math.min(64, missing.coal) }));
    if (missing.oak_log) jobs.push(new this.jobs.GatherWoodJob({ amount: Math.min(64, missing.oak_log), replant: true }));
    if (missing.bread) {
      jobs.push(new this.jobs.HarvestCropsJob());
      jobs.push(new this.jobs.PlantCropsJob());
      jobs.push(new this.jobs.CraftItemJob({ item: 'bread', amount: Math.ceil(missing.bread / 3) }));
    }
    return jobs;
  }

  maybeSchedule(tickCount, scheduler, inventorySummary) {
    if (!this.enabled) return { scheduled: false, reason: 'disabled' };
    if (tickCount - this.lastRunTick < this.cooldownTicks) return { scheduled: false, reason: 'cooldown' };

    const missing = this.buildMissingStock(inventorySummary || {});
    const needs = Object.keys(missing);
    if (!needs.length) return { scheduled: false, reason: 'stock_ok' };

    const subJobs = this.buildJobsForMissing(missing);
    if (!subJobs.length) return { scheduled: false, reason: 'no_plan' };

    const id = scheduler.enqueue(new this.jobs.JobSequenceJob({ jobs: subJobs }), {
      priority: this.priorities.inventoryMaintenance
    });
    this.lastRunTick = tickCount;
    this.blackboard.patch('checkpoints.sustainability.lastSchedule', { tickCount, missing, id, ts: Date.now() });
    this.logger.info('Sustainability sequence scheduled', { id, missing, subJobs: subJobs.map((j) => j.type) });
    return { scheduled: true, id, missing };
  }
}

module.exports = { SustainabilityService };
