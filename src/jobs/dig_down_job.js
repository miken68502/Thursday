const { BaseJob } = require('./base_job');
const { PrepareForJobJob } = require('./prepare_for_job_job');
const { digBlockAction } = require('../actions/dig_block');

class DigDownJob extends BaseJob {
  constructor(params = {}) {
    super('DigDownJob', params);
    this.targetY = Number.isFinite(Number(params.targetY)) ? Number(params.targetY) : -64;
    this.direction = String(params.direction || 'north').toLowerCase();
    this.steps = 0;
  }

  directionVectors() {
    const map = {
      north: { forward: { x: 0, z: -1 }, lateral: { x: 1, z: 0 } },
      south: { forward: { x: 0, z: 1 }, lateral: { x: -1, z: 0 } },
      east: { forward: { x: 1, z: 0 }, lateral: { x: 0, z: 1 } },
      west: { forward: { x: -1, z: 0 }, lateral: { x: 0, z: -1 } }
    };
    return map[this.direction] || null;
  }

  isAirLike(block) {
    const n = block?.name || '';
    return n === 'air' || n === 'cave_air' || n === 'void_air';
  }

  buildTunnelSlice(origin, vectors) {
    const blocks = [];
    const baseY = origin.y - 1;
    for (let lane = 0; lane < 2; lane += 1) {
      for (let h = 0; h < 4; h += 1) {
        blocks.push({
          x: origin.x + vectors.forward.x + vectors.lateral.x * lane,
          y: baseY + h,
          z: origin.z + vectors.forward.z + vectors.lateral.z * lane
        });
      }
    }
    return blocks;
  }

  async recoverMissingTool(context, token, block) {
    const prepared = await new PrepareForJobJob({ profile: 'mine' }).step(context, token);
    if (!prepared.ok) return prepared;
    const equipped = await context.services.inventory.equipBestTool(block);
    if (!equipped.ok) return equipped;
    return this.stepResult(false, 'RECOVERING', true, { recovered: true, reason: 'missing_tool' }, 'tool_recovered_retry');
  }

  async clearBlock(context, token, block) {
    if (!block || this.isAirLike(block)) return this.stepResult(true, 'SUCCESS', false);

    if (typeof context.services.world.collectBlock === 'function') {
      const collected = await context.services.world.collectBlock(block, { ignoreNoPath: true });
      if (collected.ok) return collected;
    }

    const equipped = await context.services.inventory.equipBestTool(block);
    if (!equipped.ok && equipped.code === 'MISSING_TOOL') return this.recoverMissingTool(context, token, block);
    if (!equipped.ok) return equipped;

    const dug = await digBlockAction(context, block, { ignoreHomeProtection: true });
    if (!dug.ok && dug.code === 'MISSING_TOOL') return this.recoverMissingTool(context, token, block);
    return dug;
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });
    const vectors = this.directionVectors();
    if (!vectors) return this.stepResult(false, 'FAILED', false, { reason: 'invalid_direction', direction: this.direction });

    const botPos = context.bot.entity?.position;
    if (!botPos) return this.stepResult(false, 'FAILED', true, { reason: 'no_position' });
    const current = { x: Math.floor(botPos.x), y: Math.floor(botPos.y), z: Math.floor(botPos.z) };
    if (current.y <= this.targetY) {
      return this.stepResult(true, 'DONE', false, { y: current.y, targetY: this.targetY, steps: this.steps, direction: this.direction });
    }

    this.currentStepId = 'clear_tunnel_slice';
    const toClear = this.buildTunnelSlice(current, vectors);
    for (const pos of toClear) {
      const block = context.bot.blockAt(pos);
      const cleared = await this.clearBlock(context, token, block);
      if (!cleared.ok) return cleared;
    }

    this.currentStepId = 'move_down';
    const nextPos = typeof botPos.offset === 'function'
      ? botPos.offset(vectors.forward.x, -1, vectors.forward.z)
      : { x: current.x + vectors.forward.x, y: current.y - 1, z: current.z + vectors.forward.z };
    const moved = await context.services.navigation.moveToPosition(nextPos, { range: 1, profile: 'mine' });
    if (!moved.ok) return moved;

    this.steps += 1;
    return this.stepResult(true, 'SUCCESS', false, { y: nextPos.y, targetY: this.targetY, steps: this.steps, direction: this.direction }, 'continue_dig_down');
  }
}

module.exports = { DigDownJob };
