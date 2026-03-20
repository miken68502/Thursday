function result(ok, code, retryable, details = {}, nextHint = '') {
  return { ok, code, retryable, details, nextHint };
}

module.exports = { result };
