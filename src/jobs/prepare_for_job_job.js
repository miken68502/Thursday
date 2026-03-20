const { BaseJob } = require('./base_job');
const { ReturnHomeJob } = require('./return_home_job');
const { DepositInventoryJob } = require('./deposit_inventory_job');
const { CraftItemJob } = require('./craft_item_job');
const { moveToPosAction } = require('../actions/move_to_pos');
const { prepProfiles } = require('../config/prep_profiles');

class PrepareForJobJob extends BaseJob {
  constructor(params = {}) {
    super('PrepareForJobJob', params);
  }

  inventorySummary(context) {
    return context.services.inventory.getSummary();
  }

  profileConfig(profile = 'default') {
    return prepProfiles[profile] || prepProfiles.default;
  }

  hasFood(context) {
    if (typeof context.services.inventory.hasEdibleFood === 'function') return context.services.inventory.hasEdibleFood();
    const summary = this.inventorySummary(context);
    return Object.keys(summary.summary || {}).some((name) => /bread|beef|pork|potato|carrot|apple/.test(name));
  }

  requiredTools(profile = 'default') {
    return this.profileConfig(profile).toolCandidates || [];
  }

  hasRequiredTool(summary, profile = 'default') {
    const names = Object.keys(summary.summary || {});
    return this.requiredTools(profile).some((tool) => names.includes(tool));
  }

  getKnownChests(context, preferredCategory = null) {
    if (context.services.home?.getKnownChests) {
      return context.services.home.getKnownChests(context.bot.entity?.position || null, { preferredCategory });
    }

    const base = context.blackboard.get('base.chests', []);
    const home = context.blackboard.get('home.chests', []);
    const unique = new Map();
    for (const chest of [...base, ...home]) {
      if (!chest) continue;
      unique.set(`${chest.x}:${chest.y}:${chest.z}`, chest);
    }
    return [...unique.values()];
  }

  async tryWithdrawFoodFromKnownChests(context, profile = 'default') {
    const chests = this.getKnownChests(context, 'food');
    const foodCandidates = this.profileConfig(profile).foodCandidates || [];
    if (!chests.length || !foodCandidates.length) return false;

    for (const chestPos of chests) {
      if (context.services?.navigation?.moveToPosition) {
        const moved = await moveToPosAction(context, chestPos, { range: 2, profile: 'follow_safe' });
        if (!moved.ok) continue;
      }
      const chestBlock = context.bot.blockAt ? context.bot.blockAt(chestPos) : null;
      const opened = await context.services.inventory.openContainer(chestBlock, { sort: false });
      if (!opened.ok) continue;
      const container = opened.details?.container;

      try {
        for (const name of foodCandidates) {
          const pulled = await context.services.inventory.withdrawItems(container, { name, amount: 8 });
          if (pulled.ok) return true;
        }
      } finally {
        if (container?.close) container.close();
      }
    }

    return false;
  }

  async tryWithdrawFromKnownChests(context, profile) {
    const toolNames = this.requiredTools(profile);
    const chests = this.getKnownChests(context, 'tools');
    if (!toolNames.length || !chests.length) return false;

    for (const chestPos of chests) {
      if (context.services?.navigation?.moveToPosition) {
        const moved = await moveToPosAction(context, chestPos, { range: 2, profile: 'follow_safe' });
        if (!moved.ok) continue;
      }
      const chestBlock = context.bot.blockAt ? context.bot.blockAt(chestPos) : null;
      const opened = await context.services.inventory.openContainer(chestBlock, { sort: false });
      if (!opened.ok) continue;
      const container = opened.details?.container;

      try {
        for (const name of toolNames) {
          const pulled = await context.services.inventory.withdrawItems(container, { name, amount: 1 });
          if (pulled.ok) return true;
        }
      } finally {
        if (container?.close) container.close();
      }
    }

    return false;
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    const profile = this.params.profile || 'mine';
    let inv = this.inventorySummary(context);
    let hasFood = this.hasFood(context);
    let hasTool = this.hasRequiredTool(inv, profile);

    this.currentStepId = 'return_home';
    context.blackboard.recordProgress({ jobType: this.type, stepId: this.currentStepId, profile });
    const returnedHome = await new ReturnHomeJob({ reason: 'prepare_for_job' }).step(context, token);
    if (!returnedHome.ok) return returnedHome;

    inv = this.inventorySummary(context);
    if (inv.fullness > 0.8) {
      this.currentStepId = 'deposit_excess';
      context.blackboard.recordProgress({ jobType: this.type, stepId: this.currentStepId, profile });
      const deposited = await new DepositInventoryJob({ policy: 'store_excess' }).step(context, token);
      if (!deposited.ok) return deposited;
      inv = this.inventorySummary(context);
      hasFood = this.hasFood(context);
      hasTool = this.hasRequiredTool(inv, profile);
    }

    if (!hasFood) {
      this.currentStepId = 'withdraw_food';
      context.blackboard.recordProgress({ jobType: this.type, stepId: this.currentStepId, profile });
      await this.tryWithdrawFoodFromKnownChests(context, profile);
      inv = this.inventorySummary(context);
      hasFood = this.hasFood(context);
    }

    if (!hasFood) {
      return this.stepResult(false, 'MISSING_FOOD', false, { profile });
    }

    if (!hasTool && this.requiredTools(profile).length) {
      this.currentStepId = 'withdraw_tool';
      context.blackboard.recordProgress({ jobType: this.type, stepId: this.currentStepId, profile });
      await this.tryWithdrawFromKnownChests(context, profile);
      inv = this.inventorySummary(context);
      hasTool = this.hasRequiredTool(inv, profile);
    }

    if (!hasTool && this.requiredTools(profile).length) {
      this.currentStepId = 'craft_tool';
      context.blackboard.recordProgress({ jobType: this.type, stepId: this.currentStepId, profile });
      const craftTarget = this.requiredTools(profile)[0] || 'stone_pickaxe';
      const crafted = await new CraftItemJob({ item: craftTarget, amount: 1 }).step(context, token);
      if (!crafted.ok) return crafted;
      inv = this.inventorySummary(context);
      hasTool = this.hasRequiredTool(inv, profile);
    }

    if (!hasTool && this.requiredTools(profile).length) {
      return this.stepResult(false, 'MISSING_TOOL', false, { profile, required: this.requiredTools(profile) });
    }

    context.blackboard.recordProgress({ jobType: this.type, stepId: 'prepared', profile });
    return this.stepResult(true, 'DONE', false, {
      profile,
      prepared: true,
      hadFood: hasFood,
      hadRequiredTool: hasTool || !this.requiredTools(profile).length
    });
  }
}

module.exports = { PrepareForJobJob };
