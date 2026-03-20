const { MineResourceJob } = require('./mine_resource_job');

class GatherWoodJob extends MineResourceJob {
  constructor(params = {}) {
    super({ resource: 'wood', amount: params.amount || 16, replant: !!params.replant });
    this.type = 'GatherWoodJob';
  }

  async step(context, token) {
    const res = await super.step(context, token);
    if (!res.ok) return res;

    if (this.params.replant && res.code !== 'DONE') {
      const sapling = context.services.inventory.findBestInventoryItem(['oak_sapling', 'birch_sapling', 'spruce_sapling']);
      if (sapling) {
        try {
          await context.bot.equip(sapling, 'hand');
        } catch (_error) {
          // best effort replant scaffolding
        }
      }
    }

    return res;
  }
}

module.exports = { GatherWoodJob };
