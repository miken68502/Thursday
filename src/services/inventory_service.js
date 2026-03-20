function result(ok, code, retryable, details = {}, nextHint = '') {
  return { ok, code, retryable, details, nextHint };
}

const { EDIBLE_FOOD_NAMES, isKnownEdibleName } = require('../config/food_catalog');

class InventoryService {
  constructor(bot, logger, itemPolicies, toolCatalog, homeService = null) {
    this.bot = bot;
    this.logger = logger.child('InventoryService');
    this.itemPolicies = itemPolicies;
    this.toolCatalog = toolCatalog;
    this.homeService = homeService;
    this.sortInFlight = false;
  }

  getSummary() {
    const items = this.inventoryItems();
    const usedSlots = items.length;
    return {
      usedSlots,
      freeSlots: 36 - usedSlots,
      fullness: usedSlots / 36,
      summary: items.reduce((acc, item) => ({ ...acc, [item.name]: (acc[item.name] || 0) + item.count }), {})
    };
  }

  findBestInventoryItem(names) {
    const items = this.inventoryItems();
    for (const name of names) {
      const found = items.find((item) => item.name === name);
      if (found) return found;
    }
    return null;
  }

  inventoryItems() {
    return this.bot.inventory.items();
  }

  isEdibleItem(item) {
    if (!item?.name) return false;
    if (isKnownEdibleName(item.name)) return true;
    const registryItem = this.bot.registry?.itemsByName?.[item.name];
    return Boolean((item.foodPoints || 0) > 0 || (registryItem && (registryItem.foodPoints || registryItem.food || registryItem.saturation) != null));
  }

  edibleFoods() {
    return this.inventoryItems().filter((item) => this.isEdibleItem(item));
  }

  edibleFoodCount() {
    return this.edibleFoods().reduce((total, item) => total + (item.count || 0), 0);
  }

  hasEdibleFood() {
    return this.edibleFoodCount() > 0;
  }

  storageCategory(itemName) {
    const n = itemName || '';
    if (/ore|ingot|raw_/.test(n)) return 'ores';
    if (/cobblestone|stone|deepslate/.test(n)) return 'stone';
    if (/log|planks|sapling|stick/.test(n)) return 'wood';
    if (/bread|beef|pork|potato|carrot|apple|melon/.test(n)) return 'food';
    if (/pickaxe|axe|sword|shovel|hoe|helmet|chestplate|leggings|boots/.test(n)) return 'tools';
    if (/coal|charcoal|blaze_rod/.test(n)) return 'fuel';
    return 'misc';
  }

  classify(itemName) {
    if (this.itemPolicies.keep?.[itemName] !== undefined) return 'keep';
    if (this.itemPolicies.store?.[itemName]) return 'store';
    if (this.itemPolicies.junk?.[itemName]) return 'junk';
    return this.itemPolicies.defaults?.unknown || 'store';
  }

  keepQuota(itemName) {
    const value = this.itemPolicies.keep?.[itemName];
    return typeof value === 'number' ? value : 0;
  }

  countItem(itemName) {
    return this.inventoryItems().filter((i) => i.name === itemName).reduce((n, i) => n + i.count, 0);
  }

  isReservedTool(item) {
    const reserve = this.itemPolicies.reserveTools || {};
    const isSword = (this.toolCatalog.sword || []).includes(item.name);
    const isPickaxe = (this.toolCatalog.pickaxe || []).includes(item.name);
    const isAxe = (this.toolCatalog.axe || []).includes(item.name);
    const isShovel = (this.toolCatalog.shovel || []).includes(item.name);
    if (isSword && reserve.sword > 0) return true;
    if (isPickaxe && reserve.pickaxe > 0) return true;
    if (isAxe && reserve.axe > 0) return true;
    if (isShovel && reserve.shovel > 0) return true;
    return false;
  }

  planDeposit(policy = 'store_excess') {
    const items = this.bot.inventory.items();
    const plan = [];

    for (const item of items) {
      if (this.isReservedTool(item)) continue;
      const className = this.classify(item.name);

      if (policy === 'junk_only') {
        if (className === 'junk') plan.push({ item, amount: item.count, reason: 'junk', category: this.storageCategory(item.name) });
        continue;
      }

      if (className === 'junk') {
        plan.push({ item, amount: item.count, reason: 'junk', category: this.storageCategory(item.name) });
        continue;
      }

      if (className === 'keep') {
        const quota = this.keepQuota(item.name);
        const total = this.countItem(item.name);
        const extra = Math.max(0, total - quota);
        if (extra > 0) plan.push({ item, amount: Math.min(extra, item.count), reason: 'keep_over_quota', category: this.storageCategory(item.name) });
        continue;
      }

      if (className === 'store') {
        plan.push({ item, amount: item.count, reason: 'store', category: this.storageCategory(item.name) });
      }
    }

    return plan;
  }

