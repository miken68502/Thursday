async function equipBestWeaponAction(context) {
  return context.services.inventory.equipBestWeapon();
}

module.exports = { equipBestWeaponAction };
