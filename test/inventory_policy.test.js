const test = require('node:test');
const assert = require('node:assert/strict');

const { InventoryService } = require('../src/services/inventory_service');
const { itemPolicies } = require('../src/data/item_policies');
const { toolCatalog } = require('../src/data/tool_catalog');

class SilentLogger {
  child() { return this; }
  debug() {}
}

function makeBot(items) {
  return {
    inventory: { items: () => items },
    registry: { itemsByName: { cobblestone: { id: 1 } } }
  };
}

test('inventory classify supports keep/store/junk maps', () => {
  const svc = new InventoryService(makeBot([]), new SilentLogger(), itemPolicies, toolCatalog);
  assert.equal(svc.classify('bread'), 'keep');
  assert.equal(svc.classify('cobblestone'), 'store');
  assert.equal(svc.classify('dirt'), 'junk');
  assert.equal(svc.classify('unknown_x'), 'store');
});

test('deposit plan respects keep quotas and reserves tools', () => {
  const items = [
    { name: 'bread', count: 20, type: 1 },
    { name: 'dirt', count: 12, type: 2 },
    { name: 'iron_sword', count: 1, type: 3 },
    { name: 'cobblestone', count: 64, type: 4 }
  ];
  const svc = new InventoryService(makeBot(items), new SilentLogger(), itemPolicies, toolCatalog);
  const plan = svc.planDeposit('store_excess');

  assert.equal(plan.some((p) => p.item.name === 'iron_sword'), false);
  assert.equal(plan.some((p) => p.item.name === 'dirt'), true);
  assert.equal(plan.some((p) => p.item.name === 'cobblestone'), true);
  const breadStep = plan.find((p) => p.item.name === 'bread');
  assert.equal(breadStep.amount, 4);
});
