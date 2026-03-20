const { BaseJob } = require('./base_job');
const { moveToPosAction } = require('../actions/move_to_pos');

class ReturnHomeJob extends BaseJob {
  constructor(params = {}) {
    super('ReturnHomeJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });
    const anchor = context.services.home.getAnchor();
    if (!anchor) return this.stepResult(false, 'FAILED', false, { reason: 'home_anchor_missing' });

    this.currentStepId = 'move_home';
    const moved = await moveToPosAction(context, anchor, { range: 3, profile: 'follow_safe' });
    if (!moved.ok) return moved;

    context.services.home.scanStationsNear?.(context.bot, 18);
    return this.stepResult(true, 'DONE', false, { home: anchor, reason: this.params.reason || 'manual' });
  }
}

module.exports = { ReturnHomeJob };
