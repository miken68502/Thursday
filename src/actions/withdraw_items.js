async function withdrawItemsAction(context, container, request) {
  return context.services.inventory.withdrawItems(container, request);
}

module.exports = { withdrawItemsAction };
