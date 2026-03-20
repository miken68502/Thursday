function result(ok, code, retryable, details = {}, nextHint = '') {
  return { ok, code, retryable, details, nextHint };
}

class HomeService {
  constructor(blackboard, logger) {
    this.blackboard = blackboard;
    this.logger = logger.child('HomeService');
  }

  patchBase(path, value) {
    this.blackboard.patch(`home.${path}`, value);
    this.blackboard.patch(`base.${path}`, value);
  }

  setAnchor(position) {
    this.patchBase('anchor', position);
  }

  getAnchor() {
    return this.blackboard.get('base.anchor') || this.blackboard.get('home.anchor');
  }

  getProtectionRadius() {
    const raw = Number(process.env.MC_HOME_PROTECTION_RADIUS || 25);
    return Number.isFinite(raw) ? Math.max(0, raw) : 25;
  }

  isProtectedPosition(position, radius = null) {
    const anchor = this.getAnchor();
    if (!anchor || !position || typeof anchor.distanceTo !== 'function') return false;
    const safeRadius = radius ?? this.getProtectionRadius();
    return anchor.distanceTo(position) <= safeRadius;
  }

  dedupePositions(positions = []) {
    const unique = new Map();
    for (const pos of positions || []) {
      if (!pos) continue;
      unique.set(`${pos.x}:${pos.y}:${pos.z}`, pos);
    }
    return [...unique.values()];
  }

  rememberStation(type, pos) {
    const path = `base.${type}`;
    const current = this.blackboard.get(path, []);
    current.push(pos);
    const trimmed = this.dedupePositions(current).slice(-30);
    this.patchBase(type, trimmed);
  }

  getNearestKnownStation(type, fromPos) {
    const list = this.blackboard.get(`base.${type}`, this.blackboard.get(`home.${type}`, []));
    if (!list.length || !fromPos) return null;
    return [...list].sort((a, b) => fromPos.distanceTo(a) - fromPos.distanceTo(b))[0];
  }

  setChestCategory(position, category) {
    const key = `${position.x}:${position.y}:${position.z}`;
    const map = this.blackboard.get('base.chestCategories', {});
    map[key] = category;
    this.patchBase('chestCategories', map);
  }

  getChestCategory(position) {
    if (!position) return null;
    const key = `${position.x}:${position.y}:${position.z}`;
    const map = this.blackboard.get('base.chestCategories', {});
    return map[key] || null;
  }

  getChestByCategory(category, fromPos = null) {
    const chests = this.blackboard.get('base.chests', []);
    const candidates = chests.filter((p) => this.getChestCategory(p) === category);
    if (!candidates.length) return null;
    if (!fromPos) return candidates[0];
    return [...candidates].sort((a, b) => fromPos.distanceTo(a) - fromPos.distanceTo(b))[0];
  }

  getFallbackChest(fromPos = null, excludeKeys = []) {
    const excluded = new Set(excludeKeys || []);
    const chests = this.blackboard.get('base.chests', []).filter((pos) => !excluded.has(`${pos.x}:${pos.y}:${pos.z}`));
    if (!chests.length) return null;
    if (!fromPos) return chests[0];
    return [...chests].sort((a, b) => fromPos.distanceTo(a) - fromPos.distanceTo(b))[0];
  }

  getKnownChests(fromPos = null, options = {}) {
    const excluded = new Set(options.excludeKeys || []);
    const preferredCategory = options.preferredCategory || null;
    let chests = this.blackboard.get('base.chests', []).filter((pos) => !excluded.has(`${pos.x}:${pos.y}:${pos.z}`));
    if (!chests.length) return [];
    if (preferredCategory) {
      const preferred = chests.filter((pos) => this.getChestCategory(pos) === preferredCategory);
      const other = chests.filter((pos) => this.getChestCategory(pos) !== preferredCategory);
      chests = preferred.concat(other);
    }
    if (!fromPos) return chests;
    return [...chests].sort((a, b) => fromPos.distanceTo(a) - fromPos.distanceTo(b));
  }

  getStationSummary() {
    return {
      chests: (this.blackboard.get('base.chests', []) || []).length,
      beds: (this.blackboard.get('base.beds', []) || []).length,
      furnaces: (this.blackboard.get('base.furnaces', []) || []).length,
      craftingTables: (this.blackboard.get('base.craftingTables', []) || []).length
    };
  }

  autoCategorizeChests() {
    const chests = this.blackboard.get('base.chests', []);
    const categories = ['misc', 'food', 'tools', 'fuel', 'ores', 'stone', 'wood'];
    chests.forEach((pos, i) => {
      if (!this.getChestCategory(pos)) this.setChestCategory(pos, categories[i % categories.length]);
    });
  }

  scanStationsNear(bot, radius = 16, options = {}) {
    const anchor = this.getAnchor();
    const center = anchor || bot.entity.position;
    const reset = !!options.reset;

    const checks = [
      { type: 'chests', names: ['chest', 'trapped_chest'] },
      { type: 'furnaces', names: ['furnace', 'blast_furnace', 'smoker'] },
      { type: 'craftingTables', names: ['crafting_table'] },
      { type: 'beds', names: [] }
    ];

    for (const check of checks) {
      if (reset) this.patchBase(check.type, []);
      const found = bot.findBlocks({
        point: center,
        matching: (block) => check.type === 'beds' ? /_bed$/.test(block?.name || '') : check.names.includes(block?.name),
        maxDistance: radius,
        count: 30
      });
      const positions = this.dedupePositions(found.map((p) => bot.blockAt(p)?.position).filter(Boolean));
      if (positions.length || reset) this.patchBase(check.type, positions);
    }

    if (reset) this.patchBase('chestCategories', {});
    this.autoCategorizeChests();
    if (!anchor) this.setAnchor(center.clone());
    return this.getStationSummary();
  }

  async sleepInBed(_bed) {
    return result(true, 'SUCCESS', false, { spawnSet: true });
  }
}

module.exports = { HomeService };
