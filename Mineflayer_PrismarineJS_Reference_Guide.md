# Mineflayer / PrismarineJS Reference Guide

Purpose: a large plain-English reference you can hand to ChatGPT or Codex when planning, refactoring, or extending a Mineflayer bot.

Scope: official Mineflayer / PrismarineJS ecosystem docs first, with a bias toward features that matter for a survival-capable bot.

---

## 1) Core ecosystem map

### Mineflayer core
Use this for the actual bot API:
- connecting a bot
- events
- chat and whispers
- blocks, entities, inventory, windows
- digging, placing, crafting, containers
- world queries like `findBlock`, `findBlocks`, `blockAt`, `waitForChunksToLoad`

### mineflayer-pathfinder
Use this for movement and route planning:
- goals
- movement rules
- pathfinding cost tuning
- think timeouts
- digging/building permissions during navigation

### Common companion plugins
- `mineflayer-tool` — auto-select best tool for a block/task
- `mineflayer-collectblock` — higher-level collect block / collect drops workflow
- `mineflayer-pvp` — combat helper layer
- `mineflayer-statemachine` — structured AI/state behavior
- `prismarine-viewer` — live visual debugging / viewer

---

## 2) What Mineflayer gives you vs what you must build yourself

### Already provided by Mineflayer / plugins
- protocol connection to the server
- bot state and world data for loaded chunks
- event system
- inventory/container APIs
- block and entity queries
- basic digging and placing
- pathfinding plugin support
- helper plugins for tools, combat, collecting, and state machines

### Usually still your job
- job queue / scheduler
- task interruption policy
- pause/resume behavior
- chest indexing and storage planning
- mining strategy by resource type
- multi-bot coordination
- human-friendly reporting
- command language / chat routing
- base management and long-running behavior rules

Rule of thumb: Mineflayer gives you the hands, eyes, and feet. You still have to supply the brain.

---

## 3) Core bot setup concepts

### Bot creation
Typical setup uses `mineflayer.createBot(...)` with fields such as:
- host
- port
- username
- password when needed
- version when needed
- auth mode depending on server/account setup

### Plugin loading
Common pattern:
- create bot
- `bot.loadPlugin(...)`
- then configure plugin-specific behavior

### Version compatibility
Always check the Mineflayer README / FAQ / history when server version behavior looks odd. A lot of mysterious connection or protocol breakage is really version support mismatch.

---

## 4) Core Mineflayer areas worth knowing

### Events
Important event families to design around:
- spawn / login / end / kicked / error
- chat / whisper / message-related events
- physics / movement updates
- entity updates
- inventory and window interactions
- block update events
- health / food style status changes where available in your stack

Design implication:
- use events for reactive behavior
- use your own scheduler/state machine for deliberate behavior
- do not try to make everything run in one giant loop

### World and block access
Useful categories:
- `bot.blockAt(position)`
- `bot.findBlock(...)`
- `bot.findBlocks(...)`
- loaded-chunk awareness
- `bot.waitForChunksToLoad()`

Important limitation:
- block queries only work on loaded world data
- a high scan radius does not make the bot omniscient
- unloaded space is still unknown until chunks are loaded around the bot

### Entities and players
Useful for:
- finding nearby players
- following / guarding
- selecting combat targets
- looking at entities
- assigning bots to players

### Inventory and windows
Important areas:
- bot inventory inspection
- held item / selected slot
- armor equipment state
- window open/close lifecycle
- chest/furnace/crafting table/anvil/container handling

### Containers and chests
Core use cases:
- open chest
- inspect contents
- withdraw items
- deposit items
- update your own blackboard/index after every interaction

Design implication:
- a blackboard chest index is not built in; you build it on top of Mineflayer container APIs
- this is a good pattern for larger bases

### Digging and placing
Useful pieces:
- detect diggable block
- equip suitable tool
- dig target block
- place blocks at positions/faces

Design implication:
- Mineflayer can dig and place, but “mine diamonds intelligently” is still a strategy problem you must write

### Crafting
Core pattern:
- find recipe(s)
- ensure materials are in inventory
- use crafting table when required
- craft amount