  inventoryPressure() {
    const summary = this.getSummary();
    const minFree = this.itemPolicies.defaults?.minFreeSlots ?? 4;
    const junkCount = this.inventoryItems().filter((i) => this.classify(i.name) === 'junk').length;
    return {
      ...summary,
      minFreeSlots: minFree,
      lowFreeSlots: summary.freeSlots <= minFree,
      hasJunk: junkCount > 0
    };
  }

  async equipArmor() {
    const armorSlots = ['head', 'torso', 'legs', 'feet'];
    let equipped = 0;

    for (const slot of armorSlots) {
      const candidates = this.bot.inventory.items().filter((item) => item.name.includes(slot === 'torso' ? 'chestplate' : slot));
      if (!candidates.length) continue;
      try {
        await this.bot.equip(candidates[0], 'armor');
        equipped += 1;
      } catch (error) {
        this.logger.debug('Armor equip failed', { slot, error: error.message });
      }
    }

    return result(true, 'SUCCESS', false, { equippedSlots: equipped });
  }

  async equipBestWeapon() {
    const best = this.findBestInventoryItem(this.toolCatalog.sword || []);
    if (!best) return result(false, 'MISSING_TOOL', true, { type: 'weapon' });
    try {
      await this.bot.equip(best, 'hand');
      return result(true, 'SUCCESS', false, { weapon: best.name });
    } catch (error) {
      return result(false, 'FAILED', true, { error: error.message, weapon: best.name });
    }
  }

  inferToolClass(block) {
    const name = block?.name || '';
    if (/(_log|_stem|mangrove_roots|bamboo_block)/.test(name)) return 'axe';
    if (/(sand|red_sand|gravel|dirt|grass_block|coarse_dirt|rooted_dirt|mud|clay|snow|snow_block|concrete_powder)/.test(name)) return 'shovel';
    if (/(_leaves|vine|azalea|flowering_azalea|grass|fern|crop|wheat|carrots|potatoes|beetroots|cocoa|melon|pumpkin)/.test(name)) return 'none';
    return 'pickaxe';
  }

  resolveHarvestTool(block) {
    const harvestTools = block?.harvestTools || null;
    if (harvestTools && typeof harvestTools === 'object') {
      const inventoryItems = this.inventoryItems();
      const exactTool = inventoryItems.find((item) => harvestTools[item.type]);
      if (exactTool) {
        const toolClass = exactTool.name.includes('_axe') ? 'axe' : exactTool.name.includes('_pickaxe') ? 'pickaxe' : exactTool.name.includes('_shovel') ? 'shovel' : exactTool.name.includes('_sword') ? 'sword' : 'tool';
        return { item: exactTool, toolClass, source: 'harvestTools' };
      }
    }

    const toolClass = this.inferToolClass(block);
    if (toolClass === 'none') return { item: null, toolClass, source: 'inferred' };
    const best = this.findBestInventoryItem(this.toolCatalog[toolClass] || []);
    return { item: best, toolClass, source: 'catalog' };
  }

  async equipBestTool(block) {
    const choice = this.resolveHarvestTool(block);
    if (choice.toolClass === 'none') return result(true, 'SUCCESS', false, { tool: null, toolClass: 'none', source: choice.source, block: block?.name });
    if (!choice.item) return result(false, 'MISSING_TOOL', true, { toolClass: choice.toolClass, block: block?.name, source: choice.source });
    try {
      await this.bot.equip(choice.item, 'hand');
      return result(true, 'SUCCESS', false, { tool: choice.item.name, toolClass: choice.toolClass, source: choice.source });
    } catch (error) {
      return result(false, 'FAILED', true, { error: error.message, tool: choice.item.name });
    }
  }



  async unequipAndDropArmor() {
    const slots = ['head', 'torso', 'legs', 'feet'];
    const dropped = [];

    for (const slot of slots) {
      const before = this.getSummary().summary || {};
      try {
        await this.bot.unequip(slot);
      } catch (_error) {
        continue;
      }

      const afterItems = this.inventoryItems();
      const after = afterItems.reduce((acc, item) => ({ ...acc, [item.name]: (acc[item.name] || 0) + item.count }), {});
      const unequippedName = Object.keys(after).find((name) => (after[name] || 0) > (before[name] || 0));
      if (!unequippedName) continue;

      const stack = afterItems.find((item) => item.name === unequippedName);
      if (!stack) continue;

      try {
        await this.bot.tossStack(stack);
        dropped.push(unequippedName);
      } catch (error) {
        this.logger.debug('Armor toss failed', { slot, armor: unequippedName, error: error.message });
      }
    }

    if (!dropped.length) return result(false, 'NO_ARMOR', false, { dropped });
    return result(true, 'SUCCESS', false, { dropped, count: dropped.length });
  }

