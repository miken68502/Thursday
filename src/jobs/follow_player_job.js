const { BaseJob } = require('./base_job');
const { moveToEntityAction } = require('../actions/move_to_entity');

class FollowPlayerJob extends BaseJob {
  constructor(params = {}) {
    super('FollowPlayerJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });
    const owner = context.blackboard.get('designatedPlayer');
    const entity = owner ? context.bot.players[owner]?.entity : null;
    if (!entity) return this.stepResult(false, 'NO_TARGET', true, { owner });

    this.currentStepId = 'follow_move';
    const res = await moveToEntityAction({ ...context, services: context.services }, entity, { range: 2, profile: 'follow_safe' });
    if (res.ok) {
      context.blackboard.recordProgress({ jobType: this.type, stepId: 'follow_move', owner });
      return this.stepResult(true, 'SUCCESS', false, { owner });
    }
    return res;
  }
}

module.exports = { FollowPlayerJob };
