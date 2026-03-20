const { BaseJob } = require('./base_job');
const { moveToPosAction } = require('../actions/move_to_pos');

class IndexKnownChestsJob extends BaseJob {
  constructor(params = {}) {
    super('IndexKnownChestsJob', params);
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    const scanRadius = context.services.home.getProtectionRadius?.() ?? 25;
    if (this.params.scanForNew !== false) {
      context.services.home.scanStationsNear?.(context.bot, scanRadius);
    }

    const chests = context.services.home.getKnownChests(context.bot.entity?.position || null);
    if (!chests.length) return this.stepResult(true, 'DONE', false, { indexed: 0, scanned: 0 });

    let indexed = 0;
    let failed = 0;
    for (const chestPos of chests) {
      if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason, indexed, failed });
      this.currentStepId = 'index_chest';
      context.blackboard.recordProgress({ jobType: this.type, stepId: this.currentStepId, chest: chestPos });
      const moved = await moveToPosAction(context, chestPos, { range: 2, profile: 'follow_safe' });
      if (!moved.ok) {
        failed += 1;
        context.services.home.recordChestOpenFailure?.(chestPos);
        continue;
      }
      const block = context.bot.blockAt(chestPos);
      const opened = await context.services.inventory.openContainer(block, { sort: false, chestPos });
      if (!opened.ok) {
        failed += 1;
        continue;
      }
      const container = opened.details?.container;
      try {
        context.services.inventory.syncOpenedChest?.(container, chestPos);
        indexed += 1;
      } finally {
        if (container?.close) container.close();
      }
    }

    context.blackboard.patch('base.lastChestIndexMaintenanceTs', Date.now());
    context.blackboard.patch('home.lastChestIndexMaintenanceTs', Date.now());
    return this.stepResult(true, 'DONE', false, { indexed, failed, scanned: chests.length });
  }
}

module.exports = { IndexKnownChestsJob };