Design implication:
- crafting fallback logic should be rule-driven by job profile, not generic panic crafting

### Chat and command intake
Mineflayer gives you chat/message hooks, but your command language is your own design.

Good patterns:
- direct whisper commands
- public commands with bot name mention
- team/all-bot routing layer
- parser that resolves intent into jobs

---

## 5) Pathfinder: the part that decides whether the bot can get somewhere

### What it does
`mineflayer-pathfinder` gives goal-based navigation over Minecraft terrain.

Typical capabilities:
- move to coordinates
- move near a block/entity
- follow a moving target
- avoid or allow digging/building as part of movement
- customize movement costs and rules

### Important concepts
#### Goals
Examples of common goal categories:
- exact block position
- near a position
- near an entity/player
- composite or dynamic goals

#### Movements
Movement settings determine things like:
- whether it can break blocks
- whether it can place blocks
- liquid behavior
- hazard handling
- cost preferences
- which blocks are safe / unsafe / climbable / avoidable

#### Think timeout / planning timeout
Path planning is not infinite. If the path is too expensive or complex, you can get errors like:
- “Took too long to decide path to goal!”

Design implication:
- sometimes the bot is not “stuck”; the planner simply hit a complexity or timeout limit
- for long or ugly paths, reduce goal complexity, shorten hops, or tune pathfinder settings

### Good pathing architecture for your project
- use short hops for exploration
- blacklist unreachable points temporarily
- retry with smaller or alternate goals
- separate “no path” from “bot physically stuck after path started”

---

## 6) Plugins you should know

### mineflayer-tool
Purpose:
- choose the best tool automatically for a task/block

Use it for:
- mining prep
- chopping wood
- avoiding stupid tool choices

What it does not solve by itself:
- deciding which tool tier is required for a job
- retrieving missing tools from storage
- crafting fallback policy

### mineflayer-collectblock
Purpose:
- high-level workflow for collecting blocks or drops

Useful features described by the maintainers include:
- pathfinding to target block
- selecting proper tool
- mining block
- collecting drops
- optional quality-of-life logic such as chest deposit / retrieving tools / queuing collection tasks

Why this matters for you:
- even if you do not adopt it directly, it is worth reading because it covers patterns you are currently hand-building

### mineflayer-pvp
Purpose:
- easier combat control for PvP/PvE

Useful pieces:
- attack target
- stop / force stop
- follow range
- movement config for pursuit
- view distance / aim behavior settings exposed by the plugin

Good use cases:
- guard mode
- murder hobo mode
- assigned-player protection

### mineflayer-statemachine
Purpose:
- a cleaner state/transition framework for bot behavior

Why you might care:
- your project is getting large enough that a formal state machine can reduce spaghetti logic
- useful for states like idle / prep / work / combat / sleep / deposit / recover / paused

### prismarine-viewer
Purpose:
- browser-based viewer for bots and servers

Why you should care:
- excellent for debugging pathing, loaded chunks, target selection, and what the bot probably “sees” versus what you assume it sees

---

## 7) Practical feature buckets for a survival bot

### A. Storage and logistics
Build on core container APIs.

Recommended features:
- scan chests around home/base
- build a blackboard chest index
- track per-chest item counts
- refresh index on open/withdraw/deposit
- periodic refresh while idle
- route deposits by exact item match first, category second
- record failed chest opens to avoid loops

### B. Prep system
Recommended prep checks before a job:
- food available in inventory or indexed storage
- required tool available in inventory or indexed storage
- armor check if relevant
- crafting fallback only when valid
- report exact missing dependency if prep fails

### C. Mining system
Different resources should use different strategies.

Recommended distinction:
- surface harvestables: sand, dirt, gravel, logs
- shallow ore/cave scan: coal, some iron
- deep mining resources: diamond, redstone, gold, emerald, ancient debris with special handling

Important note:
- “scan and hope” is not mining strategy
- for deep ore you generally need a descent phase and underground logic

### D. Pathing reliability
You will likely need your own stuck recovery layer.

Recommended checks:
- no position change for N seconds while moving
- repeated path recalculations
- jump loop detection
- repeated collision at same point

