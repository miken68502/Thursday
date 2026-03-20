const test = require('node:test');
const assert = require('node:assert/strict');

const { TaskIntakeService } = require('../src/services/task_intake_service');

class SilentLogger {
  child() { return this; }
  info() {}
}

function makeService(overrides = {}) {
  const enqueued = [];
  const bot = {
    entity: { position: { clone: () => ({ x: 1, y: 2, z: 3 }) } },
    chatMessages: [],
    chat(msg) { this.chatMessages.push(msg); }
  };

  const scheduler = {
    enqueue(job, options) {
      const id = `id-${enqueued.length + 1}`;
      enqueued.push({ id, job, options });
      return id;
    },
    cancelActive() { return true; }
  };

  const blackboard = {
    state: { designatedPlayer: 'Owner', checkpoints: { sequence: { 'seq-x': { status: 'cancelled', index: 2, subTypes: ['PrepareForJobJob','MineResourceJob','SmeltItemsJob','DepositInventoryJob'] } }, lastSequenceId: 'seq-x' } },
    get(path) {
      if (path === 'designatedPlayer') return this.state.designatedPlayer;
      if (path === 'activeJob') return { type: null };
      if (path === 'mode') return 'IDLE';
      if (path === 'inventory') return { fullness: 0.1 };
      if (path === 'checkpoints.sequence') return this.state.checkpoints.sequence;
      if (path === 'checkpoints.lastSequenceId') return this.state.checkpoints.lastSequenceId;
      return null;
    },
    patch(path, value) {
      if (path === 'checkpoints.sequence') this.state.checkpoints.sequence = value;
      if (path === 'checkpoints.lastSequenceId') this.state.checkpoints.lastSequenceId = value;
    }
  };

  const jobs = {
    MineResourceJob: class { constructor(params) { this.type = 'MineResourceJob'; this.params = params; } },
    GatherWoodJob: class { constructor(params) { this.type = 'GatherWoodJob'; this.params = params; } },
    FollowPlayerJob: class { constructor() { this.type = 'FollowPlayerJob'; } },
    GuardPlayerJob: class { constructor(params) { this.type = 'GuardPlayerJob'; this.params = params; } },
    ReturnHomeJob: class { constructor(params) { this.type = 'ReturnHomeJob'; this.params = params; } },
    DepositInventoryJob: class { constructor(params) { this.type = 'DepositInventoryJob'; this.params = params; } },
    SleepJob: class { constructor() { this.type = 'SleepJob'; } },
    CraftItemJob: class { constructor(params) { this.type = 'CraftItemJob'; this.params = params; } },
    SmeltItemsJob: class { constructor(params) { this.type = 'SmeltItemsJob'; this.params = params; } },
    PrepareForJobJob: class { constructor(params) { this.type = 'PrepareForJobJob'; this.params = params; } },
    ClearAreaJob: class { constructor(params) { this.type = 'ClearAreaJob'; this.params = params; } },
    HarvestCropsJob: class { constructor(params) { this.type = 'HarvestCropsJob'; this.params = params; } },
    PlantCropsJob: class { constructor(params) { this.type = 'PlantCropsJob'; this.params = params; } },
    DigDownJob: class { constructor(params) { this.type = 'DigDownJob'; this.params = params; } },
    JobSequenceJob: class { constructor(params) { this.type = 'JobSequenceJob'; this.params = params; } }
  };

  const priorities = {
    playerCritical: 70,
    combatDefense: 90,
    inventoryMaintenance: 40,
    sleep: 75,
    idleBehavior: 10
  };

  const planner = {
    schedulePlan: (_goal, _scheduler) => ({ plan: [{ kind: 'EnsureItem' }, { kind: 'CraftItem' }], ids: ['id-p1'] })
  };

  const diagnostics = { formatReport: () => 'State=WORK | Job=MineResourceJob' };

  const home = {
    getProtectionRadius: () => 25,
    scanStationsNear: () => ({ chests: 2, beds: 1, furnaces: 1, craftingTables: 1 }),
    getStationSummary: () => ({ chests: 2, beds: 1, furnaces: 1, craftingTables: 1 })
  };

  const service = new TaskIntakeService({
    bot,
    logger: new SilentLogger(),
    scheduler,
    blackboard,
    jobs,
    priorities,
    planner,
    diagnostics,
    home,
    ...overrides
  });

  return { service, enqueued, bot };
}

