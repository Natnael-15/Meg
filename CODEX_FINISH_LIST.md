# Codex Execution Brief: Finish Meg, Do Not Partially Tidy It

Primary backlog file: `PROJECT_DEEP_DIVE_GAPS.txt`

## Mission

Meg is still carrying prototype behavior behind a more polished shell. The job is not to keep refactoring the surface. The job is to finish the unfinished product work in `PROJECT_DEEP_DIVE_GAPS.txt` until normal app use is driven by real state, real workflows, and real persistence.

## Non-negotiable rules

1. Treat `PROJECT_DEEP_DIVE_GAPS.txt` as the source backlog until it is materially closed.
2. Do not leave demo seed data in normal production boot flows.
3. Do not leave visible no-op buttons in the UI.
4. Do not present chat shortcuts as real product workflows unless they are labeled as shortcuts.
5. Do not preserve duplicate dead code "just in case".
6. Do not widen the product surface with more mock features before finishing the existing ones.
7. After each slice:
   - run tests
   - run the renderer build
   - update the backlog file if scope changes or new gaps are found

## Required working style

- Prefer truthful empty states over fake populated states.
- Prefer one real workflow over three decorative ones.
- Prefer removing a misleading feature over shipping it half-connected.
- When a feature crosses renderer and main process boundaries, finish the whole path.
- When a settings toggle exists, it must affect real behavior or be removed.
- When a list is persisted, boot from persisted state, not demo fixtures.

## Execution order

### Phase 1: Remove lies in the UI

- Delete dead controls and no-op actions.
- Remove duplicate dead component definitions.
- Replace fake counters, fake timestamps, fake file counts, and fake logs.

### Phase 2: Remove demo-first boot behavior

- Eliminate normal-boot seed data from:
  - conversations
  - notifications
  - workspaces
  - events
  - automations
  - agents
  - file browser
  - mobile companion

### Phase 3: Convert fake workflows into real workflows

- File creation should create files.
- Agent runs should run through a real execution pipeline.
- Automations should execute through a real backend model.
- Workspace actions should either become real workflows or explicit chat shortcuts.

### Phase 4: Replace scaffolding

- Remove `prompt()` and `confirm()` based editing from production surfaces.
- Add real dialogs, validation, and error handling.

### Phase 5: Unify persistence and permissions

- Make thread/workspace/settings/notification/message state coherent.
- Ensure tool toggles and permission surfaces control real backend behavior.
- Remove split safety models where direct IPC bypasses tool-policy intent.

### Phase 6: Retire legacy branches

- Remove renderer fallback and other compatibility branches that no longer serve the shipped app.
- Keep migration paths only if versioned and justified.

### Phase 7: Update product truth

- Only after the app behavior is real:
  - update README
  - update versioned links
  - update release messaging

## Definition of done

Do not claim completion until all of the following are true:

- No default mock/demo data appears during a standard first launch.
- No dead button remains.
- No major view depends on fabricated rows to look complete.
- Core actions are direct product actions, not disguised chat prompts.
- Settings and permission controls change real application behavior.
- Main/renderer persistence model is coherent and tested.
- README and shipped behavior match.

## Deliverable expectation for each future Codex pass

Each pass should end with:

1. what backlog items were closed
2. what files changed
3. what tests/build commands passed
4. what remains open in `PROJECT_DEEP_DIVE_GAPS.txt`

If a backlog item cannot be finished safely in the current pass, reduce scope and close a coherent vertical slice instead of leaving another partial abstraction behind.
