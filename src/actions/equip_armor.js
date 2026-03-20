async function equipArmorAction(context) {
  return context.services.inventory.equipArmor();
}

module.exports = { equipArmorAction };
