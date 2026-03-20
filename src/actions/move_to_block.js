const { result } = require('./_helpers');

async function moveToBlockAction(context, block, options = {}) {
  if (!block || !block.position) return result(false, 'NO_TARGET', false, { reason: 'block_missing' });
  return context.services.navigation.moveToPosition(block.position, options);
}

module.exports = { moveToBlockAction };
