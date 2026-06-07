# Satisfactory Save Summary Bot

Watches your Satisfactory save files, compares each new **canonical** save
(`*_continue.sav` by default) against the previous one, and posts a summary of
**what changed** to Discord (and/or the console).

Designed for a shared/dedicated server: when everyone logs off (or the server
restarts overnight) the game writes a fresh save. This bot snapshots that save,
diffs it against the last one it saw, and tells your group what happened —
new research, milestones, factories, power, logistics and Space Elevator
progress — plus how much in‑game time elapsed.

All summary generation happens **in the application** (no AI at runtime).

## What it reports

- ⏱️ **Time elapsed** in‑game between the two saves (and total playtime)
- 🏁 **New milestones** (HUB tiers)
- 🔬 **New MAM research**
- 🧪 **New alternate recipes** (from hard drives)
- 🚀 **Project Assembly / Space Elevator** phase changes & parts delivered
- ⚡ **Power** — new generators, plus a grid‑wide **max production vs. max
  consumption** balance so you can see at a glance if more power is needed
- 🚆 **Logistics** — trains, freight wagons, train stations, truck stations, vehicles, drones
- 🏭 **Factories** — production & extraction building counts
- 📦 **Storage** containers

> Building/recipe coverage is a curated subset of the most common classes.
> Unknown classes degrade gracefully to a prettified name. Deeper per‑factory
> "theoretical max output" analytics are planned (see _Roadmap_).

## Example summary

Each time the canonical save changes, the bot posts a Discord embed like this:

> **🛠️ Factory Update — New 1.2 World**
>
> Here's what changed since the last save.
>
> ⏱️ **18m** of factory time passed (total 13h 54m).
>
> 🔬 **New research (6)**
> • **Caterium Ingots** — Unlocks: Caterium Ingot, Quickwire
> • **Caterium Electronics** — Unlocks: AI Limiter, Circuit Board (alt.)
> • **Quickwire** — Unlocks: Stator, Power Switch
> • **Caterium Computer** — Unlocks: Supercomputer (alt.)
> • **Caterium Cabling** — Unlocks: Cable (alt.)
> • **Power Poles Mk.2** — Unlocks: Power Pole Mk.2
>
> 🧪 **New alternate recipes (2)**
> • **Alt: Iron Alloy Ingot** — 4× Iron Ore + 2× Copper Ore → 15× Iron Ingot @ Foundry (12s)
> • **Alt: Expanded Toolbelt** — +1 inventory bar
>
> 🚀 **Project Assembly — Construction Dock**
> Delivered **+76 Smart Plating**.
> Progress: **21%** (×2 parts cost)
> • Smart Plating: 883 / 2,000
> • Versatile Framework: 0 / 2,000
> • Automated Wiring: 0 / 200
>
> ⚡ **Power**
> • +4 Coal Generator (now 12)
> • Max production: **990 MW** (+300 MW)
> • Max consumption: **3,504 MW** (+200 MW)
> • Balance: **-2,514 MW** ⚠️ more power needed _(across 2 grids)_
>
> 🏭 **Factories**
> • +18 Constructor (now 64)
> • +6 Assembler (now 22)
>
> **— ADA**
> _Commendable effort. Consider this rare moment of approval a non-recurring bonus._