Recommended recovery ladder:
1. repath same goal
2. move to nearby offset
3. back up
4. jump/sidestep
5. temporary blacklist obstacle/point
6. fail with report

### E. Interrupt handling
Do not let every interrupt destroy the active job.

Recommended policy:
- hunger: pause job, eat/recover, resume
- combat threat: either defend then resume, or abort if unsafe
- sleep: pause if safe, resume after wake
- no-food / no-tool: fail with explicit reason

### F. Reporting
Useful major-status reports only:
- starting job
- retrieving supplies
- missing supplies
- moving to search area
- path blocked / retrying
- returning home
- job complete / aborted

### G. Command intake
Recommended command channels:
- whisper to bot
- public chat mentioning bot name
- optional old-school prefix commands
- routing for “all bots” vs named bot
- assigned-player restrictions if desired

---

## 8) Constraints and common mistakes

### Loaded chunks are a hard limit
The bot cannot scan or reason about blocks that are not loaded around it.

Practical consequence:
- increasing scan radius only helps inside loaded terrain
- wait for chunks to load at new search points before scanning

### Large path goals can fail before motion begins
If pathfinder says it took too long to decide a path, the issue may be planning cost, not an obstacle directly in front of the bot.

Practical consequence:
- use shorter search hops
- tune timeouts carefully
- use fallback goals

### Surface scan is not underground mining
If the bot is walking around at high Y-level and scanning for diamond, that is a patrol, not a mining algorithm.

### Chest category should be a hint, not a gate
If your index says a misc chest has bread, the bot should still use it.

### Verify container success
After withdraw/deposit, confirm inventory/container state changed. Never assume the action succeeded.

### Reboot/bootstrap consistency matters
If reconnect bootstrap differs from clean-start bootstrap, you can lose home state, chest indexing, or idle maintenance logic after reconnect.

---

## 9) High-value Mineflayer capabilities to audit before custom coding more

### Block search
Check these first before custom scan rewrites:
- `findBlock`
- `findBlocks`
- scan point options
- distance options
- loaded chunk limits
- chunk loading wait behavior

### Inventory and windows
Check these before building more custom chest logic:
- chest/container APIs
- furnace APIs
- crafting APIs
- equipment helpers

### Pathfinding
Check these before writing more manual movement workarounds:
- goals
- movement rules
- path planner timeout behavior
- canDig / canPlace style movement permissions

### Tool selection
Check `mineflayer-tool` before hand-rolling more tool choice code.

### Collection workflows
Check `mineflayer-collectblock` before writing another giant “walk there, equip tool, dig, pick up” layer by hand.

---

## 10) Recommended architecture for your project

### Keep these as separate systems
1. Command parser
2. Scheduler / job queue
3. State machine / mode manager
4. Storage blackboard
5. Navigation wrapper
6. Job implementations
7. Interrupt/resume manager
8. Player-reporting layer

### Why
When these blur together, bugs become impossible to isolate.

Example:
- prep bug should not look like a mining bug
- path bug should not look like a storage bug
- hunger interrupt should not silently destroy job state

---

## 11) Suggested job model

### Job lifecycle
- queued
- started
- stepping
- waiting/searching
- paused
- resumed
- completed
- failed
- cancelled

### Good job result payloads
Always include:
- code
- retryable
- details
- nextHint

Good examples:
- `MISSING_FOOD`
- `MISSING_TOOL`
- `NO_PATH`
- `SEARCHING`
- `PAUSED_FOR_HUNGER`
- `DONE`

---

## 12) Recommended mining strategy matrix

### Surface resources
Examples:
- sand
- dirt
- gravel
- logs

Strategy:
- wide local scan
- path to resource
- collect until amount met or area exhausted

### Cave-friendly exposed ore
Examples:
- coal
- some iron / copper depending on terrain

Strategy:
- scan exposed blocks near terrain/caves
- move/search between points
- optional cave-follow mode

### Deep ore
Examples:
- diamond
- redstone
- gold
- emerald depending on biome/terrain logic

