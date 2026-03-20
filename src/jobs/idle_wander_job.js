const { BaseJob } = require('./base_job');
const { moveToPosAction } = require('../actions/move_to_pos');

class IdleWanderJob extends BaseJob {
  constructor(params = {}) {
    super('IdleWanderJob', params);
  }

  chooseTarget(anchor, radius) {
    const dx = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const dz = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    return anchor.offset(dx, 0, dz);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    const anchor = context.services.home.getAnchor();
    if (!anchor) return this.stepResult(false, 'FAILED', false, { reason: 'home_anchor_missing' });

    const radius = this.params.radius ?? 5;
    const maxDistance = this.params.maxDistance ?? radius + 3;
    const distanceFromHome = context.bot.entity.position.distanceTo(anchor);

    if (distanceFromHome > maxDistance) {
      this.currentStepId = 'return_to_anchor';
      const movedHome = await moveToPosAction(context, anchor, { range: 2, profile: 'follow_safe' });
      if (!movedHome.ok) return movedHome;
      context.blackboard.recordProgress({ jobType: this.type, stepId: 'returned_to_home_ring', distanceFromHome: Number(distanceFromHome.toFixed(2)) });
      return this.stepResult(true, 'DONE', false, { returnedHome: true });
    }

    const target = this.chooseTarget(anchor, radius);
    this.currentStepId = 'idle_wander_move';
    const moved = await moveToPosAction(context, target, { range: 1, profile: 'follow_safe' });
    if (!moved.ok) return moved;

    context.blackboard.recordProgress({ jobType: this.type, stepId: 'idle_wander_move', target });
    return this.stepResult(true, 'DONE', false, { target, anchor, radius });
  }
}

module.exports = { IdleWanderJob };