  async eatBestFood() {
    const foods = this.edibleFoods();
    if (!foods.length) return result(false, 'FAILED', false, { reason: 'no_food' });
    try {
      await this.bot.equip(foods[0], 'hand');
      await this.bot.consume();
      return result(true, 'SUCCESS', false, { food: foods[0].name });
    } catch (error) {
      return result(false, 'FAILED', true, { error: error.message });
    }
  }

  getContainerItems(container) {
    if (!container) return [];
    if (typeof container.containerItems === 'function') {
      try {
        return container.containerItems() || [];
      } catch (_error) {
        return [];
      }
    }
    return [];
  }

  inferChestCategoryFromContents(container) {
    const items = this.getContainerItems(container);
    if (!items.length) return 'misc';
    const counts = {};
    for (const item of items) {
      const category = this.storageCategory(item.name);
      counts[category] = (counts[category] || 0) + (item.count || 1);
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'misc';
  }

  async relocateChestMisfits(container, chestPos, category) {
    if (!this.homeService || !container || !chestPos || !category) return;
    const items = this.getContainerItems(container);
    const originalKey = `${chestPos.x}:${chestPos.y}:${chestPos.z}`;
    let moved = 0;

    for (const item of items) {
      if (moved >= 6) break;
      const itemCategory = this.storageCategory(item.name);
      if (itemCategory === category) continue;
      if (this.getSummary().freeSlots <= 1) break;

      const targetPos = this.homeService.getChestByCategory(itemCategory, this.bot.entity.position);
      if (!targetPos) continue;
      const targetKey = `${targetPos.x}:${targetPos.y}:${targetPos.z}`;
      if (targetKey === originalKey) continue;

      const pulled = await this.withdrawItems(container, { name: item.name, amount: item.count });
      if (!pulled.ok) continue;

      try {
        const targetBlock = this.bot.blockAt(targetPos);
        const openedTarget = await this.openContainer(targetBlock, { sort: false });
        if (!openedTarget.ok) continue;
        const targetContainer = openedTarget.details.container;
        try {
          await targetContainer.deposit(item.type, null, item.count);
          moved += item.count;
        } finally {
          if (targetContainer?.close) targetContainer.close();
        }
      } catch (error) {
        this.logger.debug('Chest sort relocation failed', { item: item.name, error: error.message, from: chestPos, to: targetPos });
      }
    }

    if (moved > 0) {
      this.logger.info('Chest sorted', { chest: chestPos, category, moved });
    }
  }

  async sortOpenedContainer(container, options = {}) {
    if (this.sortInFlight || !this.homeService || !container) return;
    const chestPos = options.chestPos || null;
    if (!chestPos) return;

    this.sortInFlight = true;
    try {
      let category = this.homeService.getChestCategory(chestPos);
      if (!category) {
        category = this.inferChestCategoryFromContents(container);
        this.homeService.setChestCategory(chestPos, category);
      }
      await this.relocateChestMisfits(container, chestPos, category);
    } catch (error) {
      this.logger.debug('Chest sort skipped', { error: error.message, chest: chestPos });
    } finally {
      this.sortInFlight = false;
    }
  }

  async openContainer(block, _options = {}) {
    if (!block) return result(false, 'NO_TARGET', false, { reason: 'container_missing' });
    try {
      const container = await this.bot.openContainer(block);
      return result(true, 'SUCCESS', false, { container });
    } catch (error) {
      return result(false, 'FAILED', true, { error: error.message });
    }
  }

  async depositItems(container, policy = 'store_excess') {
    if (!container) return result(false, 'NO_TARGET', true, { reason: 'container_missing' });

    const plan = this.planDeposit(policy);
    let moved = 0;
    const movedByReason = {};

    for (const step of plan) {
      try {
        await container.deposit(step.item.type, null, step.amount);
        moved += step.amount;
        movedByReason[step.reason] = (movedByReason[step.reason] || 0) + step.amount;
      } catch (error) {
        this.logger.debug('Deposit skip', { item: step.item.name, error: error.message });
      }
    }

    return result(true, 'SUCCESS', false, { moved, movedByReason, planned: plan.length });
  }

  async withdrawItems(container, request = {}) {
    if (!container || !request.name || !request.amount) return result(false, 'FAILED', false, { reason: 'invalid_withdraw_request' });
    const item = this.bot.registry.itemsByName[request.name];
    if (!item) return result(false, 'FAILED', false, { reason: 'unknown_item' });
    try {
      await container.withdraw(item.id, null, request.amount);
      return result(true, 'SUCCESS', false, request);
    } catch (error) {
      return result(false, 'FAILED', true, { error: error.message, request });
    }
  }
}

module.exports = { InventoryService };
