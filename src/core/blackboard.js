const BOT_MODES = Object.freeze({
  IDLE: 'IDLE',
  FOLLOW: 'FOLLOW',
  WORK: 'WORK',
  COMBAT: 'COMBAT',
  SURVIVAL: 'SURVIVAL',
  INVENTORY: 'INVENTORY',
  RETURN_HOME: 'RETURN_HOME',
  SLEEP: 'SLEEP',
  RECOVER: 'RECOVER',
  ERROR: 'ERROR'
});

class Blackboard {
  constructor() {
    this.reset();
  }

  reset() {
    const baseState = {
      anchor: null,
      beds: [],
      chests: [],
      furnaces: [],
      craftingTables: [],
      chestCategories: {}
    };

    this.state = {
      mode: BOT_MODES.IDLE,
      activeJob: { id: null, type: null, stepId: null },
      currentTarget: null,
      designatedPlayer: null,
      lastKnownPlayerPosition: null,
      survival: {
        health: 20,
        food: 20,
        threatLevel: 0,
        threatenedBy: [],
        lastMissingFoodAt: 0,
        lastMissingFoodChestKey: null,
        homeFoodUnavailable: false,
        lastNoFoodNoticeAt: 0
      },
      inventory: {
        usedSlots: 0,
        freeSlots: 36,
        fullness: 0,
        summary: {}
      },
      home: { ...baseState },
      base: { ...baseState },
      recentFailures: [],
      failures: {
        badTargets: [],
        badPositions: [],
        pathFailures: [],
        jobFailures: []
      },
      blacklistedTargets: new Map(),
      blacklistedPositions: new Map(),
      recentRecoveryAttempts: [],
      lastSuccessTs: Date.now(),
      lastProgressTs: Date.now(),
      idleSinceTs: Date.now(),
      lastIdleWanderTs: 0,
      checkpoints: {}
    };
  }

  update(patch = {}) {
    this.state = { ...this.state, ...patch };
    return this.state;
  }

  patch(path, value) {
    const keys = path.split('.');
    let ref = this.state;
    for (let i = 0; i < keys.length - 1; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(ref, keys[i])) ref[keys[i]] = {};
      ref = ref[keys[i]];
    }
    ref[keys[keys.length - 1]] = value;
    return value;
  }

  get(path, fallback = null) {
    if (!path) return this.state;
    return path.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : fallback), this.state);
  }

  recordFailure(failure) {
    this.state.recentFailures.push({ ts: Date.now(), ...failure });
    this.state.failures.jobFailures.push({ ts: Date.now(), ...failure });
    if (this.state.recentFailures.length > 50) this.state.recentFailures.shift();
    if (this.state.failures.jobFailures.length > 50) this.state.failures.jobFailures.shift();
  }

  recordPathFailure(position, details = {}) {
    this.state.failures.pathFailures.push({ ts: Date.now(), position, details });
    if (this.state.failures.pathFailures.length > 100) this.state.failures.pathFailures.shift();

    if (position) {
      this.state.failures.badPositions.push({ ts: Date.now(), position, details });
      if (this.state.failures.badPositions.length > 100) this.state.failures.badPositions.shift();
    }
  }

  recordBadTarget(targetId, reason) {
    this.state.failures.badTargets.push({ ts: Date.now(), targetId, reason });
    if (this.state.failures.badTargets.length > 100) this.state.failures.badTargets.shift();
  }

  blacklistTarget(targetId, reason, ttlMs = 30_000) {
    this.state.blacklistedTargets.set(targetId, {
      reason,
      until: Date.now() + ttlMs
    });
    this.recordBadTarget(targetId, reason);
  }

  isTargetBlacklisted(targetId) {
    const record = this.state.blacklistedTargets.get(targetId);
    if (!record) return false;
    if (Date.now() > record.until) {
      this.state.blacklistedTargets.delete(targetId);
      return false;
    }
    return true;
  }


  positionKey(position) {
    if (!position) return null;
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    const z = Math.floor(position.z);
    return `${x}:${y}:${z}`;
  }

  blacklistPosition(position, reason, ttlMs = 45_000) {
    const key = this.positionKey(position);
    if (!key) return;
    this.state.blacklistedPositions.set(key, {
      reason,
      until: Date.now() + ttlMs
    });
    this.recordPathFailure(position, { reason, blacklisted: true });
  }

  isPositionBlacklisted(position) {
    const key = this.positionKey(position);
    if (!key) return false;
    const record = this.state.blacklistedPositions.get(key);
    if (record) {
      if (Date.now() > record.until) {
        this.state.blacklistedPositions.delete(key);
      } else {
        return true;
      }
    }

    const recentFailures = (this.state.failures.badPositions || []).filter((entry) => {
      if (!entry?.position) return false;
      return this.positionKey(entry.position) === key && Date.now() - entry.ts <= 45_000;
    });

    if (recentFailures.length >= 3) {
      this.state.blacklistedPositions.set(key, {
        reason: 'repeated_path_failures',
        until: Date.now() + 45_000
      });
      return true;
    }

    return false;
  }

  recordProgress(details = {}) {
    this.state.lastProgressTs = Date.now();
    this.state.lastSuccessTs = Date.now();
    this.state.checkpoints.lastProgress = details;
  }

  snapshot() {
    return JSON.parse(JSON.stringify({
      ...this.state,
      blacklistedTargets: Array.from(this.state.blacklistedTargets.entries()),
      blacklistedPositions: Array.from(this.state.blacklistedPositions.entries())
    }));
  }
}

module.exports = { Blackboard, BOT_MODES };
