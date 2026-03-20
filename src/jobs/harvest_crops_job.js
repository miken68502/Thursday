const { BaseJob } = require('./base_job');
const { digBlockAction } = require('../actions/dig_block');

class HarvestCropsJob extends BaseJob {
  constructor(params = {}) {
    super('HarvestCropsJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    this.currentStepId = 'find_mature_crop';
    const mature = context.services.world.findMatureCrops(this.params.maxDistance || 16);
    if (!mature.length) return this.stepResult(true, 'DONE', false, { harvested: 0 });

    this.currentStepId = 'harvest_crop';
    const res = await digBlockAction(context, mature[0]);
    if (!res.ok) return res;

    return this.stepResult(true, 'SUCCESS', false, { harvested: 1 }, 'continue_harvest');
  }
}

module.exports = { HarvestCropsJob };
