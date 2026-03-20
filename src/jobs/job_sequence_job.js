const { BaseJob } = require('./base_job');

class JobSequenceJob extends BaseJob {
  constructor(params = {}) {
    super('JobSequenceJob', params);
    this.jobs = params.jobs || [];
    this.index = params.startIndex || 0;
    this.activeSubJob = null;
    this.sequenceId = params.sequenceId || null;
  }

  snapshot() {
    return {
      type: this.type,
      sequenceId: this.sequenceId,
      index: this.index,
      total: this.jobs.length,
      subTypes: this.jobs.map((j) => j.type),
      activeSubType: this.activeSubJob?.type || null,
      ts: Date.now()
    };
  }

  persistSnapshot(context, status = 'running') {
    if (!context?.blackboard) return;
    const id = this.sequenceId || context.blackboard.get('activeJob.id') || 'unknown';
    const store = context.blackboard.get('checkpoints.sequence', {});
    store[id] = { ...this.snapshot(), status };
    context.blackboard.patch('checkpoints.sequence', store);
    context.blackboard.patch('checkpoints.lastSequenceId', id);
  }

  async step(context, token) {
    const logger = context?.logger?.child ? context.logger.child(this.type) : null;
    if (token.cancelled) {
      this.persistSnapshot(context, 'cancelled');
      return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason, snapshot: this.snapshot() });
    }
    if (!this.jobs.length) {
      this.persistSnapshot(context, 'done');
      return this.stepResult(true, 'DONE', false, { completed: 0 });
    }

    if (!this.activeSubJob) this.activeSubJob = this.jobs[this.index] || null;
    if (!this.activeSubJob) {
      this.persistSnapshot(context, 'done');
      return this.stepResult(true, 'DONE', false, { completed: this.index });
    }

    this.currentStepId = `subjob_${this.index}_${this.activeSubJob.type}`;
    this.persistSnapshot(context, 'running');
    logger?.info('Sequence stepping subjob', { index: this.index, total: this.jobs.length, activeSubType: this.activeSubJob.type });
    const result = await this.activeSubJob.step(context, token);
    logger?.info('Sequence subjob result', { index: this.index, activeSubType: this.activeSubJob.type, result });

    if (result.ok && result.code === 'DONE') {
      this.index += 1;
      this.activeSubJob = null;
      logger?.info('Sequence advanced', { nextIndex: this.index, total: this.jobs.length });
      if (this.index >= this.jobs.length) {
        this.persistSnapshot(context, 'done');
        return this.stepResult(true, 'DONE', false, { completed: this.index });
      }
      this.persistSnapshot(context, 'running');
      return this.stepResult(true, 'SUCCESS', false, { advancedTo: this.index }, 'continue_sequence');
    }

    if (result.ok && result.code === 'SUCCESS') {
      this.persistSnapshot(context, 'running');
      return this.stepResult(true, 'SUCCESS', false, { waitingOn: this.activeSubJob.type });
    }

    if (!result.ok) {
      this.persistSnapshot(context, 'failed');
      return result;
    }
    this.persistSnapshot(context, 'running');
    return this.stepResult(true, 'SUCCESS', false, { waitingOn: this.activeSubJob.type });
  }
}

module.exports = { JobSequenceJob };
