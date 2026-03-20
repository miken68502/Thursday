const { EDIBLE_FOOD_NAMES } = require('./food_catalog');

const prepProfiles = Object.freeze({
  default: {
    minFreeSlots: 4,
    requiredFoodAny: true,
    foodCandidates: EDIBLE_FOOD_NAMES,
    toolCandidates: []
  },
  mine: {
    minFreeSlots: 6,
    requiredFoodAny: true,
    foodCandidates: EDIBLE_FOOD_NAMES,
    toolCandidates: ['stone_pickaxe', 'wooden_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']
  },
  wood: {
    minFreeSlots: 4,
    requiredFoodAny: true,
    foodCandidates: EDIBLE_FOOD_NAMES,
    toolCandidates: ['stone_axe', 'wooden_axe', 'iron_axe', 'diamond_axe', 'netherite_axe']
  },
  loose: {
    minFreeSlots: 6,
    requiredFoodAny: true,
    foodCandidates: EDIBLE_FOOD_NAMES,
    toolCandidates: ['stone_shovel', 'wooden_shovel', 'iron_shovel', 'diamond_shovel', 'netherite_shovel']
  },
  combat: {
    minFreeSlots: 2,
    requiredFoodAny: true,
    foodCandidates: EDIBLE_FOOD_NAMES,
    toolCandidates: ['stone_sword', 'wooden_sword', 'iron_sword', 'diamond_sword', 'netherite_sword']
  }
});

module.exports = { prepProfiles };
