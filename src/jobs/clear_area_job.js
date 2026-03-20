const { AreaWorkJob } = require('./area_work_job');
const { digBlockAction } = require('../actions/dig_block');
const { collectDropsAction } = require('../actions/collect_drops');
const { moveToPosAction } = require('../actions/move_to_pos');

class ClearAreaJob extends AreaWorkJob {
  constructor(params = {}) {
    super('ClearAreaJob', params);
    this.batchAnchor = null;
    this.batchBudget = 0;
    this.batchSize = params.batchSize || 8;
  }

  async prepareQueue(context, whitelist, area) {
    this.currentStepId = 'scan_area';
    this.queue = context.services.world.buildAreaWorkQueue(area, {
      whitelist,
      fromPos: context.bot.entity.position
    });
  }

  async ensureBatchAnchor(context) {
    if (this.batchBudget > 0 && this.batchAnchor) return { ok: true, code: 'SUCCESS' };

    this.batchAnchor = context.services.world.computeBatchAnchor(this.queue, this.batchSize);
    this.batchBudget = Math.min(this.batchSize, this.queue.length);
    if (!this.batchAnchor) return { ok: true, code: 'SUCCESS' };

    this.currentStepId = 'move_to_batch_anchor';
    return moveToPosAction(context, this.batchAnchor, { range: 3, profile: 'worker_general' });
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    const whitelist = this.params.whitelist || ['air', 'grass_block'];
    const area = this.normalizeArea(context.bot.entity.position);

    if (!this.queue.length) {
      await this.prepareQueue(context, whitelist, area);
      if (!this.queue.length) return this.stepResult(true, 'DONE', false, { cleared: 0 });
    }

    const moved = await this.ensureBatchAnchor(context);
    if (!moved.ok) return moved;

    const next = context.services.world.nearestWorkItem(this.queue, context.bot.entity.position);
    if (!next) return this.stepResult(true, 'DONE', false, { cleared: 0 });

    this.currentStepId = 'clear_block';
    const dug = await digBlockAction(context, next.block);
    if (!dug.ok) return dug;

    await collectDropsAction(context);
    this.batchBudget -= 1;

    const pressure = context.services.inventory.inventoryPressure();
    if (pressure.lowFreeSlots) {
      return this.stepResult(false, 'FAILED', true, { reason: 'inventory_full_clear_area' }, 'deposit_inventory');
    }

    return this.stepResult(true, this.queue.length ? 'SUCCESS' : 'DONE', false, {
      remaining: this.queue.length,
      batchBudget: this.batchBudget
    });
  }
}

module.exports = { ClearAreaJob };
