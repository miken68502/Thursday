const { result } = require('./_helpers');

async function attackTargetAction(context, entity) {
  try {
    if (!entity) return result(false, 'NO_TARGET', false);
    context.bot.attack(entity);
    return result(true, 'SUCCESS', false, { target: entity.name || entity.type });
  } catch (error) {
    return result(false, 'FAILED', true, { error: error.message });
  }
}

module.exports = { attackTargetAction };
