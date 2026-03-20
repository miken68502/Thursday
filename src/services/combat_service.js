class CombatService {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger.child('CombatService');
  }

  getHostileThreats(hostileCatalog) {
    return Object.values(this.bot.entities).filter((entity) => {
      if (!entity?.position || entity === this.bot.entity) return false;
      return hostileCatalog.includes(entity.name);
    });
  }

  threatScore(entity) {
    const distance = this.bot.entity.position.distanceTo(entity.position);
    const distanceWeight = Math.max(0, 12 - distance);
    const hpWeight = entity.health ? Math.min(10, entity.health) : 5;
    return distanceWeight * 2 + hpWeight;
  }

  getClosestThreat(hostileCatalog, radius = null) {
    let threats = this.getHostileThreats(hostileCatalog);
    if (radius != null) {
      threats = threats.filter((entity) => this.bot.entity.position.distanceTo(entity.position) <= radius);
    }
    if (!threats.length) return null;
    threats.sort((a, b) => this.bot.entity.position.distanceTo(a.position) - this.bot.entity.position.distanceTo(b.position));
    return threats[0];
  }

  getThreatNearPosition(hostileCatalog, position, radius = 12) {
    if (!position) return null;
    const threats = this.getHostileThreats(hostileCatalog)
      .filter((entity) => position.distanceTo(entity.position) <= radius)
      .sort((a, b) => this.threatScore(b) - this.threatScore(a));
    return threats[0] || null;
  }
}

module.exports = { CombatService };
