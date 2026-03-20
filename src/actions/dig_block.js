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
    if (typeof context.bot.canDigBlock === 'function' && !context.bot.canDigBlock(block)) {
      return result(false, 'UNBREAKABLE', false, { block: block.name, reason: 'canDigBlock_false' });
    }
    const estimatedDigTimeMs = typeof context.bot.digTime === 'function' ? context.bot.digTime(block) : null;
    await context.bot.dig(block);
    return result(true, 'SUCCESS', false, { block: block.name, estimatedDigTimeMs });
  } catch (error) {
    return result(false, 'FAILED', true, { error: error.message });
  }
}

module.exports = { digBlockAction };
