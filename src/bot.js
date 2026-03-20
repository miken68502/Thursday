const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;

const { Logger } = require('./core/logger');
const { Blackboard } = require('./core/blackboard');
const { StateMachine } = require('./core/state_machine');
const { Scheduler } = require('./core/scheduler');
const { Watchdog } = require('./core/watchdog');
const { Kernel } = require('./core/kernel');
const { RecoveryEngine } = require('./core/recovery_engine');

const { DecisionContext } = require('./brain/decision_context');
const { UtilityBrain } = require('./brain/utility');
const { InterruptRules } = require('./brain/interrupt_rules');

const { priorities } = require('./config/priorities');
const { resourceCatalog } = require('./data/resource_catalog');
const { toolCatalog } = require('./data/tool_catalog');
const { hostileCatalog } = require('./data/hostile_catalog');
const { itemPolicies } = require('./data/item_policies');
const { movementProfiles } = require('./data/movement_profiles');

const { NavigationService } = require('./services/navigation_service');
const { CombatService } = require('./services/combat_service');
const { InventoryService } = require('./services/inventory_service');
const { WorldService } = require('./services/world_service');
const { PerceptionService } = require('./services/perception_service');
const { CraftingService } = require('./services/crafting_service');
const { HomeService } = require('./services/home_service');
const { TaskIntakeService } = require('./services/task_intake_service');
const { PlannerService } = require('./services/planner_service');
const { DiagnosticsService } = require('./services/diagnostics_service');
const { SustainabilityService } = require('./services/sustainability_service');

const { FollowPlayerJob } = require('./jobs/follow_player_job');
const { GuardPlayerJob } = require('./jobs/guard_player_job');
const { MineResourceJob } = require('./jobs/mine_resource_job');
const { GatherWoodJob } = require('./jobs/gather_wood_job');
const { ReturnHomeJob } = require('./jobs/return_home_job');
const { DepositInventoryJob } = require('./jobs/deposit_inventory_job');
const { SleepJob } = require('./jobs/sleep_job');
const { CraftItemJob } = require('./jobs/craft_item_job');
const { SmeltItemsJob } = require('./jobs/smelt_items_job');
const { SurvivalPulseJob } = require('./jobs/survival_pulse_job');
const { PrepareForJobJob } = require('./jobs/prepare_for_job_job');
const { ClearAreaJob } = require('./jobs/clear_area_job');
const { HarvestCropsJob } = require('./jobs/harvest_crops_job');
const { PlantCropsJob } = require('./jobs/plant_crops_job');
const { JobSequenceJob } = require('./jobs/job_sequence_job');
const { ComeHereJob } = require('./jobs/come_here_job');
const { IdleWanderJob } = require('./jobs/idle_wander_job');
const { UnequipArmorJob } = require('./jobs/unequip_armor_job');
const { DigDownJob } = require('./jobs/dig_down_job');

function loadEnvironmentFromRootEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').replace(/\r/g, '').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    if (!key) continue;

    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvironmentFromRootEnv();

