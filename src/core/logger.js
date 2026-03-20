class Logger {
  constructor(scope = 'Bot', level = 'info') {
    this.scope = scope;
    this.level = level;
    this.levelPriority = { debug: 10, info: 20, warn: 30, error: 40 };
  }

  child(scope) {
    return new Logger(`${this.scope}:${scope}`, this.level);
  }

  setLevel(level) {
    this.level = level;
  }

  shouldLog(level) {
    return this.levelPriority[level] >= this.levelPriority[this.level];
  }

  log(level, message, details = {}) {
    if (!this.shouldLog(level)) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      details
    };
    // Centralized structured logging for easier external ingestion.
    console.log(JSON.stringify(entry));
  }

  debug(message, details) { this.log('debug', message, details); }
  info(message, details) { this.log('info', message, details); }
  warn(message, details) { this.log('warn', message, details); }
  error(message, details) { this.log('error', message, details); }
}

module.exports = { Logger };
