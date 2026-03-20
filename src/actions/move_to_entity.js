const { result } = require('./_helpers');

async function moveToEntityAction(context, entity, options = {}) {
  if (!entity || !entity.position) return result(false, 'NO_TARGET', false, { reason: 'entity_missing' });
  return context.services.navigation.moveToPosition(entity.position, options);
}

module.exports = { moveToEntityAction };
