const { randomUUID } = require('crypto');

class CancellationToken {
  constructor() {
    this.cancelled = false;
    this.reason = null;
  }

  cancel(reason = 'cancelled') {
    this.cancelled = true;
    this.reason = reason;
  }
}

class Scheduler {
  constructor(blackboard, logger) {
    this.blackboard = blackboard;
    this.logger = logger.child('Scheduler');
    this.queue = [];
    this.active = null;
    this.paused = false;
  }

  enqueue(job, options = {}) {
    const wrapped = {
      id: options.id || randomUUID(),
      priority: options.priority ?? 0,
      retries: 0,
      maxRetries: options.maxRetries ?? 2,
      fallbackFactory: options.fallbackFactory ?? null,
      interruptible: options.interruptible ?? true,
      token: new CancellationToken(),
      createdAt: Date.now(),
      job
    };
    this.queue.push(wrapped);
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    this.logger.info('Job queued', { id: wrapped.id, type: job.type, priority: wrapped.priority });
    return wrapped.id;
  }

  interruptWith(job, options = {}) {
    if (this.active && this.active.interruptible) {
      this.cancelActive('interrupted_by_higher_priority');
    }
    return this.enqueue(job, options);
  }

  cancelActive(reason = 'cancelled') {
    if (!this.active) return false;
    this.active.token.cancel(reason);

    if (typeof this.active.job.snapshot === 'function') {
      const sequence = this.blackboard.get('checkpoints.sequence', {});
      sequence[this.active.id] = { ...this.active.job.snapshot(), status: 'cancelled', reason };
      this.blackboard.patch('checkpoints.sequence', sequence);
      this.blackboard.patch('checkpoints.lastSequenceId', this.active.id);
    }

    this.logger.warn('Active job cancelled', { id: this.active.id, reason });
    this.active = null;
    this.blackboard.patch('activeJob', { id: null, type: null, stepId: null });
    return true;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  hasWork() {
    return !!this.active || this.queue.length > 0;
  }

  isActiveType(type) {
    return this.active?.job?.type === type;
  }

  hasQueuedType(type) {
    return this.queue.some((entry) => entry.job?.type === type);
  }

  async tick(context) {
    if (this.paused) return;
    if (!this.active) {
      this.active = this.queue.shift() || null;
      if (!this.active) return;
      this.blackboard.patch('activeJob', {
        id: this.active.id,
        type: this.active.job.type,
        stepId: null,
        startedAt: Date.now(),
        priority: this.active.priority,
        retries: this.active.retries
      });
      this.blackboard.recordProgress({ jobType: this.active.job.type, stepId: 'job_started' });
      this.logger.info('Job started', { id: this.active.id, type: this.active.job.type });
    }

    const current = this.active;
    let result;
    try {
      result = await current.job.step(context, current.token);
    } catch (error) {
      result = { ok: false, code: 'FAILED', retryable: true, details: { error: error.message } };
    }

    this.blackboard.patch('activeJob.stepId', current.job.currentStepId || null);
    this.blackboard.patch('activeJob.retries', current.retries);

    if (result.ok && result.code !== 'DONE') {
      this.logger.info('Job step success', {
        id: current.id,
        type: current.job.type,
        code: result.code,
        stepId: current.job.currentStepId || null,
        details: result.details || {},
        nextHint: result.nextHint || ''
      });
    }

    if (result.ok && result.code === 'DONE') {
      this.logger.info('Job completed', { id: current.id, type: current.job.type });
      this.active = null;
      this.blackboard.patch('activeJob', { id: null, type: null, stepId: null });
      return;
    }

    if (!result.ok) {
      this.logger.warn('Job step failed', { id: current.id, type: current.job.type, result });
      if (result.code === 'INTERRUPTED') {
        this.active = null;
        return;
      }

      if (result.retryable && current.retries < current.maxRetries) {
        current.retries += 1;
        this.logger.info('Retrying job', { id: current.id, retries: current.retries });
        return;
      }

      this.blackboard.recordFailure({ jobType: current.job.type, code: result.code, details: result.details });
      if (current.fallbackFactory) {
        const fallback = current.fallbackFactory(result);
        if (fallback) this.enqueue(fallback.job, fallback.options);
      }

      this.active = null;
      this.blackboard.patch('activeJob', { id: null, type: null, stepId: null });
    }
  }
}

module.exports = { Scheduler, CancellationToken };
