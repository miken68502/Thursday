const { result } = require('./_helpers');

async function equipBestToolAction(context, block) {
  return context.services.inventory.equipBestTool(block);
}

module.exports = { equipBestToolAction };
