const { BaseJob } = require('./base_job');
const { PrepareForJobJob } = require('./prepare_for_job_job');
const { moveToBlockAction } = require('../actions/move_to_block');
const { equipBestToolAction } = require('../actions/equip_best_tool');
const { digBlockAction } = require('../actions/dig_block');
const { collectDropsAction } = require('../actions/collect_drops');

class MineResourceJob extends BaseJob {
  constructor(params = {}) {
    super('MineResourceJob', params);
    this.progress = 0;
    this.recoveryLevel = 0;
    this.searchIndex = 0;
    this.lastSearchTarget = null;
  }

  workProfile() {
    const resource = this.params.resource || 'coal';
    if (resource === 'wood') return 'wood';
    if (['sand', 'red_sand', 'gravel', 'dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'mud', 'clay'].includes(resource)) return 'loose';
    return 'mine';
  }

  getProtectionRadius(context) {
    return context.services.home?.getProtectionRadius?.() ?? 25;
  }

  getSearchAnchor(context) {
    return context.services.home?.getAnchor?.() || context.bot.entity?.position || null;
  }

  getSearchPoints(context) {
    const anchor = this.getSearchAnchor(context);
    if (!anchor) return [];
    const radius = this.getProtectionRadius(context);
    const startDistance = Math.max(radius + 5, 20);
    const ringDistances = [startDistance, startDistance + 12, startDistance + 24, startDistance + 36];
    const baseY = Math.floor(anchor.y);
    const directions = [
      { label: 'north', dx: 0, dz: -1 },
      { label: 'north_east', dx: 1, dz: -1 },
      { label: 'east', dx: 1, dz: 0 },
      { label: 'south_east', dx: 1, dz: 1 },
      { label: 'south', dx: 0, dz: 1 },
      { label: 'south_west', dx: -1, dz: 1 },
      { label: 'west', dx: -1, dz: 0 },
      { label: 'north_west', dx: -1, dz: -1 }
    ];

    const unique = new Map();
    ringDistances.forEach((distance, ringIndex) => {
      directions.forEach((dir) => {
        const point = {
          label: `${dir.label}_${distance}`,
          ring: ringIndex + 1,
          distance,
          x: Math.floor(anchor.x + dir.dx * distance),
          y: baseY,
          z: Math.floor(anchor.z + dir.dz * distance)
        };
        unique.set(`${point.x}:${point.y}:${point.z}`, point);
      });
    });

    return [...unique.values()];
  }

  selectTarget(context, positions) {
    const resource = this.params.resource || 'coal';
    const botPos = context.bot.entity?.position;
    const sorted = positions.slice().sort((a, b) => {
      if (resource === 'wood') {
        if (a.y !== b.y) return a.y - b.y;
      }
      if (botPos?.distanceTo) return botPos.distanceTo(a) - botPos.distanceTo(b);
      return 0;
    });

    return sorted.find((p) => {
      const targetId = `${p.x}:${p.y}:${p.z}`;
      const protectedByHome = context.services.home?.isProtectedPosition?.(p);
      return !protectedByHome && !context.blackboard.isTargetBlacklisted(targetId) && !context.blackboard.isPositionBlacklisted(p);
    }) || null;
  }

  getApproachRange(context, block) {
    const resource = this.params.resource || 'coal';
    if (resource !== 'wood' || !block?.position) return 1;
    const botPos = context.bot.entity?.position;
    if (!botPos) return 3;
    const dx = Math.abs((block.position.x + 0.5) - botPos.x);
    const dz = Math.abs((block.position.z + 0.5) - botPos.z);
    const dy = (block.position.y + 0.5) - (botPos.y + 1.6);

    if (dx <= 1.75 && dz <= 1.75 && dy <= 4.75) return 1;
    if (dx <= 2.75 && dz <= 2.75 && dy <= 4.75) return 2;
    return 3;
  }

  needsWoodPlatform(context, block) {
    const resource = this.params.resource || 'coal';
    if (resource !== 'wood' || !block?.position) return false;
    const botPos = context.bot.entity?.position;
    if (!botPos) return false;

    const dx = Math.abs((block.position.x + 0.5) - botPos.x);
    const dz = Math.abs((block.position.z + 0.5) - botPos.z);
    const dy = (block.position.y + 0.5) - (botPos.y + 1.6);
    const horizontalClose = dx <= 2.25 && dz <= 2.25;
    const slightlyOutOfReach = dy > 4.75 && dy <= 7.25;
    return horizontalClose && slightlyOutOfReach;
  }

  findScaffoldBlock(context) {
    const items = context.services.inventory.inventoryItems();
    const preferred = [
      'dirt', 'grass_block', 'cobblestone', 'cobbled_deepslate', 'stone', 'andesite', 'granite', 'diorite',
      'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks',
      'mangrove_planks', 'cherry_planks', 'bamboo_planks', 'oak_log', 'spruce_log', 'birch_log'
    ];
    for (const name of preferred) {
      const found = items.find((item) => item?.name === name && item.count > 0);
      if (found) return found;
    }
    return items.find((item) => item?.count > 0 && /planks|log|dirt|cobblestone|stone|deepslate|andesite|granite|diorite/.test(item.name)) || null;
  }

  async attemptWoodPlatform(context, block) {
    const logger = context?.logger?.child ? context.logger.child(this.type) : null;
    if (!this.needsWoodPlatform(context, block)) {
      return this.stepResult(false, 'NO_PLATFORM_NEEDED', false, { block: block?.name, position: block?.position });
    }

    const scaffold = this.findScaffoldBlock(context);
    if (!scaffold) {
      logger?.warn('Wood platform unavailable - no scaffold block', { target: block?.position });
      return this.stepResult(false, 'MISSING_SCAFFOLD', false, { block: block?.name, position: block?.position });
    }

    logger?.info('Wood platform move attempt', { target: block?.position, scaffold: scaffold.name });
    const moved = await context.services.navigation.moveToPosition(block.position, {
      range: 1,
      profile: 'wood_platform'
    });

    if (!moved.ok) {
      logger?.warn('Wood platform move failed', { target: block?.position, moved });
      return moved;
    }

    return this.stepResult(true, 'SUCCESS', false, {
      platformAttempted: true,
      target: block?.position,
      scaffold: scaffold.name
    });
  }

  async moveToNextSearchPoint(context) {
    const logger = context?.logger?.child ? context.logger.child(this.type) : null;
    const points = this.getSearchPoints(context);
    while (this.searchIndex < points.length) {
      const point = points[this.searchIndex];
      this.searchIndex += 1;
      this.lastSearchTarget = point;
      logger?.info('Mining spiral search move', { attempt: this.searchIndex, total: points.length, point });
      const moved = await context.services.navigation.moveToPosition(point, { range: 2, profile: 'worker_general' });
      if (moved.ok) {
        context.blackboard.recordProgress({ jobType: this.type, stepId: 'spiral_search_move', point, searchIndex: this.searchIndex });
        return { moved: true, point };
      }
      context.blackboard.recordPathFailure(point, { reason: moved.code || 'NO_PATH', searchIndex: this.searchIndex, jobType: this.type });
      logger?.warn('Mining spiral search point unreachable', { point, result: moved });
    }
    return { moved: false, point: null };
  }

  async returnHomeAfterSearch(context) {
    const logger = context?.logger?.child ? context.logger.child(this.type) : null;
    const anchor = context.services.home?.getAnchor?.();
    if (!anchor) return;
    const moved = await context.services.navigation.moveToPosition(anchor, { range: 2, profile: 'worker_general' });
    logger?.info('Mining search exhausted, returning home', { moved });
  }

  async recoverMissingTool(context, token, block) {
    const logger = context?.logger?.child ? context.logger.child(this.type) : null;
    const profile = this.workProfile();
    logger?.warn('Mining missing tool detected, attempting recovery', { profile, resource: this.params.resource || 'coal', progress: this.progress });
    const prepared = await new PrepareForJobJob({ profile }).step(context, token);
    if (!prepared.ok) return prepared;
    const equipped = await equipBestToolAction(context, block);
    logger?.info('Mining post-recovery equip result', { profile, block: block?.name, equipped });
    if (!equipped.ok) return equipped;
    return this.stepResult(false, 'RECOVERING', true, {
      code: 'MISSING_TOOL',
      recovered: true,
      profile,
      progress: this.progress,
      resource: this.params.resource || 'coal'
    }, 'tool_recovered_retry');
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });

    const logger = context?.logger?.child ? context.logger.child(this.type) : null;
    const resource = this.params.resource || 'coal';
    const requestedAmount = Number(this.params.amount ?? 1);
    const amount = Number.isFinite(requestedAmount) ? Math.max(0, requestedAmount) : 1;
    if (this.progress >= amount) {
      logger?.info('Mining target reached', { resource, progress: this.progress, amount });
      return this.stepResult(true, 'DONE', false, { mined: this.progress, amount, resource });
    }

    this.currentStepId = 'find_target';
    const family = context.data.resourceCatalog[resource] || [resource];
    const positions = context.services.world.findBlocksByNames(family, 48, 30);
    logger?.info('Mining scan', { resource, family, amount, progress: this.progress, found: positions.length, searchIndex: this.searchIndex, searchPoint: this.lastSearchTarget });
    const pos = this.selectTarget(context, positions);
    if (!pos) {
      logger?.warn('Mining target not found', { resource, family, amount, progress: this.progress, searchIndex: this.searchIndex });
      const searchMove = await this.moveToNextSearchPoint(context);
      if (searchMove.moved) {
        this.recoveryLevel = 0;
        return this.stepResult(true, 'SUCCESS', false, {
          code: 'SEARCHING',
          resource,
          family,
          searchIndex: this.searchIndex,
          searchPoint: searchMove.point,
          jobType: this.type
        }, 'continue_search');
      }
      await this.returnHomeAfterSearch(context);
      return this.stepResult(false, 'NO_TARGET', false, {
        code: 'NO_TARGET',
        resource,
        family,
        progress: this.progress,
        searchExhausted: true,
        attempts: this.searchIndex,
        jobType: this.type
      }, 'search_exhausted');
    }

    const block = context.bot.blockAt(pos);
    logger?.info('Mining target selected', { resource, amount, progress: this.progress, pos, block: block?.name || null, searchIndex: this.searchIndex });
    if (!block) return this.attemptRecovery(context, { code: 'NO_TARGET', targetId: `${pos.x}:${pos.y}:${pos.z}`, resource });

    this.currentStepId = 'move_to_block';
    const moveRange = this.getApproachRange(context, block);
    let moved = await moveToBlockAction(context, block, { range: moveRange, profile: 'worker_general' });
    if (!moved.ok && this.needsWoodPlatform(context, block)) {
      const platformed = await this.attemptWoodPlatform(context, block);
      if (platformed.ok) {
        moved = await moveToBlockAction(context, block, { range: 1, profile: 'worker_general' });
      }
    }
    if (!moved.ok) return this.attemptRecovery(context, { code: moved.code, targetId: `${pos.x}:${pos.y}:${pos.z}`, position: pos, details: moved.details, jobType: this.type });

    let minedWithPlugin = false;
    let minedCount = 1;
    if (typeof context.services.world.collectBlock === 'function') {
      this.currentStepId = 'collectblock';
      const remaining = Math.max(1, amount - this.progress);
      let collected = null;
      if (resource === 'wood' && typeof context.services.world.findFromVein === 'function') {
        const cluster = context.services.world.findFromVein(block, Math.min(remaining, 8))
          .filter((candidate) => !context.services.home?.isProtectedPosition?.(candidate?.position));
        if (cluster.length > 1 && typeof context.services.world.collectBlockBatch === 'function') {
          collected = await context.services.world.collectBlockBatch(cluster, { ignoreNoPath: true });
        }
      }
      if (!collected) collected = await context.services.world.collectBlock(block, { ignoreNoPath: true });
      if (collected.ok) {
        minedWithPlugin = true;
        minedCount = Math.max(1, Number(collected?.details?.collected || 1));
        logger?.info('Mining collectblock result', { resource, block: block?.name, pos, collected });
      } else {
        logger?.debug?.('Mining collectblock fallback', { resource, block: block?.name, pos, collected });
      }
    }

    if (!minedWithPlugin) {
      this.currentStepId = 'equip_tool';
      const equipped = await equipBestToolAction(context, block);
      logger?.info('Mining equip result', { resource, block: block?.name, equipped });
      if (!equipped.ok && equipped.code === 'MISSING_TOOL') return this.recoverMissingTool(context, token, block);
      if (!equipped.ok) return equipped;

      this.currentStepId = 'dig';
      const dug = await digBlockAction(context, block, { ignoreHomeProtection: true });
      logger?.info('Mining dig result', { resource, block: block?.name, pos, dug });
      if (!dug.ok && dug.code === 'MISSING_TOOL') return this.recoverMissingTool(context, token, block);
      if (!dug.ok) return this.attemptRecovery(context, { code: dug.code, targetId: `${pos.x}:${pos.y}:${pos.z}`, position: pos, details: dug.details, jobType: this.type });

      this.currentStepId = 'collect';
      await collectDropsAction(context, (drop) => family.includes(drop?.name));
    }

    this.progress += minedWithPlugin ? Math.min(minedCount, amount - this.progress) : 1;
    this.recoveryLevel = 0;
    logger?.info('Mining progress updated', { resource, progress: this.progress, amount, target: `${pos.x}:${pos.y}:${pos.z}` });
    context.blackboard.recordProgress({ jobType: this.type, stepId: 'mined_block', progress: this.progress, amount, resource, target: `${pos.x}:${pos.y}:${pos.z}` });
    return this.stepResult(true, 'SUCCESS', false, { progress: this.progress, amount, resource, target: `${pos.x}:${pos.y}:${pos.z}` }, 'continue_mining');
  }

  async attemptRecovery(context, failure) {
    this.recoveryLevel += 1;
    const result = await context.recovery.recover(context, { ...failure, level: this.recoveryLevel - 1 });
    if (!result.retryable) return result;
    if (result.code === 'NO_TARGET' && failure.targetId) {
      context.blackboard.blacklistTarget(failure.targetId, result.code || failure.code || 'FAILED', 45_000);
    }
    return this.stepResult(false, result.code, true, { ...failure, recoveryLevel: this.recoveryLevel }, result.nextHint);
  }
}

module.exports = { MineResourceJob };
