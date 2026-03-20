const { result } = require('./_helpers');

async function moveToPosAction(context, position, options = {}) {
  try {
    const nav = context.services?.navigation;
    if (!position) return result(false, 'NO_TARGET', false, { reason: 'position_missing' });
    if (!nav) return result(false, 'FAILED', true, { reason: 'navigation_service_missing' });
    const res = await nav.moveToPosition(position, options);
    return res;
  } catch (error) {
    return result(false, 'FAILED', true, { error: error.message });
  }
}

module.exports = { moveToPosAction };
