const { BaseJob } = require('./base_job');
const { PrepareForJobJob } = require('./prepare_for_job_job');
const { moveToEntityAction } = require('../actions/move_to_entity');
const { attackTargetAction } = require('../actions/attack_target');
const { equipBestWeaponAction } = require('../actions/equip_best_weapon');

class GuardPlayerJob extends BaseJob {
  constructor(params = {}) {
    super('GuardPlayerJob', params);
  }

  isLowHealth(context) {
    const health = Number(context?.bot?.health ?? context?.blackboard?.get?.('survival.health') ?? 20);
    return health > 0 && health <= 6;
  }

  findThreat(context) {
    const combat = context.services.combat || {};
    const radius = this.params.radius || this.params.guardRadius || 12;

    if (typeof combat.findDesignatedPlayer === 'function' && typeof combat.findNearestThreat === 'function') {
      const player = combat.findDesignatedPlayer(radius + 8);
      const around = player?.position || context.bot.entity?.position;
      return combat.findNearestThreat(around, radius);
    }

    if (typeof combat.getThreatNearPosition === 'function') {
      const owner = context.blackboard?.get?.('designatedPlayer');
      const playerPos = owner && context.bot?.players?.[owner]?.entity?.position
        ? context.bot.players[owner].entity.position
        : context.bot?.entity?.position;
      return combat.getThreatNearPosition(playerPos, radius, context.data?.hostileCatalog || []);
    }

    return null;
  }

  async recoverMissingWeapon(context, token, mode, threat) {
    const prepared = await new PrepareForJobJob({ profile: 'combat' }).step(context, token);
    if (!prepared.ok) return prepared;
    const weapon = await equipBestWeaponAction(context);
    if (!weapon.ok) return weapon;
    context.blackboard?.recordProgress?.({ jobType: this.type, stepId: 'weapon_recovered', mode, threatId: threat?.id ?? null });
    return this.stepResult(false, 'RECOVERING', true, {
      code: 'MISSING_TOOL',
      recovered: true,
      mode,
      threatId: threat?.id ?? null
    }, 'weapon_recovered_retry');
  }

  async step(context, token) {
    if (token.cancelled) return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });
    if (this.isLowHealth(context)) return this.stepResult(false, 'FAILED', false, { reason: 'retreat_low_health' }, 'fallback_retreat');

    const mode = this.params.mode || 'guard';
    const threat = this.findThreat(context);
    if (!threat) return this.stepResult(true, 'SUCCESS', false, { reason: 'area_safe', mode, message: 'no_threat' });

    this.currentStepId = 'equip_weapon';
    const weapon = await equipBestWeaponAction(context);
    if (!weapon.ok && weapon.code === 'MISSING_TOOL') return this.recoverMissingWeapon(context, token, mode, threat);
    if (!weapon.ok) return weapon;
    context.blackboard?.recordProgress?.({ jobType: this.type, stepId: 'equip_weapon', mode, threatId: threat.id ?? null });

    this.currentStepId = 'approach_threat';
    const moved = await moveToEntityAction(context, threat, { range: 2, profile: 'combat_aggressive' });
    if (!moved.ok) return moved;
    context.blackboard?.recordProgress?.({ jobType: this.type, stepId: 'approach_threat', threatId: threat.id ?? null, mode });

    this.currentStepId = 'attack';
    const attack = await attackTargetAction(context, threat);
    if (attack.ok) {
      context.blackboard?.recordProgress?.({ jobType: this.type, stepId: 'attack', threatId: threat.id ?? null, mode });
      return this.stepResult(true, mode === 'self_defense' ? 'DONE' : 'SUCCESS', false, { target: threat.name || threat.type || 'unknown', threatId: threat.id ?? null, mode });
    }
    return attack;
  }
}

module.exports = { GuardPlayerJob };
