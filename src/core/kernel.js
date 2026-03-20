const { BOT_MODES } = require('./blackboard');

class Kernel {
  constructor({ bot, blackboard, logger, scheduler, stateMachine, watchdog, perceptionService, decisionContext, utilityBrain, runtimeContext }) {
    this.bot = bot;
    this.blackboard = blackboard;
    this.logger = logger.child('Kernel');
    this.scheduler = scheduler;
    this.stateMachine = stateMachine;
    this.watchdog = watchdog;
    this.perceptionService = perceptionService;
    this.decisionContext = decisionContext;
    this.utilityBrain = utilityBrain;
    this.runtimeContext = runtimeContext;
    this.running = false;
    this.tickMs = 250;
    this.timer = null;
    this.lastInterruptTs = 0;
    this.interruptCooldownMs = 800;
    this.lastInterruptByReason = new Map();
    this.tickInFlight = false;
  }

  canScheduleInterrupt(decision) {
    const reason = decision.reason || 'unknown';
    const cooldownMs = decision.cooldownMs ?? this.interruptCooldownMs;
    const lastTs = this.lastInterruptByReason.get(reason);
    if (lastTs == null) return true;
    const now = Date.now();
    return now - lastTs > cooldownMs;
  }

  markInterruptScheduled(decision) {
    const reason = decision.reason || 'unknown';
    this.lastInterruptTs = Date.now();
    this.lastInterruptByReason.set(reason, this.lastInterruptTs);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.logger.info('Kernel started', { tickMs: this.tickMs });
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error('Kernel tick error', { error: error.message });
        this.stateMachine.transition(BOT_MODES.ERROR, 'kernel_tick_exception');
      });
    }, this.tickMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  syncModeFromActiveJob() {
    const type = this.scheduler.active?.job?.type || null;
    if (!type) {
      this.stateMachine.transition(BOT_MODES.IDLE, 'no_active_job');
      return;
    }

    if (type === 'GuardPlayerJob') this.stateMachine.transition(BOT_MODES.COMBAT, type);
    else if (type === 'SleepJob') this.stateMachine.transition(BOT_MODES.SLEEP, type);
    else if (type === 'ReturnHomeJob') this.stateMachine.transition(BOT_MODES.RETURN_HOME, type);
    else if (type === 'DepositInventoryJob') this.stateMachine.transition(BOT_MODES.INVENTORY, type);
    else this.stateMachine.transition(BOT_MODES.WORK, type);
  }

  async tick() {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      const snapshot = this.blackboard.snapshot();
      const perceptionContext = this.decisionContext.build(this.bot, snapshot);
      await this.perceptionService.update(perceptionContext);

      const decision = this.utilityBrain.chooseInterrupt(perceptionContext);
      if (decision?.interruptJob?.job?.type === 'SleepJob' && this.scheduler.hasWork()) {
        // Never sleep while active or queued work exists.
      } else if (decision && decision.interruptJob) {
        const jobType = decision.interruptJob.job.type;
        const alreadyScheduled = this.scheduler.isActiveType(jobType) || this.scheduler.hasQueuedType(jobType);
        if (!alreadyScheduled && this.canScheduleInterrupt(decision)) {
          this.logger.info('Interrupt scheduled', {
            reason: decision.reason,
            jobType,
            cooldownMs: decision.cooldownMs ?? this.interruptCooldownMs
          });
          this.scheduler.interruptWith(decision.interruptJob.job, decision.interruptJob.options);
          this.markInterruptScheduled(decision);
        }
      }

      const schedulerContext = { bot: this.bot, blackboard: this.blackboard, ...this.runtimeContext };
      await this.scheduler.tick(schedulerContext);
      this.syncModeFromActiveJob();
      await this.watchdog.tick();
    } finally {
      this.tickInFlight = false;
    }
  }
}

module.exports = { Kernel };
