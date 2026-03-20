const { result } = require('./_helpers');

async function digBlockAction(context, block, options = {}) {
  try {
    if (!block) return result(false, 'NO_TARGET', false);
    const home = context.services?.home;
    if (!options.ignoreHomeProtection && home?.isProtectedPosition?.(block.position)) {
      return result(false, 'HOME_PROTECTED', false, {
        reason: 'home_protection_radius',
        block: block.name,
        position: block.position,
        radius: home.getProtectionRadius?.() ?? 25
      });
    }
    await context.bot.dig(block);
    return result(true, 'SUCCESS', false, { block: block.name });
  } catch (error) {
    return result(false, 'FAILED', true, { error: error.message });
  }
}

module.exports = { digBlockAction };
