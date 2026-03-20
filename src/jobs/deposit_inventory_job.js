const { BaseJob } = require('./base_job');
const { openContainerAction } = require('../actions/open_container');
const { moveToPosAction } = require('../actions/move_to_pos');

class DepositInventoryJob extends BaseJob {
  constructor(params = {}) {
    super('DepositInventoryJob', params);
  }

  async depositPlanIntoChest(context, chestPos, policy) {
    const moved = await moveToPosAction(context, chestPos, { range: 2, profile: 'follow_safe' });
    if (!moved.ok) return moved;

    const block = context.bot.blockAt(chestPos);
    const opened = await openContainerAction(context, block);
    if (!opened.ok) return opened;

    const container = opened.details.container;
    const plan = context.services.inventory.planDeposit(policy);
    let movedCount = 0;

    for (const step of plan) {
      try {
        await container.deposit(step.item.type, null, step.amount);
        movedCount += step.amount;
      } catch (_error) {
        // continue to next item/chest route
      }
    }

    container.close();
    return this.stepResult(true, 'SUCCESS', false, { moved: movedCount });
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    const policy = this.params.policy || 'store_excess';
    const plan = context.services.inventory.planDeposit(policy);
    if (!plan.length) return this.stepResult(true, 'DONE', false, { moved: 0 });

    this.currentStepId = 'pick_category_chest';
    const byCategory = {};
    for (const step of plan) byCategory[step.category] = (byCategory[step.category] || 0) + step.amount;
    const primaryCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || 'misc';

    let chestPos = context.services.home.getChestByCategory(primaryCategory, context.bot.entity.position);
    if (!chestPos) chestPos = context.services.home.getFallbackChest(context.bot.entity.position);
    if (!chestPos) {
      context.services.home.scanStationsNear?.(context.bot, context.services.home.getProtectionRadius?.() ?? 25);
      chestPos = context.services.home.getChestByCategory(primaryCategory, context.bot.entity.position);
      if (!chestPos) chestPos = context.services.home.getFallbackChest(context.bot.entity.position);
    }
    if (!chestPos) return this.stepResult(false, 'NO_TARGET', true, { reason: 'known_chest_missing' });

    const deposited = await this.depositPlanIntoChest(context, chestPos, policy);
    if (!deposited.ok) return deposited;

    return this.stepResult(true, 'DONE', false, { moved: deposited.details.moved || 0, category: primaryCategory });
  }
}

module.exports = { DepositInventoryJob };
