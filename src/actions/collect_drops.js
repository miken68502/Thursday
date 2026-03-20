async function collectDropsAction(context, filterFn = null) {
  return context.services.world.collectDrops(filterFn);
}

module.exports = { collectDropsAction };
