const { goals: { GoalNear }, Movements } = require('mineflayer-pathfinder');

function actionResult(ok, code, retryable, details = {}, nextHint = '') {
  return { ok, code, retryable, details, nextHint };
}

class NavigationService {
  constructor(bot, movementProfiles, logger, homeService = null) {
    this.bot = bot;
    this.movementProfiles = movementProfiles;
    this.logger = logger.child('NavigationService');
    this.homeService = homeService;
    this.activeProfile = 'worker_general';
  }

  setProfile(name) {
    if (!this.movementProfiles[name]) return false;
    this.activeProfile = name;
    return true;
  }

  buildMovements(profileName, position) {
    if (!Movements) return null;
    const config = this.movementProfiles[profileName] || this.movementProfiles[this.activeProfile] || {};
    const movements = new Movements(this.bot);
    movements.allowParkour = !!config.allowParkour;
    movements.canDig = config.canDig !== false;
    movements.canOpenDoors = config.canOpenDoors !== false;
    if ('allow1by1towers' in movements) movements.allow1by1towers = config.allow1by1towers !== false;
    if ('maxDropDown' in movements && Number.isFinite(config.maxDropDown)) movements.maxDropDown = config.maxDropDown;

    const protectedRadius = this.homeService?.getProtectionRadius?.() ?? 25;
    const inProtectedArea = this.homeService?.isProtectedPosition?.(this.bot.entity.position, protectedRadius)
      || this.homeService?.isProtectedPosition?.(position, protectedRadius);

    if (inProtectedArea) {
      movements.canDig = false;
    }

    if (Array.isArray(movements.exclusionAreasBreak) && this.homeService?.getAnchor?.()) {
      const anchor = this.homeService.getAnchor();
      movements.exclusionAreasBreak.push((block) => {
        if (!block?.position || !anchor) return 0;
        return anchor.distanceTo(block.position) <= protectedRadius ? 1000 : 0;
      });
    }

    return movements;
  }

  async moveToPosition(position, options = {}) {
    try {
      const profile = options.profile || this.activeProfile;
      const range = options.range ?? this.movementProfiles[profile]?.goalRange ?? 1;
      const movements = this.buildMovements(profile, position);
      if (movements) this.bot.pathfinder.setMovements(movements);
      await this.bot.pathfinder.goto(new GoalNear(position.x, position.y, position.z, range));
      return actionResult(true, 'SUCCESS', false, {
        profile,
        range,
        canOpenDoors: movements ? movements.canOpenDoors : true,
        canDig: movements ? movements.canDig : undefined,
        allow1by1towers: movements ? movements.allow1by1towers : undefined,
        maxDropDown: movements ? movements.maxDropDown : undefined
      });
    } catch (error) {
      this.logger.warn('Move failed', { error: error.message });
      return actionResult(false, 'NO_PATH', true, { error: error.message });
    }
  }

  async resetPath() {
    this.bot.pathfinder.setGoal(null);
    return actionResult(true, 'SUCCESS', false);
  }
}

module.exports = { NavigationService };
