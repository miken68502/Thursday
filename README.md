# MinecraftBot V6 — Survival Core

Modular Mineflayer survival bot with:
- scheduler + interrupt-driven jobs,
- layered recovery and failure memory,
- owner command intake and planning,
- API-first block collection via Mineflayer + plugins.

---

## Current features

### Core runtime
- Kernel/scheduler/blackboard/state machine architecture.
- Recovery engine with path/target failure tracking and escalation.
- Auto-reboot handling on disconnect/kick (configurable).
- Idle wander scheduling when no work is queued.

### Mineflayer API integration
- Uses `mineflayer`, `mineflayer-pathfinder`, and `mineflayer-collectblock`.
- Plugin-first block collection with fallback dig paths.
- Pathfinder-assisted harvest tool selection (`bestHarvestTool`) with fallback heuristics.
- Dig guardrails via `canDigBlock` and dig-time telemetry.

### Jobs and behaviors
- Mining and wood gathering (including vein-aware collection support).
- Gather wood supports sapling replant attempts after successful harvest.
- Area clearing with batch-anchor optimization and nearest-work dequeue.
- Crop harvest/plant flows.
- Follow/guard/home/deposit/craft/smelt/sleep/prepare and sequence jobs.

### Safety/protection
- Home/base protection radius support (`MC_HOME_PROTECTION_RADIUS`).
- Protection-aware checks in clear-area and crop harvest flows.
- Owner-only command intake.

### Diagnostics/planning
- Planner service for command-driven prerequisite chains.
- Diagnostics/status reporting exposed via chat commands.

---

## Setup and startup

### 1) Install dependencies
```bash
npm install
```

### 2) Create a root `.env`
Create `.env` in the project root (same level as `package.json`), for example:

```env
MC_HOST=localhost
MC_PORT=25565
MC_USERNAME=SurvivalWorkerV6
MC_OWNER=YourMinecraftName
LOG_LEVEL=info

# Optional runtime controls
MC_AUTO_REBOOT=true
MC_REBOOT_DELAY_MS=4000
MC_IDLE_WANDER_DELAY_MS=45000
MC_IDLE_WANDER_COOLDOWN_MS=30000
MC_HOME_PROTECTION_RADIUS=25
```

### 3) Start the bot
```bash
npm start
```

---

## Commands

Owner-only in-game chat commands are prefixed with `!bot`:

- `!bot mine <resource> <amount>`
- `!bot gather wood <amount>`
- `!bot follow`
- `!bot guard`
- `!bot home`
- `!bot deposit`
- `!bot craft <item> <amount>`
- `!bot smelt <item> <amount>`
- `!bot prepare <profile>`
- `!bot cleararea <radius>`
- `!bot harvest`
- `!bot plant`
- `!bot template iron_loop <amount>`
- `!bot plan craft iron_pickaxe 1`
- `!bot sleep`
- `!bot sethome`
- `!bot stop`
- `!bot status`
- `!bot resume [sequenceId]`
- `!bot help`

Aliases:
- `!bot h` (help)
- `!bot dig ...` (mine)
- `!bot inv` (deposit)
- `!bot rtb` (home)
- `!bot protect` / `!bot defend` (guard)

---

## Maintenance workflow

### Validate syntax
```bash
npm run check
```

### Run tests
```bash
npm test
```

### Typical update loop
1. Pull latest changes.
2. Run `npm install` if dependencies changed.
3. Run `npm run check`.
4. Run `npm test`.
5. Restart with `npm start`.

---

## Notes
- Environment variables are loaded from root `.env` at startup.
- If owner commands do not respond, verify `MC_OWNER` matches exact in-game username.
- If block collection seems degraded, confirm plugin load and pathfinder availability in logs.