function createBot(options = {}) {
  const bot = mineflayer.createBot({
    host: process.env.MC_HOST || 'localhost',
    port: Number(process.env.MC_PORT || 25565),
    username: process.env.MC_USERNAME || 'SurvivalWorkerV6'
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlock);

  const logger = new Logger('MinecraftBotV6', process.env.LOG_LEVEL || 'info');
  const blackboard = new Blackboard();
  const scheduler = new Scheduler(blackboard, logger);
  const stateMachine = new StateMachine(blackboard, logger);

  const services = {
    navigation: null,
    combat: new CombatService(bot, logger),
    world: new WorldService(bot, logger),
    crafting: new CraftingService(bot, logger),
    home: new HomeService(blackboard, logger)
  };
  services.navigation = new NavigationService(bot, movementProfiles, logger, services.home);
  services.inventory = new InventoryService(bot, logger, itemPolicies, toolCatalog, services.home);

  const perceptionService = new PerceptionService({
    blackboard,
    bot,
    combatService: services.combat,
    inventoryService: services.inventory,
    hostileCatalog,
    logger
  });

  const jobs = {
    FollowPlayerJob,
    GuardPlayerJob,
    MineResourceJob,
    GatherWoodJob,
    ReturnHomeJob,
    DepositInventoryJob,
    SleepJob,
    CraftItemJob,
    SmeltItemsJob,
    SurvivalPulseJob,
    PrepareForJobJob,
    ClearAreaJob,
    HarvestCropsJob,
    PlantCropsJob,
    JobSequenceJob,
    ComeHereJob,
    IdleWanderJob,
    UnequipArmorJob,
    DigDownJob
  };

  const planner = new PlannerService({ jobs, priorities, logger });
  const diagnostics = new DiagnosticsService({ blackboard });
  const sustainability = new SustainabilityService({ blackboard, logger, jobs, priorities });

  const interruptRules = new InterruptRules({ jobs, priorities });
  const utilityBrain = new UtilityBrain({ logger, interruptRules });
  const decisionContext = new DecisionContext();
  const watchdog = new Watchdog({ blackboard, logger, scheduler });
  const recovery = new RecoveryEngine({ blackboard, logger, navigationService: services.navigation, homeService: services.home });

  const taskIntake = new TaskIntakeService({
    bot,
    logger,
    scheduler,
    blackboard,
    jobs,
    priorities,
    planner,
    diagnostics,
    sustainability,
    home: services.home
  });

  const kernel = new Kernel({
    bot,
    blackboard,
    logger,
    scheduler,
    stateMachine,
    watchdog,
    perceptionService,
    decisionContext,
    utilityBrain,
    runtimeContext: {
      services,
      data: { resourceCatalog, toolCatalog, hostileCatalog, itemPolicies, movementProfiles },
      recovery,
      logger
    }
  });

  const autoRebootEnabled = String(process.env.MC_AUTO_REBOOT || 'true').toLowerCase() !== 'false';
  const autoRebootDelayMs = Number(process.env.MC_REBOOT_DELAY_MS || 4000);
  const idleWanderDelayMs = Number(process.env.MC_IDLE_WANDER_DELAY_MS || 45000);
  const idleWanderCooldownMs = Number(process.env.MC_IDLE_WANDER_COOLDOWN_MS || 30000);
  let rebootScheduled = false;

  function scheduleReboot(trigger, details = {}) {
    if (!autoRebootEnabled || rebootScheduled) return;
    rebootScheduled = true;
    logger.warn('Bot reboot scheduled', { trigger, delayMs: autoRebootDelayMs, details });
    try {
      kernel.stop();
    } catch (_error) {
      // best effort
    }
    if (typeof options.onRebootRequested === 'function') {
      options.onRebootRequested({ trigger, details, delayMs: autoRebootDelayMs });
    }
  }

  bot.once('spawn', () => {
    logger.info('Bot spawned and bootstrap started');
    blackboard.patch('designatedPlayer', process.env.MC_OWNER || null);
    services.home.setAnchor(bot.entity.position.clone());
    services.home.scanStationsNear(bot, 18);
    scheduler.enqueue(new SurvivalPulseJob(), { priority: priorities.survivalEmergency });
    kernel.start();
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    taskIntake.handleChat(username, message);
  });

  let physicsTicks = 0;
  bot.on('physicsTick', () => {
    if (!kernel.running) return;
    physicsTicks += 1;

    const hungerPulseScheduled = scheduler.isActiveType('SurvivalPulseJob') || scheduler.hasQueuedType('SurvivalPulseJob');
    if (bot.food < 14 && !scheduler.hasWork() && !hungerPulseScheduled) {
      scheduler.enqueue(new SurvivalPulseJob(), { priority: priorities.survivalEmergency });
    }

    if (scheduler.hasWork()) {
      blackboard.patch('idleSinceTs', null);
    } else {
      const now = Date.now();
      if (!blackboard.get('idleSinceTs')) blackboard.patch('idleSinceTs', now);
      const idleStartedAt = blackboard.get('idleSinceTs', now);
      const lastIdleWanderTs = blackboard.get('lastIdleWanderTs', 0);
      const hasAnchor = !!services.home.getAnchor();
      const wanderScheduled = scheduler.isActiveType('IdleWanderJob') || scheduler.hasQueuedType('IdleWanderJob');
      if (hasAnchor && !wanderScheduled && now - idleStartedAt >= idleWanderDelayMs && now - lastIdleWanderTs >= idleWanderCooldownMs) {
        blackboard.patch('lastIdleWanderTs', now);
        scheduler.enqueue(new IdleWanderJob({ radius: 5, maxDistance: 8 }), { priority: priorities.idleBehavior });
      }
    }

    if (physicsTicks % 20 === 0) {
      sustainability.maybeSchedule(physicsTicks, scheduler, blackboard.get('inventory.summary', {}));
    }
  });

  bot.on('error', (error) => logger.error('Bot error', { error: error.message }));
  bot.on('kicked', (reason) => {
    logger.warn('Bot kicked', { reason });
    scheduleReboot('kicked', { reason });
  });
  bot.on('end', () => {
    logger.warn('Bot disconnected');
    scheduleReboot('end');
  });

  return { bot, kernel, scheduler, blackboard, services, jobs, taskIntake, planner, diagnostics, sustainability, autoRebootDelayMs };
}

function startManagedBot() {
  const controller = {
    runtime: null,
    restartTimer: null,
    stopped: false,
    start(reason = 'startup') {
      if (this.stopped) return null;
      this.runtime = createBot({
        onRebootRequested: ({ trigger, delayMs }) => {
          if (this.stopped || this.restartTimer) return;
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.start(trigger || reason);
          }, delayMs);
        }
      });
      return this.runtime;
    },
    stop() {
      this.stopped = true;
      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = null;
      try {
        this.runtime?.kernel?.stop();
      } catch (_error) {
        // ignore
      }
      try {
        this.runtime?.bot?.quit('shutdown');
      } catch (_error) {
        // ignore
      }
    }
  };

  controller.start();
  return controller;
}

if (require.main === module) {
  startManagedBot();
}

module.exports = { createBot, startManagedBot };
