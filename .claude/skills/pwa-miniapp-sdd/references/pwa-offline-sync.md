# Offline-first data and resync

## Layers

```
UI (Preact components)
  └─ repositories (src/data/*.ts)  ← the only code that touches Dexie
       ├─ Dexie db (src/db/db.ts)   ← IndexedDB, versioned schema
       └─ outbox (src/sync/outbox.ts) ← every local write appends an op in the same transaction
sync engine (src/sync/sync-engine.ts)
  ├─ triggers: 'online' event, app start, visibilitychange→visible, manual "Sync now",
  │            Background Sync where supported (Chromium only — never rely on it alone)
  ├─ flushes outbox through the active SyncAdapter
  ├─ refreshes stale remote caches (if the app consumes any public API)
  └─ asks the service worker to check for an app update
service worker (vite-plugin-pwa / Workbox, generateSW)
  └─ precache app shell; runtime caching only for resources listed in design.md
```

## Service worker

- `registerType: 'prompt'` — show a "New version available — reload" toast instead of
  auto-reloading under the user mid-task. Use `virtual:pwa-register` `onNeedRefresh`.
- `workbox.navigateFallback: 'index.html'` and `globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json}']`.
- Runtime caching for remote GETs: `StaleWhileRevalidate` for data that may be slightly old,
  `CacheFirst` with expiration for immutable assets (covers, fonts). Never cache POSTs.
- `manifest`: `start_url: './'`, `scope: './'`, `display: 'standalone'`, icons 192/512 + maskable.
  Relative URLs keep it working under the GitHub Pages sub-path.
- Service workers don't run in `vite dev` unless `devOptions.enabled`; verify offline on
  `npm run preview`.

## Dexie conventions

- Primary keys are client-generated UUIDs (`crypto.randomUUID()`), never auto-increment — ids
  must stay stable if a backend is added later.
- Every synced record has `updatedAt` (epoch ms) and `deleted: 0|1` (soft delete), so deletions
  can be resynced. Index `updatedAt`.
- Schema changes: bump `db.version(n)` with `.upgrade()`; never edit an old version block. Each
  bump is recorded in the table's OKF Data Store doc.
- Writes: `db.transaction('rw', db.table, db.outbox, async () => { ...; await enqueue(op) })`
  so data and outbox can't diverge.

## Outbox and SyncAdapter

```ts
interface OutboxOp { id: string; type: string; entity: string; entityId: string;
  payload: unknown; createdAt: number; attempts: number; lastError?: string }

interface SyncAdapter {
  name: string;
  push(ops: OutboxOp[]): Promise<{ ok: string[]; failed: { id: string; error: string }[] }>;
  pull?(since: number): Promise<{ entity: string; records: unknown[] }[]>;
}
```

- Default adapter is `localOnlyAdapter`: `push` acknowledges every op immediately (nothing to
  send to), so the outbox drains and the UI sync state reads "Up to date". This keeps the
  resync path exercised in tests from day one.
- When a backend is explicitly approved, write a new adapter; features don't change.
- Flush in `createdAt` order, in batches of 50; on failure keep the op, `attempts++`, back off
  exponentially (1s, 2s, 4s… max 5 min). Never drop ops silently.
- Conflict policy for `pull` (only when a backend exists): last-write-wins on `updatedAt`, soft
  deletes win over older updates. Record any other policy as an OKF Decision.
- A single-flight lock (`navigator.locks.request('sync', …)` when available, else an in-memory
  flag) prevents two tabs from flushing at once.

## Sync state in the UI

Expose a signal/store `{ online: boolean, pending: number, lastSyncAt?: number, error?: string }`
and show it compactly (an icon + count in the header). Offline is a normal state, not an error:
no red banners for it.

## Device-only data safeguards (baseline, every app)

- On first meaningful write call `navigator.storage.persist()`; show its result in Settings.
- Settings → **Export data** downloads a JSON file of all tables (+ schema version);
  **Import data** validates the version and merges by `updatedAt`.
- Show storage usage from `navigator.storage.estimate()`.
- iOS Safari may evict data of non-installed sites after ~7 days of no use: prompt the user to
  "Add to Home Screen" and to export backups; mention it once on first run.