Strategy:
- confirm required tool tier
- descend to target layer
- branch or tunnel search
- collect vein
- resume search

### Special-case materials
Examples:
- obsidian
- ancient debris

Strategy:
- dedicated logic
- stronger safety checks
- stricter tool validation

---

## 13) Multi-bot considerations

Recommended state per bot:
- assigned player
- home/base anchor
- job queue
- role/profile
- inventory snapshot
- chest index access strategy
- report channel policy

Recommended shared-state concerns:
- avoid two bots pathing to the same single chest simultaneously unless coordinated
- reserve targets where useful
- avoid duplicate mining targets
- route player-specific whispers to assigned player only

---

## 14) Debugging stack worth using

### Logs
Keep structured logs for:
- scheduler actions
- job transitions
- path failures
- chest open/withdraw/deposit
- mining scan results
- interrupt events

### Viewer
Use `prismarine-viewer` when debugging:
- pathing weirdness
- search point choices
- loaded chunk assumptions
- whether the bot is actually near a usable block/chest/path target

### State dumps
Useful debug commands:
- current mode
- active job
- inventory summary
- held tool
- known chests summary
- current path goal
- assigned player

---

## 15) Suggested environment/config knobs to expose

Good candidates for env or config:
- scan radius by job type
- spiral distances / ring counts
- pathfinder timeout
- idle wander delay and cooldown
- chest index refresh interval
- hunger interrupt threshold
- mining target Y levels by resource
- max retries for no-path
- player-report verbosity
- allowed dig/build during navigation

---

## 16) What to read first when adding a new feature

### Want better scanning?
Read:
- Mineflayer block query docs
- chunk loading helper docs
- pathfinder goal/movement docs

### Want better mining?
Read:
- Mineflayer dig/block docs
- mineflayer-tool docs
- pathfinder movement constraints
- collectblock docs

### Want better storage?
Read:
- inventory/window/container docs
- chest open/withdraw/deposit behavior

### Want better combat?
Read:
- entity APIs
- mineflayer-pvp docs
- pathfinder chase/follow goals

### Want better architecture?
Read:
- state machine plugin docs

---

## 17) Straight recommendations for your current project

### Strong candidates to adopt or audit immediately
- official Mineflayer API docs
- mineflayer-pathfinder docs
- mineflayer-tool docs
- mineflayer-collectblock docs
- prismarine-viewer

### Why
Because you are already hand-building features these tools/docs directly touch:
- storage prep
- mining scans
- movement reliability
- tool choice
- collection workflows
- combat behavior
- structured AI states

---

## 18) Source appendix

Official / primary references used to compile this guide:

- Mineflayer repository: https://github.com/PrismarineJS/mineflayer
- Mineflayer API docs: https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md
- Mineflayer docs index / README: https://github.com/PrismarineJS/mineflayer/blob/master/docs/README.md
- Mineflayer tutorial: https://github.com/PrismarineJS/mineflayer/blob/master/docs/tutorial.md
- Mineflayer FAQ: https://github.com/PrismarineJS/mineflayer/blob/master/docs/FAQ.md
- Mineflayer history: https://github.com/PrismarineJS/mineflayer/blob/master/docs/history.md
- mineflayer-pathfinder: https://github.com/PrismarineJS/mineflayer-pathfinder
- mineflayer-pvp API docs: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/docs/api.md
- mineflayer-tool README: https://github.com/PrismarineJS/mineflayer-tool/blob/master/README.md
- mineflayer-collectblock: https://github.com/PrismarineJS/mineflayer-collectblock
- mineflayer-statemachine README: https://github.com/PrismarineJS/mineflayer-statemachine/blob/master/README.md
- prismarine-viewer README: https://github.com/PrismarineJS/prismarine-viewer/blob/master/README.md

---

## 19) Best way to use this file with ChatGPT or Codex

When you want changes, paste:
1. the current relevant source file(s)
2. the bug log
3. the exact behavior you expected
4. the relevant section(s) of this guide

That gives the model:
- current implementation context
- observed failure
- desired behavior
- ecosystem constraints/tools already available

That will beat “fix the mining” every single time.
