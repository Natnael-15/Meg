# Meg Migration Policy

Current canonical persistence:

- `meg.db` when `node:sqlite` is available
- `meg-store.json` fallback when SQLite is unavailable

Legacy imports still supported in `0.5.0`:

1. `meg-settings.json`
   - Migration id: `settings:meg-settings.json:v1`
2. `meg-<table>.json`
   - Migration id format: `table:<table>:meg-<table>.json:v1`

Rules:

- Legacy imports run only when the canonical store is empty for that scope.
- Each migration writes a status record into store metadata after it runs or is skipped.
- Supported statuses today:
  - `imported`
  - `skipped-existing`
  - `skipped-empty`
  - `invalid`

Retirement policy:

- Legacy JSON import support was formalized in `0.5.0`.
- The current target retirement point is after `0.7.0`.
- Removal is only safe once packaged upgrades through the JSON-era builds have been validated.

Operational intent:

- New persistence work should target the canonical store only.
- No new features should depend on legacy JSON files.
- When the legacy import path is retired, remove both the code path and this policy file in the same change.
