function result(ok, code, retryable, details = {}, nextHint = '') {
  return { ok, code, retryable, details, nextHint };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CraftingService {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger.child('CraftingService');
  }

  getItemByName(name) {
    return this.bot.registry.itemsByName[name] || null;
  }

  getBlockByName(name) {
    return this.bot.registry.blocksByName[name] || null;
  }

  findNearbyBlock(name, radius = 16) {
    const blockType = this.getBlockByName(name);
    if (!blockType) return null;
    const found = this.bot.findBlock({ matching: blockType.id, maxDistance: radius });
    return found || null;
  }

  craftableRecipe(itemId, amount, table) {
    const recipes = this.bot.recipesFor(itemId, null, 1, table);
    if (!recipes?.length) return null;
    return recipes[0];
  }

  async craft(request) {
    if (!request?.item) return result(false, 'FAILED', false, { reason: 'missing_item' });

    const amount = request.amount || 1;
    const item = this.getItemByName(request.item);
    if (!item) return result(false, 'FAILED', false, { reason: 'unknown_item', item: request.item });

    const table = this.findNearbyBlock('crafting_table', request.radius || 16);
    const recipe = this.craftableRecipe(item.id, amount, table);
    if (!recipe) {
      return result(false, 'MISSING_MATERIALS', false, {
        item: request.item,
        amount,
        requiresTable: !table
      });
    }

    try {
      await this.bot.craft(recipe, amount, table || null);
      return result(true, 'SUCCESS', false, {
        crafted: request.item,
        amount,
        usedTable: !!table
      });
    } catch (error) {
      return result(false, 'FAILED', true, { error: error.message, crafted: request.item });
    }
  }

  chooseFuel() {
    const preferred = ['coal', 'charcoal'];
    for (const name of preferred) {
      const found = this.bot.inventory.items().find((i) => i.name === name);
      if (found) return found;
    }
    // avoid using planks/logs unless absolutely necessary
    return this.bot.inventory.items().find((i) => /stick|planks|log/.test(i.name)) || null;
  }

  async smelt(request) {
    if (!request?.item) return result(false, 'FAILED', false, { reason: 'missing_item' });

    const inputItem = this.getItemByName(request.item);
    if (!inputItem) return result(false, 'FAILED', false, { reason: 'unknown_item', item: request.item });

    const amount = request.amount || 1;
    const fuelName = request.fuel || null;
    const fuelItem = fuelName ? (this.bot.inventory.items().find((i) => i.name === fuelName) || null) : this.chooseFuel();
    const sourceItem = this.bot.inventory.items().find((i) => i.name === request.item) || null;
    if (!sourceItem) return result(false, 'MISSING_MATERIALS', false, { reason: 'missing_source_item', item: request.item });
    if (!fuelItem) return result(false, 'MISSING_MATERIALS', false, { reason: 'missing_fuel', fuel: fuelName || 'coal/charcoal' });

    const furnaceBlock = this.findNearbyBlock('furnace', request.radius || 16)
      || this.findNearbyBlock('blast_furnace', request.radius || 16)
      || this.findNearbyBlock('smoker', request.radius || 16);
    if (!furnaceBlock) return result(false, 'NO_TARGET', true, { reason: 'furnace_missing' });

    let furnace;
    try {
      furnace = await this.bot.openFurnace(furnaceBlock);
    } catch (error) {
      return result(false, 'FAILED', true, { reason: 'open_furnace_failed', error: error.message });
    }

    try {
      await furnace.putFuel(fuelItem.type, null, 1);
      await furnace.putInput(inputItem.id, null, Math.min(amount, sourceItem.count));
      const waitMs = request.waitMs || 3500;
      await sleep(waitMs);
      const output = furnace.outputItem();
      if (!output) {
        return result(false, 'TIMEOUT', true, { reason: 'smelt_output_not_ready', waitMs });
      }

      await furnace.takeOutput();
      return result(true, 'SUCCESS', false, {
        smeltedInput: request.item,
        output: output.name,
        amount: output.count
      });
    } catch (error) {
      return result(false, 'FAILED', true, { error: error.message, item: request.item });
    } finally {
      furnace.close();
    }
  }
}

module.exports = { CraftingService };
