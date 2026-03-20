class UtilityBrain {
  constructor({ logger, interruptRules }) {
    this.logger = logger.child('UtilityBrain');
    this.interruptRules = interruptRules;
  }

  score(context) {
    const health = context.survival.health || 20;
    const food = context.survival.food || 20;
    const healthDeficit = Math.max(0, 20 - health);
    const hungerDeficit = Math.max(0, 20 - food);
    const threat = context.survival.threatLevel || 0;
    const pressure = context.inventory.pressure || {};
    const inventoryFullness = context.inventory.fullness || 0;
    const playerDistance = context.playerDistance ?? 0;
    const baseDistance = context.baseDistance ?? 0;

    const criticalHealth = health <= 8 ? 20 : 0;
    const lowFoodPenaltyInThreat = threat >= 5 ? -12 : 8;
    const inventoryPressure = (pressure.lowFreeSlots ? 25 : 0) + (pressure.hasJunk ? 10 : 0);

    return {
      eatNow: hungerDeficit * 5 + lowFoodPenaltyInThreat,
      defendSelf: threat * 8 + healthDeficit - criticalHealth + (playerDistance < 8 ? 8 : 0),
      retreat: threat * 4 + healthDeficit * 6 + criticalHealth + (baseDistance > 40 ? -5 : 5),
      goHome: inventoryFullness * 90 + inventoryPressure + context.lastProgressAgeMs / 1200 + (baseDistance > 50 ? 10 : 0),
      sleep: context.time > 13000 && context.time < 23000 ? 70 : 0,
      resumeWork: context.activeJob?.type ? 35 + (context.currentJobPriority || 0) / 10 : 10
    };
  }

  chooseInterrupt(context) {
    const scores = this.score(context);
    return this.interruptRules.evaluate(context, scores);
  }
}

module.exports = { UtilityBrain };
