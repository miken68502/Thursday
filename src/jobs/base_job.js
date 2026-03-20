class BaseJob {
  constructor(type, params = {}) {
    this.type = type;
    this.params = params;
    this.currentStep = 0;
    this.currentStepId = null;
  }

  stepResult(ok, code, retryable, details = {}, nextHint = '') {
    return { ok, code, retryable, details, nextHint };
  }

  async step(_context, token) {
    if (token.cancelled) {
      return this.stepResult(false, 'INTERRUPTED', false, { reason: token.reason });
    }
    return this.stepResult(true, 'DONE', false);
  }
}

module.exports = { BaseJob };