> The closing line is ADA's commentary, picked automatically to match how much
> you accomplished (see [ADA commentary](#ada-commentary) below).

## ADA commentary

Every summary ends with a one‑line remark in the dry, corporate‑cheerful voice of
**ADA**. The line is chosen at random from a curated, offline list — the bot never
calls an AI at runtime — and the **category is matched to how much actually got
done** since the last save:

| Tone | When it's used | Vibe |
| --- | --- | --- |
| **Exceptional** | A phase advanced and/or lots was unlocked & built | Approving, motivational |
| **Productive** | A solid, steady amount of progress | Measured approval |
| **Modest** | Only a little happened | Gentle "the factory must grow" prodding |
| **Idle** | Basically nothing but time passing | Sarcastic mockery |

Activity is scored from unlocks (milestones / research / alternate recipes),
buildings constructed, and Project Assembly progress; a lot of elapsed time with
little to show for it leans toward mockery. Lines live in
[`src/summary/ada.ts`](src/summary/ada.ts) — add your own to any category.

## Requirements

- Node.js 18+ (tested on Node 24)
- A folder containing your Satisfactory save files

## Setup

```powershell
npm install
Copy-Item .env.example .env   # then edit .env
```

Edit `.env`:

| Variable | Default | Description |
| --- | --- | --- |
| `SAVES_DIR` | `./Saves` | Folder containing your save files |
| `CANONICAL_SAVE_SUFFIX` | `_continue.sav` | Which save to track (ignores autosaves) |
| `DOCS_PATH` | _(auto)_ | Game `Docs.json`/`en-US.json` (file, folder, or install root) for real names |
| `STATE_DIR` | `./state` | Where snapshots + `db.json` + `config.json` are kept |
| `POST_TO_DISCORD` | `false` | `true` to post; otherwise preview/console only |
| `SKIP_EMPTY_SUMMARIES` | `true` | Don't post when only time changed |
| `WATCH_DEBOUNCE_MS` | `5000` | Wait after a save write before processing |
| `PHASE_COST_MULTIPLIER` | `0` | Override Space Elevator parts cost factor (0 = auto-detect from save) |
| `WATCH_USE_POLLING` | `false` | Filesystem polling (recommended in Docker) |
| `WEB_ENABLED` | `true` | Enable the configuration + preview web UI |
| `WEB_PORT` | `8080` | Port the web UI listens on |
| `DISCORD_WEBHOOK_URL` | _(blank)_ | Webhook delivery (leave blank to disable) |
| `DISCORD_BOT_TOKEN` | _(blank)_ | Bot delivery token (with `DISCORD_CHANNEL_ID`) |
| `DISCORD_CHANNEL_ID` | _(blank)_ | Channel id for bot delivery |

> Env vars set the **defaults**. Anything you change in the web UI is saved to
> `config.json` in the state dir and takes precedence from then on.

Both delivery methods can be enabled at once; each is attempted independently.

### Discord: webhook (simplest)

In Discord: **Channel → Edit → Integrations → Webhooks → New Webhook → Copy URL**,
then set `DISCORD_WEBHOOK_URL`.

### Discord: bot

Create an application + bot at <https://discord.com/developers/>, invite it to
your server with **Send Messages** permission, then set `DISCORD_BOT_TOKEN` and
`DISCORD_CHANNEL_ID` (enable Developer Mode in Discord to copy a channel id).

## Running

```powershell
npm run build
npm start
```

For development (auto‑restart on changes):

```powershell
npm run dev
```

On startup the app establishes a baseline from the current canonical save, then
watches the folder. The next time the save changes, it posts a summary of the
difference.

## Game data: real names & unlocks

To turn cryptic ids like `Research_Caterium_3` into **"Caterium Ingots — Unlocks:
Caterium Ingot, Quickwire"**, the bot reads the game's documentation dump
(`Docs.json`, or `en-US.json` on 1.0+). This ships with every copy of the game
under `CommunityResources/Docs` (including dedicated servers).

With game data loaded, summaries gain:

- **Real display names** for research, milestones, alternate recipes and items.
- **What each research/milestone unlocks** (recipes, items, inventory slots, scanner resources).
- **Alternate-recipe formulas** — e.g. _"8× Iron Ore + 2× Copper Ore → 15× Iron Ingot @ Foundry (12s)"_.
- **Milestone build cost** — what each completed HUB milestone required.
- **Project Assembly progress** — the target Space Elevator phase, what it needs
  and how much has been delivered (e.g. _"Construction Dock — Smart Plating 883/1,000"_).

Point `DOCS_PATH` at the file, its folder, an install root, or even a dropped-in
`CommunityResources` folder — the bot auto-detects the exact file (preferring
`Docs.json`/`en-US.json` under `CommunityResources/Docs`). In Docker, drop the
file (or the whole `CommunityResources` folder) into `./docs` (mounted read-only
at `/data/docs`). Use **Reload game data** in the web UI after changing it.

> Space Elevator phase **requirements** are not in the game's data dump, so the
> base amounts are maintained as a small curated table in the code. They are
> scaled by the save's parts-cost multiplier (`mSpacePartsCostMultiplier`, e.g.
> 2x in a custom game) — read automatically from the save, or overridden with
> `PHASE_COST_MULTIPLIER` / the web UI. Delivered amounts always come from real
> save data.

Without game data the bot still works — names just fall back to a prettified
version of their internal ids.

Verify what was indexed:

```powershell
npm run docs -- "C:/Program Files/.../CommunityResources/Docs/Docs.json"
npm run docs -- "<path>" Research_Caterium_3   # inspect one schematic
```

## Web UI

A simple web UI is served at <http://localhost:8080> (configurable via
`WEB_PORT`). Use it to:

- **Configure** everything (paths, behaviour, Discord webhook/bot) — saved to
  `config.json` and applied live, no restart needed.
- **Preview** the exact summary that would be posted, rendered as a Discord‑style
  embed, **without sending anything** — great for debugging.
- **Compare any two saves** from the saves folder to see the resulting summary.
- **Send a test** of the current preview to Discord on demand.
- **Process now** to run the live pipeline against the current save.
- View **status** (baseline, last result, watcher state).

Secrets (webhook URL, bot token) are never sent back to the browser — the UI
only shows whether they are set, and edits keep the existing value unless you
type a new one or tick “Clear”.

## Docker

Docker Desktop is supported via `compose.yaml`. It mounts your saves folder
read‑only and persists state in `./state`.

```powershell
# Build and run in the background
docker compose up -d --build

# Follow logs
docker compose logs -f

# Stop
docker compose down
```

Then open <http://localhost:8080>. Edit `compose.yaml` to point the
`./Saves:/data/saves:ro` volume at your real server save directory. Configure
Discord either in `compose.yaml` env or directly in the web UI.

> `WATCH_USE_POLLING` defaults to `true` in the container because filesystem
> change events are unreliable across bind mounts.

## Power balance

Each summary includes a grid‑wide power snapshot so readers can immediately see
whether the factory needs more power before expanding:

- **Max production** — the most the world can generate, summed from each
  generator's serialized production capacity (overclock‑aware). If a save has no
  serialized capacity (e.g. every generator idle/unfueled), it falls back to
  rated output × generator count.
- **Max consumption** — the most the world would draw if every machine ran at
  once, summed from each consumer's serialized target consumption.
- **Balance** — production − consumption. A surplus shows ✅; a deficit shows
  ⚠️ _more power needed_.

> Values come straight from the save's `FGPowerInfoComponent` data. Totals are
> summed across every power grid; when there is more than one independent grid
> the count is noted (a global balance can hide a shortfall on a single grid).

## How it works

1. **Watch** `SAVES_DIR` for changes to the canonical save (`chokidar`).
2. **Hash** the file to skip unchanged saves.
3. **Parse** it with `@etothepii/satisfactory-file-parser`.
4. **Extract** a normalized `WorldState` (schematics, power, logistics, buildings, phase).
5. **Diff** against the stored baseline.
6. **Format** a text + embed summary.
7. **Deliver** to Discord (webhook and/or bot) and persist the new baseline.

State (the previous save copy + `db.json` + `config.json`) lives in `STATE_DIR`
and is git‑ignored.

## Developer tools

```powershell
npm run inspect    -- "Saves/<file>.sav" [classFilter]   # header + class counts
npm run dump       -- "Saves/<file>.sav" <ClassName_C>    # dump one object's properties
npm run schematics -- "Saves/<file>.sav"                  # purchased schematics + game phase
npm run diff       -- "Saves/<old>.sav" "Saves/<new>.sav" # print a summary between two saves
npm run docs       -- "<path-to-Docs.json>" [schematicId] # inspect parsed game data
npm test                                                  # unit tests
```

## Roadmap

- Per‑factory **theoretical max output** for higher‑tier parts (recipe rates via the game's `Docs.json`).
- Fuller friendly‑name coverage for items/buildings.
- Named train/truck routes and per‑station throughput.
- Optional "ignore overnight server restart" handling.

## Credits

- Save parsing: [`@etothepii/satisfactory-file-parser`](https://github.com/etothepii4/satisfactory-file-parser)
- Discord‑bot inspiration: [`DJWoodZ/Satisfactory-Discord-Bot`](https://github.com/DJWoodZ/Satisfactory-Discord-Bot)
