const { MineResourceJob } = require('./mine_resource_job');
const { Vec3 } = require('vec3');

class GatherWoodJob extends MineResourceJob {
  constructor(params = {}) {
    super({ resource: 'wood', amount: params.amount || 16, replant: !!params.replant });
    this.type = 'GatherWoodJob';
  }

  parseTarget(target) {
    if (!target || typeof target !== 'string') return null;
    const [sx, sy, sz] = target.split(':');
    const x = Number(sx);
    const y = Number(sy);
    const z = Number(sz);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
  }

  isValidSaplingSoil(blockName = '') {
    return ['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'rooted_dirt', 'moss_block'].includes(blockName);
  }

  async replantAtTarget(context, target) {
    const pos = this.parseTarget(target);
    if (!pos) return false;
    const sapling = context.services?.inventory?.findBestInventoryItem?.([
      'oak_sapling', 'birch_sapling', 'spruce_sapling', 'jungle_sapling', 'acacia_sapling', 'dark_oak_sapling', 'cherry_sapling', 'mangrove_propagule'
    ]);
    if (!sapling) return false;
    const soil = context.bot?.blockAt?.({ x: pos.x, y: pos.y - 1, z: pos.z });
    const air = context.bot?.blockAt?.({ x: pos.x, y: pos.y, z: pos.z });
    const airName = air?.name || '';
    const isAirLike = ['air', 'cave_air', 'void_air'].includes(airName);
    if (!soil || !air || !isAirLike || !this.isValidSaplingSoil(soil.name)) return false;

    try {
      await context.bot.equip(sapling, 'hand');
      await context.bot.placeBlock(soil, new Vec3(0, 1, 0));
      return true;
    } catch (_error) {
      return false;
    }
  }

  async step(context, token) {
    const res = await super.step(context, token);
    if (!res.ok) return res;

    if (this.params.replant && res.code !== 'DONE') {
      await this.replantAtTarget(context, res?.details?.target);
    }

    return res;
  }
}

module.exports = { GatherWoodJob };
