async function eatFoodAction(context) {
  return context.services.inventory.eatBestFood();
}

module.exports = { eatFoodAction };
