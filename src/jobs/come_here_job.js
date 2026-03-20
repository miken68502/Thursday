const { BaseJob } = require('./base_job');
const { moveToPosAction } = require('../actions/move_to_pos');

class ComeHereJob extends BaseJob {
  constructor(params = {}) {
    super('ComeHereJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    const owner = context.blackboard.get('designatedPlayer');
    const entity = owner ? context.bot.players[owner]?.entity : null;
    if (!entity?.position) return this.stepResult(false, 'NO_TARGET', true, { owner, reason: 'owner_missing' });

    const targetPos = entity.position.floored ? entity.position.floored() : entity.position.clone();
    const range = this.params.range ?? 2;
    const distance = context.bot.entity.position.distanceTo(targetPos);
    if (distance <= range + 0.5) {
      context.blackboard.recordProgress({ jobType: this.type, stepId: 'already_near_owner', owner, distance: Number(distance.toFixed(2)) });
      return this.stepResult(true, 'DONE', false, { owner, distance: Number(distance.toFixed(2)) });
    }

    this.currentStepId = 'move_to_owner';
    const moved = await moveToPosAction(context, targetPos, { range, profile: 'follow_safe' });
    if (!moved.ok) return moved;

    context.blackboard.recordProgress({ jobType: this.type, stepId: 'moved_to_owner', owner });
    return this.stepResult(true, 'DONE', false, { owner, target: targetPos });
  }
}

module.exports = { ComeHereJob };
