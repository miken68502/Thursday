const { BaseJob } = require('./base_job');
const { moveToPosAction } = require('../actions/move_to_pos');
const { craftRecipeAction } = require('../actions/craft_recipe');

class CraftItemJob extends BaseJob {
  constructor(params = {}) {
    super('CraftItemJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    this.currentStepId = 'move_to_crafting_table';
    const tablePos = context.services.home.getNearestKnownStation('craftingTables', context.bot.entity.position);
    if (tablePos) {
      const moved = await moveToPosAction(context, tablePos, { range: 2, profile: 'worker_general' });
      if (!moved.ok) return moved;
    }

    this.currentStepId = 'craft';
    const res = await craftRecipeAction(context, this.params);
    if (!res.ok) return res;

    context.blackboard.recordProgress({ job: this.type, crafted: this.params.item, amount: this.params.amount || 1 });
    return this.stepResult(true, 'DONE', false, res.details);
  }
}

module.exports = { CraftItemJob };
