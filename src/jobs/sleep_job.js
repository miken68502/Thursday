const { BaseJob } = require('./base_job');
const { moveToPosAction } = require('../actions/move_to_pos');
const { sleepInBedAction } = require('../actions/sleep_in_bed');

class SleepJob extends BaseJob {
  constructor(params = {}) {
    super('SleepJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });
    const bedPos = context.services.home.getNearestKnownStation('beds', context.bot.entity.position);
    if (!bedPos) return this.stepResult(false, 'NO_TARGET', false, { reason: 'no_known_bed' });

    this.currentStepId = 'move_to_bed';
    const moved = await moveToPosAction(context, bedPos, { range: 2, profile: 'follow_safe' });
    if (!moved.ok) return moved;

    const bed = context.bot.blockAt(bedPos);
    this.currentStepId = 'sleep';
    const res = await sleepInBedAction(context, bed);
    return res.ok ? this.stepResult(true, 'DONE', false, { spawnSet: true }) : res;
  }
}

module.exports = { SleepJob };
