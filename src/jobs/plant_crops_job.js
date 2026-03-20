const { BaseJob } = require('./base_job');

class PlantCropsJob extends BaseJob {
  constructor(params = {}) {
    super('PlantCropsJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    this.currentStepId = 'find_farmland';
    const targets = context.services.world.findPlantableFarmland(this.params.maxDistance || 16);
    if (!targets.length) return this.stepResult(true, 'DONE', false, { planted: 0 });

    const seed = context.services.inventory.findBestInventoryItem(['wheat_seeds', 'carrot', 'potato', 'beetroot_seeds']);
    if (!seed) return this.stepResult(false, 'MISSING_MATERIALS', false, { reason: 'no_seeds' });

    this.currentStepId = 'plant';
    try {
      await context.bot.equip(seed, 'hand');
      await context.bot.placeBlock(targets[0], { x: 0, y: 1, z: 0 });
      return this.stepResult(true, 'SUCCESS', false, { planted: 1 }, 'continue_planting');
    } catch (error) {
      return this.stepResult(false, 'FAILED', true, { error: error.message });
    }
  }
}

module.exports = { PlantCropsJob };
