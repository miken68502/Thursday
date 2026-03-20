const { BaseJob } = require('./base_job');

class AreaWorkJob extends BaseJob {
  constructor(type = 'AreaWorkJob', params = {}) {
    super(type, params);
    this.area = params.area || null;
    this.queue = [];
  }

  normalizeArea(botPos) {
    if (this.area) return this.area;
    const radius = this.params.radius || 4;
    return {
      min: botPos.offset(-radius, -1, -radius),
      max: botPos.offset(radius, 1, radius)
    };
  }
}

module.exports = { AreaWorkJob };
