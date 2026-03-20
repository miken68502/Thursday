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
    toolCandidates: ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe']
  },
  wood: {
    minFreeSlots: 4,
    requiredFoodAny: true,
    foodCandidates: EDIBLE_FOOD_NAMES,
    toolCandidates: ['diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe']
  },
  loose: {
    minFreeSlots: 6,
    requiredFoodAny: true,
    foodCandidates: EDIBLE_FOOD_NAMES,
    toolCandidates: ['diamond_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel']
  },
  combat: {
    minFreeSlots: 2,
    requiredFoodAny: true,
    foodCandidates: EDIBLE_FOOD_NAMES,
    toolCandidates: ['diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword']
  }
});

module.exports = { prepProfiles };
