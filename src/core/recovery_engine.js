const { moveToPosAction } = require('../actions/move_to_pos');

class RecoveryEngine {
  constructor({ blackboard, logger, navigationService, homeService }) {
    this.blackboard = blackboard;
    this.logger = logger.child('RecoveryEngine');
    this.navigationService = navigationService;
    this.homeService = homeService;
  }

  detectOscillation() {
    const pathFailures = this.blackboard.get('failures.pathFailures', []);
    if (pathFailures.length < 4) return null;
    const recent = pathFailures.slice(-4).map((f) => f.position && `${f.position.x}:${f.position.y}:${f.position.z}`);
    if (recent[0] && recent[1] && recent[0] === recent[2] && recent[1] === recent[3] && recent[0] !== recent[1]) {
      return [recent[0], recent[1]];
    }
    return null;
  }

  failureCountForTarget(targetId) {
    return this.blackboard.get('failures.badTargets', []).filter((x) => x.targetId === targetId).length;
  }

  shouldAbortJob(jobType) {
    const fails = this.blackboard.get('failures.jobFailures', []).filter((x) => x.jobType === jobType);
    return fails.length >= 3;
  }

  async recover(context, failure) {
    const level = (failure.level || 0) + 1;
    this.blackboard.state.recentRecoveryAttempts.push({ ts: Date.now(), level, failure });

    if (failure.position) this.blackboard.recordPathFailure(failure.position, failure);
    if (failure.targetId) this.blackboard.recordBadTarget(failure.targetId, failure.code || 'FAILED');

    const oscillation = this.detectOscillation();
    if (oscillation) {
      for (const targetId of oscillation) this.blackboard.blacklistTarget(targetId, 'OSCILLATION', 60_000);
      return { ok: false, code: 'STUCK', retryable: true, details: { level, oscillation }, nextHint: 'switch_target' };
    }

    if (failure.targetId && this.failureCountForTarget(failure.targetId) >= 3) {
      this.blackboard.blacklistTarget(failure.targetId, 'TOO_MANY_FAILURES', 90_000);
      return { ok: false, code: 'NO_TARGET', retryable: true, details: { level }, nextHint: 'reject_target' };
    }

    if (failure.jobType && this.shouldAbortJob(failure.jobType)) {
      return { ok: false, code: 'FAILED', retryable: false, details: { reason: 'job_failure_throttle', level }, nextHint: 'abort_job' };
    }

    if (level === 1) return this.softRecovery(context, failure, level);
    if (level === 2) return this.localAlternative(context, failure, level);
    if (level === 3) return this.rejectTarget(context, failure, level);
    if (level === 4) return this.contextReset(context, failure, level);
    return this.failJob(context, failure, level);
  }

  async softRecovery(context, failure, level) {
    this.logger.info('Recovery L1 soft recovery', { failure });
    await this.navigationService.resetPath();
    await context.bot.look(Math.random() * Math.PI * 2, 0, true);
    return { ok: false, code: 'RECOVERING', retryable: true, details: { level }, nextHint: 'repath_after_soft_recovery' };
  }

  async localAlternative(context, failure, level) {
    this.logger.info('Recovery L2 local alternative', { failure });
    const p = context.bot.entity.position.offset((Math.random() > 0.5 ? 1 : -1), 0, (Math.random() > 0.5 ? 1 : -1));
    await moveToPosAction(context, p, { range: 1, profile: 'recovery_escape' });
    return { ok: false, code: 'RECOVERING', retryable: true, details: { level }, nextHint: 'try_alternate_angle' };
  }

  async rejectTarget(context, failure, level) {
    this.logger.warn('Recovery L3 target rejection', { failure });
    if (failure?.targetId) this.blackboard.blacklistTarget(failure.targetId, failure.code || 'FAILED', 45_000);
    return { ok: false, code: 'NO_TARGET', retryable: true, details: { level }, nextHint: 'select_new_target' };
  }

  async contextReset(context, failure, level) {
    this.logger.warn('Recovery L4 context reset', { failure });
    const anchor = this.homeService.getAnchor();
    if (anchor) {
      await moveToPosAction(context, anchor, { range: 3, profile: 'follow_safe' });
    }
    return { ok: false, code: 'RECOVERING', retryable: true, details: { level }, nextHint: 'restart_subtask' };
  }

  async failJob(_context, failure, level) {
    this.logger.error('Recovery L5 aborting job', { failure });
    return { ok: false, code: 'FAILED', retryable: false, details: { level, failure }, nextHint: 'abort_job' };
  }
}

module.exports = { RecoveryEngine };
