async function craftRecipeAction(context, request) {
  return context.services.crafting.craft(request);
}

module.exports = { craftRecipeAction };
