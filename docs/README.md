# Game documentation files

Place the Satisfactory **`Docs.json`** (or **`en-US.json`** on game version 1.0+)
here so the bot can resolve real display names and show what each research /
milestone unlocks.

Where to find it (game install, not the save location):

- Steam: `…/Satisfactory/CommunityResources/Docs/Docs.json`
- Epic: `…/Epic Games/SatisfactoryEarlyAccess/CommunityResources/Docs/Docs.json`
- Dedicated server: `…/CommunityResources/Docs/en-US.json`

Copy that file into this folder (so it becomes `docs/Docs.json`), or point
`DOCS_PATH` at it directly. You can also drop the **entire `CommunityResources`
folder** in here — the bot auto-discovers `CommunityResources/Docs/en-US.json`
(or `Docs.json`). In Docker, this folder is mounted read-only at `/data/docs`.

With game data loaded, summaries include real names, what each research/milestone
unlocks, alternate-recipe formulas, milestone build costs, and Space Elevator
phase progress.

If no docs file is present, the bot still works — names just fall back to a
prettified version of their internal ids.
