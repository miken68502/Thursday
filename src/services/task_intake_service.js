class TaskIntakeService {
  constructor({ bot, logger, scheduler, blackboard, jobs, priorities, planner = null, diagnostics = null, sustainability = null, home = null }) {
    this.bot = bot;
    this.logger = logger.child('TaskIntakeService');
    this.scheduler = scheduler;
    this.blackboard = blackboard;
    this.jobs = jobs;
    this.priorities = priorities;
    this.planner = planner;
    this.diagnostics = diagnostics;
    this.sustainability = sustainability;
    this.home = home;
  }

  isAuthorized(username) {
    const owner = this.blackboard.get('designatedPlayer');
    return !!owner && owner === username;
  }

  normalizeCommand(command) {
    const aliases = {
      h: 'help',
      '?': 'help',
      inv: 'deposit',
      rtb: 'home',
      dig: 'mine',
      wood: 'gather',
      protect: 'guard',
      defend: 'guard',
      come: 'comehere',
      comehere: 'comehere'
    };
    return aliases[command] || command;
  }

  parseCommand(message) {
    const text = String(message || '').trim();
    const lowered = text.toLowerCase();

    if (lowered === 'come here') return { type: 'comehere' };
    if (!text.startsWith('!bot ')) return null;

    const args = text.slice(5).trim().split(/\s+/);
    const rawCommand = (args.shift() || '').toLowerCase();
    if (rawCommand === 'dig' && (args[0] || '').toLowerCase() === 'down') {
      const targetY = Number(args[1] ?? -64);
      const direction = String(args[2] || 'north').toLowerCase();
      if (!Number.isFinite(targetY) || !['north', 'south', 'east', 'west'].includes(direction)) return null;
      return { type: 'dig_down', targetY, direction };
    }

    let command = this.normalizeCommand(rawCommand);
    if (command === 'comehere' || (command === 'come' && (args[0] || '').toLowerCase() === 'here')) return { type: 'comehere' };
    if (command === 'come' && (args[0] || '').toLowerCase() === 'here') command = 'comehere';
    if (command === 'comehere') return { type: 'comehere' };
    if (command === 'come' && (args[0] || '').toLowerCase() === 'here') return { type: 'comehere' };

    if (command === 'mine') {
      const resource = (args[0] || 'coal').toLowerCase();
      const amount = Number(args[1] || 16);
      return { type: 'mine', resource, amount: Number.isFinite(amount) ? amount : 16 };
    }

    if (command === 'gather') {
      const target = (args[0] || 'wood').toLowerCase();
      const amount = Number(args[1] || 16);
      if (target === 'wood') return { type: 'gather_wood', amount: Number.isFinite(amount) ? amount : 16 };
      return null;
    }

    if (command === 'cleararea') {
      const radius = Number(args[0] || 4);
      return { type: 'cleararea', radius: Number.isFinite(radius) ? radius : 4 };
    }

    if (command === 'follow') return { type: 'follow' };
    if (command === 'guard') return { type: 'guard' };
    if (command === 'home') return { type: 'home' };
    if (command === 'deposit') return { type: 'deposit' };
    if (command === 'unequip') return { type: 'unequip_armor' };
    if (command === 'sleep') return { type: 'sleep' };
    if (command === 'help') return { type: 'help' };
    if (command === 'prepare') return { type: 'prepare', profile: (args[0] || 'mine').toLowerCase() };
    if (command === 'harvest') return { type: 'harvest' };
    if (command === 'plant') return { type: 'plant' };
    if (command === 'resume') return { type: 'resume', sequenceId: args[0] || null };
    if (command === 'sustain') return { type: 'sustain', action: (args[0] || 'status').toLowerCase() };

    if (command === 'craft') {
      const item = args[0];
      const amount = Number(args[1] || 1);
      if (!item) return null;
      return { type: 'craft', item: item.toLowerCase(), amount: Number.isFinite(amount) ? amount : 1 };
    }

    if (command === 'smelt') {
      const item = args[0];
      const amount = Number(args[1] || 1);
      if (!item) return null;
      return { type: 'smelt', item: item.toLowerCase(), amount: Number.isFinite(amount) ? amount : 1 };
    }

    if (command === 'template') {
      const template = (args[0] || '').toLowerCase();
      const amount = Number(args[1] || 16);
      return { type: 'template', template, amount: Number.isFinite(amount) ? amount : 16 };
    }

    if (command === 'plan') {
      const goalType = (args[0] || '').toLowerCase();
      const item = (args[1] || '').toLowerCase();
      const amount = Number(args[2] || 1);
      return { type: 'plan', goalType, item, amount: Number.isFinite(amount) ? amount : 1 };
    }

    if (command === 'sethome') return { type: 'sethome' };
    if (command === 'stop') return { type: 'stop' };
    if (command === 'status') return { type: 'status' };

    return null;
  }

  createSubJobByType(type) {
    const map = {
      PrepareForJobJob: () => new this.jobs.PrepareForJobJob({ profile: 'mine' }),
      MineResourceJob: () => new this.jobs.MineResourceJob({ resource: 'iron', amount: 16 }),
      SmeltItemsJob: () => new this.jobs.SmeltItemsJob({ item: 'iron_ore', amount: 16 }),
      DepositInventoryJob: () => new this.jobs.DepositInventoryJob({ policy: 'store_excess' }),
      CraftItemJob: () => new this.jobs.CraftItemJob({ item: 'stick', amount: 2 })
    };
    return map[type] ? map[type]() : null;
  }

  resumeSequence(parsed) {
    const all = this.blackboard.get('checkpoints.sequence', {});
    const id = parsed.sequenceId || this.blackboard.get('checkpoints.lastSequenceId');
    if (!id || !all[id]) return null;

    const snap = all[id];
    if (!['cancelled', 'failed', 'running'].includes(snap.status)) return null;
    const subTypes = snap.subTypes || [];
    const subJobs = subTypes.map((t) => this.createSubJobByType(t)).filter(Boolean);
    if (!subJobs.length) return null;

    return {
      job: new this.jobs.JobSequenceJob({ jobs: subJobs, startIndex: snap.index || 0, sequenceId: id }),
      options: { priority: this.priorities.playerCritical }
    };
  }

  buildTemplateChain(parsed) {
    if (parsed.template !== 'iron_loop') return null;

    const subJobs = [
      new this.jobs.PrepareForJobJob({ profile: 'mine' }),
      new this.jobs.MineResourceJob({ resource: 'iron', amount: parsed.amount }),
      new this.jobs.SmeltItemsJob({ item: 'iron_ore', amount: parsed.amount }),
      new this.jobs.DepositInventoryJob({ policy: 'store_excess' })
    ];

    return {
      job: new this.jobs.JobSequenceJob({ jobs: subJobs }),
      options: { priority: this.priorities.playerCritical }
    };
  }

  buildJob(parsed) {
    if (parsed.type === 'mine') {
      return {
        job: new this.jobs.JobSequenceJob({
          jobs: [
            new this.jobs.PrepareForJobJob({ profile: 'mine' }),
            new this.jobs.MineResourceJob({ resource: parsed.resource, amount: parsed.amount })
          ]
        }),
        options: { priority: this.priorities.playerCritical }
      };
    }
    if (parsed.type === 'gather_wood') {
      return {
        job: new this.jobs.JobSequenceJob({
          jobs: [
            new this.jobs.PrepareForJobJob({ profile: 'wood' }),
            new this.jobs.GatherWoodJob({ amount: parsed.amount, replant: true })
          ]
        }),
        options: { priority: this.priorities.playerCritical }
      };
    }
    if (parsed.type === 'follow') return { job: new this.jobs.FollowPlayerJob(), options: { priority: this.priorities.idleBehavior } };
    if (parsed.type === 'comehere') return { job: new this.jobs.ComeHereJob({ range: 2 }), options: { priority: this.priorities.playerCritical } };
    if (parsed.type === 'guard') return {
      job: new this.jobs.JobSequenceJob({
        jobs: [
          new this.jobs.PrepareForJobJob({ profile: 'combat' }),
          new this.jobs.GuardPlayerJob({ radius: 14 })
        ]
      }),
      options: { priority: this.priorities.combatDefense }
    };
    if (parsed.type === 'home') return { job: new this.jobs.ReturnHomeJob({ reason: 'user_request' }), options: { priority: this.priorities.playerCritical } };
    if (parsed.type === 'deposit') return { job: new this.jobs.DepositInventoryJob({ policy: 'store_excess' }), options: { priority: this.priorities.inventoryMaintenance } };
    if (parsed.type === 'unequip_armor') return { job: new this.jobs.UnequipArmorJob(), options: { priority: this.priorities.playerCritical } };
    if (parsed.type === 'sleep') return { job: new this.jobs.SleepJob(), options: { priority: this.priorities.sleep } };
    if (parsed.type === 'craft') return { job: new this.jobs.CraftItemJob({ item: parsed.item, amount: parsed.amount }), options: { priority: this.priorities.playerCritical } };
    if (parsed.type === 'smelt') return { job: new this.jobs.SmeltItemsJob({ item: parsed.item, amount: parsed.amount }), options: { priority: this.priorities.playerCritical } };
    if (parsed.type === 'template') return this.buildTemplateChain(parsed);
    if (parsed.type === 'cleararea') return { job: new this.jobs.ClearAreaJob({ radius: parsed.radius }), options: { priority: this.priorities.activeWork } };
    if (parsed.type === 'dig_down') {
      return {
        job: new this.jobs.JobSequenceJob({
          jobs: [
            new this.jobs.PrepareForJobJob({ profile: 'mine' }),
            new this.jobs.DigDownJob({ targetY: parsed.targetY, direction: parsed.direction })
          ]
        }),
        options: { priority: this.priorities.playerCritical }
      };
    }
    if (parsed.type === 'prepare') return { job: new this.jobs.PrepareForJobJob({ profile: parsed.profile }), options: { priority: this.priorities.playerCritical } };
    if (parsed.type === 'harvest') return { job: new this.jobs.HarvestCropsJob(), options: { priority: this.priorities.activeWork } };
    if (parsed.type === 'plant') return { job: new this.jobs.PlantCropsJob(), options: { priority: this.priorities.activeWork } };
    if (parsed.type === 'resume') return this.resumeSequence(parsed);
    return null;
  }

  statusSummary() {
    const active = this.blackboard.get('activeJob');
    const mode = this.blackboard.get('mode');
    const inventory = this.blackboard.get('inventory');
    return {
      mode,
      activeJob: active,
      fullness: Number((inventory?.fullness || 0).toFixed(2))
    };
  }

  helpText() {
    return 'Commands: mine/gather wood/dig down <targetY> <north|south|east|west>/follow/come here/guard/home/deposit/unequip/craft/smelt/sleep/sethome/stop/status/template iron_loop/plan craft iron_pickaxe/cleararea/harvest/plant/resume/sustain [on|off|status|once]/help';
  }

  handleChat(username, message) {
    if (!this.isAuthorized(username)) return false;
    const parsed = this.parseCommand(message);
    if (!parsed) return false;

    if (parsed.type === 'help') {
      this.bot.chat(this.helpText());
      return true;
    }

    if (parsed.type === 'sethome') {
      const anchor = this.bot.entity.position.clone();
      this.blackboard.patch('home.anchor', anchor);
      this.blackboard.patch('base.anchor', anchor);
      const scanRadius = this.home?.getProtectionRadius?.() ?? 25;
      let summary = null;
      try {
        summary = this.home?.scanStationsNear?.(this.bot, scanRadius, { reset: true }) || null;
      } catch (_error) {
        // best effort home scan after anchor update
      }
      if (!summary && this.home?.getStationSummary) summary = this.home.getStationSummary();
      const chests = summary?.chests ?? (this.blackboard.get('base.chests', []) || []).length;
      const beds = summary?.beds ?? (this.blackboard.get('base.beds', []) || []).length;
      const furnaces = summary?.furnaces ?? (this.blackboard.get('base.furnaces', []) || []).length;
      const crafting = summary?.craftingTables ?? (this.blackboard.get('base.craftingTables', []) || []).length;
      this.bot.chat(`Home anchor updated. Stations: chests=${chests}, beds=${beds}, furnaces=${furnaces}, crafting=${crafting}.`);
      return true;
    }

    if (parsed.type === 'stop') {
      this.scheduler.cancelActive('user_stop');
      this.bot.chat('Active job cancelled.');
      return true;
    }

    if (parsed.type === 'status') {
      const status = this.diagnostics ? this.diagnostics.formatReport() : `Mode=${this.statusSummary().mode}`;
      this.bot.chat(status);
      return true;
    }

    if (parsed.type === 'plan') {
      if (!this.planner) {
        this.bot.chat('Planner unavailable.');
        return true;
      }
      const scheduled = this.planner.schedulePlan({ type: parsed.goalType, item: parsed.item, amount: parsed.amount }, this.scheduler);
      this.bot.chat(`Plan queued: ${scheduled.plan.map((s) => s.kind).join(' -> ')}`);
      return true;
    }

    if (parsed.type === 'sustain') {
      if (!this.sustainability) {
        this.bot.chat('Sustainability service unavailable.');
        return true;
      }
      if (parsed.action === 'on') {
        this.sustainability.setEnabled(true);
        this.bot.chat('Sustainability loop enabled.');
        return true;
      }
      if (parsed.action === 'off') {
        this.sustainability.setEnabled(false);
        this.bot.chat('Sustainability loop disabled.');
        return true;
      }
      if (parsed.action === 'once') {
        const summary = this.blackboard.get('inventory.summary', {});
        const result = this.sustainability.maybeSchedule(Number.MAX_SAFE_INTEGER, this.scheduler, summary);
        this.bot.chat(result.scheduled ? `Sustainability queued (${result.id.slice(0, 8)}).` : `No sustainability job (${result.reason}).`);
        return true;
      }

      const status = this.sustainability.status();
      this.bot.chat(`Sustainability enabled=${status.enabled} lastTick=${status.lastRunTick}`);
      return true;
    }

    const scheduled = this.buildJob(parsed);
    if (!scheduled) {
      this.bot.chat('Unknown or invalid command. Use !bot help');
      return true;
    }

    const id = this.scheduler.enqueue(scheduled.job, scheduled.options);
    this.blackboard.patch('checkpoints.lastUserCommand', { username, parsed, id, ts: Date.now() });
    this.logger.info('User command scheduled', { username, parsed, id });
    this.bot.chat(`Queued ${scheduled.job.type} (${id.slice(0, 8)}).`);
    return true;
  }
}

module.exports = { TaskIntakeService };
