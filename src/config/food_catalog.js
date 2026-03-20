const EDIBLE_FOOD_NAMES = Object.freeze([
  'bread',
  'cooked_beef',
  'cooked_porkchop',
  'baked_potato',
  'carrot',
  'apple'
]);

function isKnownEdibleName(name) {
  return EDIBLE_FOOD_NAMES.includes(name);
}

module.exports = { EDIBLE_FOOD_NAMES, isKnownEdibleName };
