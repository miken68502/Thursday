async function openContainerAction(context, block, options = {}) {
  return context.services.inventory.openContainer(block, options);
}

module.exports = { openContainerAction };
