const { BaseJob } = require('./base_job');
const { moveToPosAction } = require('../actions/move_to_pos');
const { smeltRecipeAction } = require('../actions/smelt_recipe');

class SmeltItemsJob extends BaseJob {
  constructor(params = {}) {
    super('SmeltItemsJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    this.currentStepId = 'move_to_furnace';
    const furnacePos = context.services.home.getNearestKnownStation('furnaces', context.bot.entity.position);
    if (furnacePos) {
      const moved = await moveToPosAction(context, furnacePos, { range: 2, profile: 'worker_general' });
      if (!moved.ok) return moved;
    }

    this.currentStepId = 'smelt';
    const res = await smeltRecipeAction(context, this.params);
    if (!res.ok) return res;

    context.blackboard.recordProgress({ job: this.type, smelted: this.params.item, amount: this.params.amount || 1 });
    return this.stepResult(true, 'DONE', false, res.details);
  }
}

module.exports = { SmeltItemsJob };
