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
    const target = mature[0];
    const home = context.services.home;
    if (home?.isProtectedPosition?.(target?.position)) {
      return this.stepResult(false, 'HOME_PROTECTED', false, {
        block: target?.name,
        position: target?.position,
        radius: home.getProtectionRadius?.() ?? 25
      });
    }

    this.currentStepId = 'harvest_crop';
    let res = null;
    if (typeof context.services.world.collectBlock === 'function') {
      res = await context.services.world.collectBlock(target, { ignoreNoPath: true });
    }
    if (!res || !res.ok) {
      res = await digBlockAction(context, target);
    }
    if (!res.ok) return res;

    return this.stepResult(true, 'SUCCESS', false, { harvested: 1 }, 'continue_harvest');
  }
}

module.exports = { HarvestCropsJob };
