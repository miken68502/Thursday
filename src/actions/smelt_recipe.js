async function smeltRecipeAction(context, request) {
  return context.services.crafting.smelt(request);
}

module.exports = { smeltRecipeAction };
