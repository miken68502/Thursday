# MinecraftBot V6 — Survival Core Rewrite

Modular Mineflayer survival framework with explicit state, interrupt-driven jobs, and layered recovery.

## Current status

Implemented architecture and phase progression:
- **Milestone 1–6**: kernel/scheduler/blackboard/recovery/utility core, survival and inventory policies, command intake, and deterministic tests
- **Milestone 7 (Base intelligence)**: base storage registry, chest category mapping, and prepare/restock job flow before work
- **Milestone 8 (Advanced recovery)**: failure memory, oscillation detection, path failure tracking, and recovery throttling
- **Milestone 9 (Task planning)**: planner service for prerequisite chains (example: iron pickaxe plan)
- **Milestone 10 (Area work scaffold)**: `AreaWorkJob` base + `ClearAreaJob` with area scan queue
- **Milestone 11 (Sustainability)**: crop harvest/plant jobs, wood replant scaffolding, and furnace fuel prioritization
- **Milestone 12 (Diagnostics)**: diagnostics status reporting integrated into owner command layer
- **Next-stage Step 3 complete**: area queue optimization with batched anchor movement and nearest-item dequeue for clear-area work

## Next-stage roadmap
1. Sustainability loops with base-stock target thresholds and automated recurring plans.

## Owner command intake (task scheduling)

Owner-only chat commands are mapped to jobs using `!bot`:
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

## Run

Create your environment file in the **project root** (same level as `package.json`), not inside `src/`:

```bash
cp .env.example .env
```

Then edit `.env` values and start the bot:

```bash
npm install
npm start
```

## Test

```bash
npm test
```

Environment variables (loaded from root `.env`):
- `MC_HOST` / `MC_PORT` / `MC_USERNAME`
- `MC_OWNER`
- `LOG_LEVEL`
