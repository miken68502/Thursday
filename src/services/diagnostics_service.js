class DiagnosticsService {
  constructor({ blackboard }) {
    this.blackboard = blackboard;
  }

  statusReport() {
    const state = this.blackboard.get('mode');
    const activeJob = this.blackboard.get('activeJob');
    const target = this.blackboard.get('currentTarget');
    const survival = this.blackboard.get('survival', {});
    const inventory = this.blackboard.get('inventory', {});
    const failures = this.blackboard.get('recentFailures', []).slice(-5);

    return {
      state,
      activeJob: activeJob?.type || null,
      currentStep: activeJob?.stepId || null,
      target,
      health: survival.health,
      hunger: survival.food,
      inventoryFull: (inventory.fullness || 0) > 0.9,
      recentFailures: failures
    };
  }

  formatReport() {
    const r = this.statusReport();
    return [
      `State=${r.state}`,
      `Job=${r.activeJob || 'none'}`,
      `Step=${r.currentStep || 'none'}`,
      `Health=${r.health}`,
      `Hunger=${r.hunger}`,
      `InvFull=${r.inventoryFull}`,
      `Failures=${r.recentFailures.length}`
    ].join(' | ');
  }
}

module.exports = { DiagnosticsService };
