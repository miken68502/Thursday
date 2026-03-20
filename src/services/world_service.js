const { goals: { GoalNear } } = require('mineflayer-pathfinder');

function result(ok, code, retryable, details = {}, nextHint = '') {
  return { ok, code, retryable, details, nextHint };
}

class WorldService {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger.child('WorldService');
  }

  findBlocksByNames(names, maxDistance = 32, count = 20) {
    const found = this.bot.findBlocks({
      matching: (block) => names.includes(block?.name),
      maxDistance,
      count
    }) || [];
    const origin = this.bot.entity?.position;
    if (!origin?.distanceTo) return found;
    return found.slice().sort((a, b) => origin.distanceTo(a) - origin.distanceTo(b));
  }

  scanArea(area, filterFn = () => true) {
    const blocks = [];
    for (let x = area.min.x; x <= area.max.x; x += 1) {
      for (let y = area.min.y; y <= area.max.y; y += 1) {
        for (let z = area.min.z; z <= area.max.z; z += 1) {
          const block = this.bot.blockAt({ x, y, z });
          if (block && filterFn(block)) blocks.push(block);
        }
      }
    }
    return blocks;
  }

  buildAreaWorkQueue(area, { whitelist = ['air'], fromPos = null } = {}) {
    const blocks = this.scanArea(area, (block) => !whitelist.includes(block.name));
    const origin = fromPos || this.bot.entity.position;
    return blocks
      .sort((a, b) => origin.distanceTo(a.position) - origin.distanceTo(b.position))
      .map((block) => ({ action: 'break', block }));
  }

  nearestWorkItem(queue, fromPos) {
    if (!queue.length) return null;
    let bestIdx = 0;
    let bestDist = fromPos.distanceTo(queue[0].block.position);
    for (let i = 1; i < queue.length; i += 1) {
      const d = fromPos.distanceTo(queue[i].block.position);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return queue.splice(bestIdx, 1)[0];
  }

  computeBatchAnchor(queue, batchSize = 8) {
    if (!queue.length) return null;
    const batch = queue.slice(0, Math.min(batchSize, queue.length));
    const sum = batch.reduce((acc, item) => ({
      x: acc.x + item.block.position.x,
      y: acc.y + item.block.position.y,
      z: acc.z + item.block.position.z
    }), { x: 0, y: 0, z: 0 });
    return {
      x: Math.round(sum.x / batch.length),
      y: Math.round(sum.y / batch.length),
      z: Math.round(sum.z / batch.length)
    };
  }

  findMatureCrops(maxDistance = 16) {
    return this.bot.findBlocks({
      matching: (block) => /wheat|carrots|potatoes|beetroots/.test(block?.name || '') && (block.metadata || 0) >= 7,
      maxDistance,
      count: 20
    }).map((pos) => this.bot.blockAt(pos)).filter(Boolean);
  }

  findPlantableFarmland(maxDistance = 16) {
    return this.bot.findBlocks({
      matching: (block) => block?.name === 'farmland',
      maxDistance,
      count: 20
    }).map((pos) => this.bot.blockAt(pos)).filter(Boolean);
  }

  getDropsAround(radius = 10) {
    if (!this.bot?.entities || !this.bot?.entity?.position?.distanceTo) return [];
    return Object.values(this.bot.entities)
      .filter((entity) => entity?.name === 'item' && this.bot.entity.position.distanceTo(entity.position) <= radius);
  }

  normalizeDropName(drop) {
    return drop?.displayName?.toLowerCase()?.replace(/\s+/g, '_') || drop?.name || '';
  }

  nearestDrop(radius = 10, filterFn = null) {
    if (typeof this.bot.nearestEntity === 'function') {
      return this.bot.nearestEntity((entity) => {
        if (entity?.name !== 'item') return false;
        if (this.bot.entity.position.distanceTo(entity.position) > radius) return false;
        if (!filterFn) return true;
        return filterFn({ name: this.normalizeDropName(entity) });
      });
    }

    const drops = this.getDropsAround(radius)
      .filter((drop) => !filterFn || filterFn({ name: this.normalizeDropName(drop) }))
      .sort((a, b) => this.bot.entity.position.distanceTo(a.position) - this.bot.entity.position.distanceTo(b.position));
    return drops[0] || null;
  }

  async collectDrops(filterFn = null) {
    if (!this.bot?.pathfinder?.goto) return result(false, 'UNAVAILABLE', true, { reason: 'pathfinder_missing' });
    let collected = 0;
    let attempts = 0;
    const maxAttempts = 12;
    while (attempts < maxAttempts) {
      const drop = this.nearestDrop(10, filterFn);
      if (!drop) break;
      try {
        await this.bot.pathfinder.goto(new GoalNear(drop.position.x, drop.position.y, drop.position.z, 1));
        collected += 1;
      } catch (error) {
        this.logger.debug('Drop collection path failed', { error: error.message });
      }
      attempts += 1;
    }

    return result(true, 'SUCCESS', false, { collected });
  }

  async collectBlock(block, options = {}) {
    if (!block) return result(false, 'NO_TARGET', false);
    const plugin = this.bot.collectBlock;
    if (!plugin || typeof plugin.collect !== 'function') return result(false, 'UNAVAILABLE', true, { reason: 'collectblock_plugin_missing' });
    try {
      await plugin.collect(block, options);
      return result(true, 'SUCCESS', false, { block: block.name, via: 'collectblock' });
    } catch (error) {
      this.logger.debug('Collect block failed', { block: block?.name, error: error.message });
      return result(false, 'FAILED', true, { error: error.message, block: block?.name, via: 'collectblock' });
    }
  }

  async collectBlockBatch(blocks, options = {}) {
    const safeBlocks = (blocks || []).filter(Boolean);
    if (!safeBlocks.length) return result(false, 'NO_TARGET', false, { collected: 0 });
    const plugin = this.bot.collectBlock;
    if (!plugin || typeof plugin.collect !== 'function') return result(false, 'UNAVAILABLE', true, { reason: 'collectblock_plugin_missing' });
    try {
      await plugin.collect(safeBlocks, options);
      return result(true, 'SUCCESS', false, { collected: safeBlocks.length, via: 'collectblock_batch' });
    } catch (error) {
      this.logger.debug('Collect block batch failed', { count: safeBlocks.length, error: error.message });
      return result(false, 'FAILED', true, { error: error.message, collected: 0, via: 'collectblock_batch' });
    }
  }

  findFromVein(block, maxBlocks = 8) {
    if (!block) return [];
    const plugin = this.bot.collectBlock;
    if (plugin && typeof plugin.findFromVein === 'function') {
      try {
        return plugin.findFromVein(block, maxBlocks) || [block];
      } catch (error) {
        this.logger.debug('findFromVein failed', { block: block?.name, error: error.message });
      }
    }
    return [block];
  }
}

module.exports = { WorldService };
