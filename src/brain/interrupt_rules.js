class InterruptRules {
  constructor({ jobs, priorities }) {
    this.jobs = jobs;
    this.priorities = priorities;
  }

  evaluate(context, scores) {
    if (scores.retreat >= 70) {
      return {
        reason: 'hard_survival_emergency',
        cooldownMs: 1000,
        interruptJob: {
          job: new this.jobs.ReturnHomeJob({ reason: 'low_health_retreat' }),
          options: {
            priority: this.priorities.survivalEmergency,
            fallbackFactory: () => ({
              job: new this.jobs.SurvivalPulseJob(),
              options: { priority: this.priorities.survivalEmergency }
            })
          }
        }
      };
    }

    const immediateThreat = Boolean(context.survival.playerThreatId || (context.survival.threatenedBy || []).length);

    if (scores.defendSelf > 50 && immediateThreat) {
      return {
        reason: 'threat_detected',
        cooldownMs: 4000,
        interruptJob: {
          job: new this.jobs.GuardPlayerJob({ mode: 'self_defense' }),
          options: { priority: this.priorities.combatDefense }
        }
      };
    }

    const currentFood = context.survival.food ?? 20;
    const lastMissingFoodAt = context.snapshot?.survival?.lastMissingFoodAt || 0;
    const missingFoodCooldownMs = 5 * 60 * 1000;
    const withinMissingFoodCooldown = lastMissingFoodAt > 0 && (Date.now() - lastMissingFoodAt) < missingFoodCooldownMs;

    if (scores.eatNow > 30 && currentFood < 10 && !withinMissingFoodCooldown) {
      return {
        reason: 'hunger_interrupt',
        cooldownMs: 1500,
        interruptJob: {
          job: new this.jobs.SurvivalPulseJob(),
          options: { priority: this.priorities.survivalEmergency }
        }
      };
    }

    const isIdle = !context.activeJob?.type;
    if (isIdle && scores.sleep > 60 && context.home.beds?.length) {
      return {
        reason: 'night_sleep',
        cooldownMs: 5000,
        interruptJob: {
          job: new this.jobs.SleepJob(),
          options: { priority: this.priorities.sleep }
        }
      };
    }

    const inventoryPressure = context.inventory.pressure || {};
    const maintenanceNeeded = inventoryPressure.lowFreeSlots || inventoryPressure.hasJunk || (context.inventory.fullness || 0) >= 0.85;
    const stalledActiveWork = !!context.activeJob?.type && context.lastProgressAgeMs > 15000;

    if (scores.goHome > 75 && context.home.anchor && (maintenanceNeeded || stalledActiveWork)) {
      return {
        reason: 'inventory_or_stall_maintenance',
        cooldownMs: 5000,
        interruptJob: {
          job: new this.jobs.ReturnHomeJob({ reason: 'maintenance' }),
          options: {
            priority: this.priorities.inventoryMaintenance,
            fallbackFactory: () => ({
              job: new this.jobs.DepositInventoryJob({ policy: 'store_excess' }),
              options: { priority: this.priorities.inventoryMaintenance }
            })
          }
        }
      };
    }

    return null;
  }
}

module.exports = { InterruptRules };
