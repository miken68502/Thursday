class PerceptionService {
  constructor({ blackboard, bot, combatService, inventoryService, hostileCatalog, logger }) {
    this.blackboard = blackboard;
    this.bot = bot;
    this.combatService = combatService;
    this.inventoryService = inventoryService;
    this.hostileCatalog = hostileCatalog;
    this.logger = logger.child('PerceptionService');
  }

  async update(context) {
    const allThreats = this.combatService.getHostileThreats(this.hostileCatalog);
    const nearbyThreats = allThreats.filter((entity) => this.bot.entity.position.distanceTo(entity.position) <= 12);
    const nearestThreat = nearbyThreats.length
      ? nearbyThreats.slice().sort((a, b) => this.bot.entity.position.distanceTo(a.position) - this.bot.entity.position.distanceTo(b.position))[0]
      : null;
    const distance = nearestThreat ? this.bot.entity.position.distanceTo(nearestThreat.position) : 999;

    this.blackboard.patch('survival.health', this.bot.health ?? 20);
    this.blackboard.patch('survival.food', this.bot.food ?? 20);
    this.blackboard.patch('survival.threatLevel', Math.max(0, Math.min(10, nearbyThreats.length * 2 + (distance < 8 ? 3 : 0))));
    this.blackboard.patch('survival.threatenedBy', nearbyThreats.map((t) => t.id));
    const invSummary = this.inventoryService.getSummary();
    const pressure = this.inventoryService.inventoryPressure();
    this.blackboard.patch('inventory', {
      ...invSummary,
      pressure,
      edibleFoodCount: this.inventoryService.edibleFoodCount(),
      hasEdibleFood: this.inventoryService.hasEdibleFood()
    });

    const owner = this.blackboard.get('designatedPlayer');
    if (owner && this.bot.players[owner]?.entity?.position) {
      const ownerPos = this.bot.players[owner].entity.position;
      this.blackboard.patch('lastKnownPlayerPosition', ownerPos);
      const playerThreat = this.combatService.getThreatNearPosition(this.hostileCatalog, ownerPos, 12);
      this.blackboard.patch('survival.playerThreatId', playerThreat?.id || null);
    }

    this.logger.debug('Perception updated', {
      mode: context.mode,
      threatCount: nearbyThreats.length,
      food: this.bot.food,
      health: this.bot.health
    });
  }
}

module.exports = { PerceptionService };
