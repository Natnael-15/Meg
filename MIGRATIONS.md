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

Config schema versions:

- Agent configs (`agents` collection) currently normalize to `schemaVersion: 1`
- Automation configs (`automations` collection) currently normalize to `schemaVersion: 1`
- Threads (`threads` collection) currently normalize to `schemaVersion: 1`
- Notifications (`notifications` collection) currently normalize to `schemaVersion: 1`
- Timeline events (`events` collection) currently normalize to `schemaVersion: 1`
- Telegram messages (`telegramMessages` collection) currently normalize to `schemaVersion: 1`

Config-schema rules:

- Config services are responsible for normalizing records to the current schema version before returning them.
- Future config-shape changes should increment the relevant schema version and keep the migration logic at the config-service boundary.

Retention policy:

- Agent runs are capped to the most recent `200` persisted runs, excluding still-queued/running runs, and each run keeps at most `200` log entries.
- Automation runs are capped to the most recent `200` persisted runs, excluding still-pending/running runs, and each run keeps at most `200` log entries.
- Threads are capped to the most recent `200` persisted threads, and each thread keeps at most `500` messages.
- Notifications are capped to the most recent `200` persisted items.
- Timeline events are capped to the most recent `500` persisted items.
- Telegram messages are capped to the most recent `500` persisted messages.

Retention rules:

- Retention is enforced at the main-process store or runner boundary before records are returned and persisted.
- Active work in progress should be preserved even when historical completed records are pruned.
- Future retention changes should be updated here in the same change that alters the enforcing store or runner.
