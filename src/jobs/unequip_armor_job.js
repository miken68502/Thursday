const { BaseJob } = require('./base_job');

class UnequipArmorJob extends BaseJob {
  constructor(params = {}) {
    super('UnequipArmorJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });
    this.currentStepId = 'unequip_drop_armor';
    const res = await context.services.inventory.unequipAndDropArmor();
    if (!res.ok) return res;
    context.blackboard.recordProgress({ jobType: this.type, stepId: this.currentStepId, dropped: res.details?.dropped || [] });
    return this.stepResult(true, 'DONE', false, res.details || {});
  }
}

module.exports = { UnequipArmorJob };
