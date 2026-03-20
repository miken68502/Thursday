const { result } = require('./_helpers');

async function sleepInBedAction(context, bed) {
  if (!bed) return result(false, 'NO_TARGET', false, { reason: 'bed_missing' });
  try {
    await context.bot.sleep(bed);
    return result(true, 'SUCCESS', false, { bed: bed.position });
  } catch (error) {
    return result(false, 'FAILED', true, { error: error.message });
  }
}

module.exports = { sleepInBedAction };
