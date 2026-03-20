class Watchdog {
  constructor({ blackboard, logger, scheduler }) {
    this.blackboard = blackboard;
    this.logger = logger.child('Watchdog');
    this.scheduler = scheduler;
    this.maxStaleMs = 20_000;
  }

  async tick() {
    const lastProgress = this.blackboard.get('lastProgressTs', Date.now());
    const lastHeartbeat = this.blackboard.get('lastHeartbeatTs', 0);
    const activeType = this.scheduler.active?.job?.type || null;
    const activeStartedAt = this.blackboard.get('activeJob.startedAt', 0);
    const persistentJobs = new Set(['GuardPlayerJob', 'FollowPlayerJob']);
    const staleForMs = Date.now() - lastProgress;
    const heartbeatAgeMs = Date.now() - lastHeartbeat;
    const activeAgeMs = activeStartedAt ? Date.now() - activeStartedAt : 0;

    if (!this.scheduler.active) return;
    if (activeAgeMs && activeAgeMs <= this.maxStaleMs) return;
    if (persistentJobs.has(activeType) && heartbeatAgeMs <= this.maxStaleMs) return;

    if (staleForMs > this.maxStaleMs) {
      this.logger.warn('Progress timeout detected', {
        activeJob: activeType,
        staleForMs
      });
      this.scheduler.cancelActive('watchdog_stale_progress');
    }
  }
}

module.exports = { Watchdog };
