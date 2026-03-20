const movementProfiles = {
  follow_safe: {
    allowParkour: false,
    canDig: false,
    allow1by1towers: false,
    maxDropDown: 5,
    goalRange: 2
  },
  worker_general: {
    allowParkour: true,
    canDig: true,
    allow1by1towers: false,
    maxDropDown: 5,
    goalRange: 1
  },
  combat_aggressive: {
    allowParkour: true,
    canDig: false,
    allow1by1towers: false,
    maxDropDown: 5,
    goalRange: 1
  },
  recovery_escape: {
    allowParkour: true,
    canDig: true,
    allow1by1towers: false,
    maxDropDown: 5,
    goalRange: 1
  },
  builder_precise: {
    allowParkour: false,
    canDig: false,
    allow1by1towers: false,
    maxDropDown: 3,
    goalRange: 0
  },

  wood_platform: {
    allowParkour: true,
    canDig: false,
    allow1by1towers: true,
    maxDropDown: 5,
    goalRange: 1
  },
};

module.exports = { movementProfiles };