test('parses mine command and schedules prep + mining chain for owner', () => {
  const { service, enqueued } = makeService();
  const accepted = service.handleChat('Owner', '!bot mine iron 20');
  assert.equal(accepted, true);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].job.type, 'JobSequenceJob');
  assert.equal(enqueued[0].job.params.jobs[0].type, 'PrepareForJobJob');
  assert.equal(enqueued[0].job.params.jobs[1].type, 'MineResourceJob');
  assert.equal(enqueued[0].job.params.jobs[1].params.resource, 'iron');
  assert.equal(enqueued[0].job.params.jobs[1].params.amount, 20);
});

test('supports aliases and help command', () => {
  const { service, enqueued, bot } = makeService();
  const mineAlias = service.handleChat('Owner', '!bot dig coal 8');
  const help = service.handleChat('Owner', '!bot h');

  assert.equal(mineAlias, true);
  assert.equal(help, true);
  assert.equal(enqueued[0].job.type, 'JobSequenceJob');
  assert.equal(bot.chatMessages.some((m) => m.includes('Commands:')), true);
});

test('parses dig down command and schedules prep + dig-down chain', () => {
  const { service, enqueued } = makeService();
  const accepted = service.handleChat('Owner', '!bot dig down -64 north');
  assert.equal(accepted, true);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].job.type, 'JobSequenceJob');
  assert.equal(enqueued[0].job.params.jobs[0].type, 'PrepareForJobJob');
  assert.equal(enqueued[0].job.params.jobs[1].type, 'DigDownJob');
  assert.equal(enqueued[0].job.params.jobs[1].params.targetY, -64);
  assert.equal(enqueued[0].job.params.jobs[1].params.direction, 'north');
});

test('schedules iron_loop template with fallback chain', () => {
  const { service, enqueued } = makeService();
  const accepted = service.handleChat('Owner', '!bot template iron_loop 12');
  assert.equal(accepted, true);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].job.type, 'JobSequenceJob');
  assert.equal(enqueued[0].job.params.jobs.length, 4);
  assert.equal(enqueued[0].job.params.jobs[1].type, 'MineResourceJob');
  assert.equal(enqueued[0].job.params.jobs[2].type, 'SmeltItemsJob');
  assert.equal(enqueued[0].job.params.jobs[3].type, 'DepositInventoryJob');
});

test('rejects unauthorized user commands', () => {
  const { service, enqueued } = makeService();
  const accepted = service.handleChat('Stranger', '!bot mine coal 16');
  assert.equal(accepted, false);
  assert.equal(enqueued.length, 0);
});

test('supports status and stop control commands', () => {
  const { service, bot } = makeService();
  const statusAccepted = service.handleChat('Owner', '!bot status');
  const stopAccepted = service.handleChat('Owner', '!bot stop');

  assert.equal(statusAccepted, true);
  assert.equal(stopAccepted, true);
  assert.equal(bot.chatMessages.length >= 2, true);
});


test('supports planner command and cleararea command', () => {
  const { service, enqueued, bot } = makeService();
  const planned = service.handleChat('Owner', '!bot plan craft iron_pickaxe 1');
  const clear = service.handleChat('Owner', '!bot cleararea 5');
  assert.equal(planned, true);
  assert.equal(clear, true);
  assert.equal(enqueued[0].job.type, 'ClearAreaJob');
  assert.equal(bot.chatMessages.some((m) => m.includes('Plan queued')), true);
});


test('resume command rebuilds sequence from checkpoint snapshot', () => {
  const { service, enqueued } = makeService();
  const accepted = service.handleChat('Owner', '!bot resume');
  assert.equal(accepted, true);
  assert.equal(enqueued[0].job.type, 'JobSequenceJob');
  assert.equal(enqueued[0].job.params.startIndex, 2);
  assert.equal(enqueued[0].job.params.sequenceId, 'seq-x');
});


test('sethome uses home service scan to report refreshed stations', () => {
  let scanned = 0;
  const { service, bot } = makeService({
    home: {
      getProtectionRadius: () => 30,
      scanStationsNear: () => {
        scanned += 1;
        return { chests: 3, beds: 2, furnaces: 1, craftingTables: 1 };
      },
      getStationSummary: () => ({ chests: 3, beds: 2, furnaces: 1, craftingTables: 1 })
    }
  });

  const accepted = service.handleChat('Owner', '!bot sethome');
  assert.equal(accepted, true);
  assert.equal(scanned, 1);
  assert.equal(bot.chatMessages.some((m) => m.includes('chests=3') && m.includes('beds=2')), true);
});
