const { BOT_MODES } = require('./blackboard');

class StateMachine {
  constructor(blackboard, logger) {
    this.blackboard = blackboard;
    this.logger = logger.child('StateMachine');
    this.transitions = new Map([
      [BOT_MODES.IDLE, [BOT_MODES.FOLLOW, BOT_MODES.WORK, BOT_MODES.COMBAT, BOT_MODES.SURVIVAL, BOT_MODES.SLEEP, BOT_MODES.ERROR]],
      [BOT_MODES.FOLLOW, [BOT_MODES.IDLE, BOT_MODES.WORK, BOT_MODES.COMBAT, BOT_MODES.SURVIVAL, BOT_MODES.RETURN_HOME, BOT_MODES.RECOVER]],
      [BOT_MODES.WORK, [BOT_MODES.IDLE, BOT_MODES.COMBAT, BOT_MODES.SURVIVAL, BOT_MODES.INVENTORY, BOT_MODES.RETURN_HOME, BOT_MODES.SLEEP, BOT_MODES.RECOVER]],
      [BOT_MODES.COMBAT, [BOT_MODES.SURVIVAL, BOT_MODES.WORK, BOT_MODES.FOLLOW, BOT_MODES.RECOVER, BOT_MODES.ERROR]],
      [BOT_MODES.SURVIVAL, [BOT_MODES.COMBAT, BOT_MODES.RETURN_HOME, BOT_MODES.SLEEP, BOT_MODES.RECOVER, BOT_MODES.IDLE]],
      [BOT_MODES.INVENTORY, [BOT_MODES.WORK, BOT_MODES.RETURN_HOME, BOT_MODES.IDLE, BOT_MODES.RECOVER]],
      [BOT_MODES.RETURN_HOME, [BOT_MODES.INVENTORY, BOT_MODES.SLEEP, BOT_MODES.IDLE, BOT_MODES.RECOVER]],
      [BOT_MODES.SLEEP, [BOT_MODES.IDLE, BOT_MODES.WORK, BOT_MODES.RECOVER]],
      [BOT_MODES.RECOVER, [BOT_MODES.IDLE, BOT_MODES.WORK, BOT_MODES.ERROR]],
      [BOT_MODES.ERROR, [BOT_MODES.RECOVER, BOT_MODES.IDLE]]
    ]);
  }

  get mode() {
    return this.blackboard.get('mode', BOT_MODES.IDLE);
  }

  canTransition(nextMode) {
    const allowed = this.transitions.get(this.mode) || [];
    return allowed.includes(nextMode);
  }

  transition(nextMode, reason = 'unspecified') {
    if (nextMode === this.mode) return true;
    if (!this.canTransition(nextMode)) {
      this.logger.warn('Invalid state transition blocked', { from: this.mode, to: nextMode, reason });
      return false;
    }

    const from = this.mode;
    this.blackboard.patch('mode', nextMode);
    this.logger.info('Mode transition', { from, to: nextMode, reason });
    return true;
  }
}

module.exports = { StateMachine };
