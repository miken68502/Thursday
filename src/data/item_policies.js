const itemPolicies = {
  defaults: {
    unknown: 'store',
    minFreeSlots: 6
  },
  keep: {
    bread: 16,
    cooked_beef: 24,
    torch: 32,
    crafting_table: 1,
    furnace: 1,
    chest: 1,
    coal: 16
  },
  store: {
    cobblestone: true,
    iron_ore: true,
    deepslate_iron_ore: true,
    oak_log: true,
    birch_log: true,
    spruce_log: true
  },
  junk: {
    dirt: true,
    rotten_flesh: true,
    poisonous_potato: true
  },
  reserveTools: {
    sword: 1,
    pickaxe: 1,
    axe: 1
  }
};

module.exports = { itemPolicies };
