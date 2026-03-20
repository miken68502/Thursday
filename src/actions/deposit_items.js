async function depositItemsAction(context, container, policy) {
  return context.services.inventory.depositItems(container, policy);
}

module.exports = { depositItemsAction };
