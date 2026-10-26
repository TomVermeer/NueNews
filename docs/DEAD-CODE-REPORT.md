# Dead code and stale documentation report

Branch `feature/Remove_Dead_code`. Five read-only Haiku auditors scanned disjoint slices (API routes/auth, API providers/scheduler/db, web components, web lib/stores/shared, docs/config). Claims marked **verified** were re-checked by grep by the main session; the rest are the auditors' findings. Nothing has been changed yet. This file is temporary and should be deleted before merging.

Tags: **A** safe to remove (no behaviour change), **B** your decision, **C** keep (reported, but deliberate or planned).

## 1. Code: safe to remove (A)

| #   | Where                                                                        | What                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fix                                                                       |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A1  | `apps/web/src/test/mount.ts:40`                                              | `settle()` has no caller (verified)                                                                                                                                                                                                                                                                                                                                                                                                                    | delete                                                                    |
| A2  | `apps/api/src/test/helpers.ts:116,124,132`                                   | `registryKinds` option of `createTestApp` that no test passes (verified)                                                                                                                                                                                                                                                                                                                                                                               | delete option and its two uses                                            |
| A3  | `apps/api/src/db/items.ts:46`                                                | `listLatestItems` is used only by two test files; the route builds its own query (verified)                                                                                                                                                                                                                                                                                                                                                            | delete, rewrite its tests to query the table directly                     |
| A4  | `apps/api/src/db/seed.ts:4`                                                  | Comment says real auth "will replace this later"; auth exists                                                                                                                                                                                                                                                                                                                                                                                          | reword: development and test fallback user                                |
| A5  | `apps/web/src/stores/auth.ts` (`session`, `email` in returned state)         | `session` has no reader; `email` is read only by its own test                                                                                                                                                                                                                                                                                                                                                                                          | stop returning them, adjust test                                          |
| A6  | `apps/web/src/composables/useLayoutDraft.ts:72`                              | `removed` returned but read only by tests                                                                                                                                                                                                                                                                                                                                                                                                              | stop returning it, test via `payload()`                                   |
| A7  | Unneeded `export` keywords (types and constants used only in their own file) | `AuthEnv`, `SupabaseAuthOptions`, `AuthenticatedUser`, `InternalOptions`, `sourceKindSchema`, `widgetTypeSchema`, `layoutSchema`, `widgetColorSchema`, `calls`/`RecordedCall` in `fakeApi.ts`, `WIDGET_POLL_MS`, `LayoutSave`, `WidgetTypeInfo`, `WIDGET_COLOR_LABELS`, `PanelState`, `ParsedFeed`, `Description`, `WeatherDeps`, `WeatherResult`, `HttpHeaders`, `RawResponse`, `HttpClientOptions`, `SchedulerOptions`, `Scheduler`, `ImportOptions` | drop `export`                                                             |
| A8  | `Layout` type (`packages/shared/src/api.ts:23`)                              | no importer                                                                                                                                                                                                                                                                                                                                                                                                                                            | delete                                                                    |
| A9  | `ProviderError.status` (`providers/errors.ts`)                               | set by callers, never read; `retryAfterSeconds` is the used field                                                                                                                                                                                                                                                                                                                                                                                      | remove field and the places that pass it (the weather and RSS call sites) |

Not applied under A7: helpers exported only so tests can import them (`feedUrlFor`, `channelUrlFor`, `pageUrlFromInput`, `channelIdFromPage`, `iconFromPage`, `normalizeInput`, `cacheKey`, `isPrivateAddress`). Removing `export` would break the tests, so they stay (C).

## 2. Code: your decision (B)

| #   | Where                                                                                                                                                      | What                                                                                          | Recommendation                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| B1  | `GET /widget-types`                                                                                                                                        | Mounted, tested, documented; the web app never calls it (it has its own `lib/widgetTypes.ts`) | remove route, test, README and DESIGN rows                                                                   |
| B2  | `PUT /dashboards/reorder`                                                                                                                                  | No web UI calls it                                                                            | keep until tab reordering exists, or remove with its schema                                                  |
| B3  | `DELETE /widgets/:id`                                                                                                                                      | The web removes widgets through the layout save; the route is tested and documented           | keep: it is a natural API operation, and removing saves little                                               |
| B4  | `now` prop on `FeedWidget` and `YouTubeWidget`                                                                                                             | Only tests pass it                                                                            | keep as a test seam                                                                                          |
| B5  | `RefreshDeps.keepItems`, `RefreshOutcome` return                                                                                                           | Only tests use them                                                                           | keep as test seams                                                                                           |
| B6  | `SchedulerOptions.batchLimit`, `maxConcurrentHosts`                                                                                                        | Never passed, defaults only                                                                   | keep as tuning knobs                                                                                         |
| B7  | `credentials` table (schema, migrations, importer copy)                                                                                                    | Nothing reads or writes it                                                                    | keep: reserved for the RoyalRoad "follows" mode (open question in DESIGN.md). Dropping needs a new migration |
| B8  | `items.meta` column and `NormalizedItem.meta`                                                                                                              | No provider sets it today; tests use it                                                       | keep: the RoyalRoad chapter notion will need it                                                              |
| B9  | `users.email`, `AuthenticatedUser.email`                                                                                                                   | Written on login, never read                                                                  | keep: needed for multi-user invitations                                                                      |
| B10 | SQLite importer (`scripts/import-sqlite.ts`, `db/importSqlite.ts` + test, `better-sqlite3` and its types, `pnpm-workspace.yaml` entry, `.gitignore` rules) | The migration to PostgreSQL is done and the data is loaded into Supabase                      | remove after you are sure you will not re-import. It is the only SQLite code left                            |
| B11 | `backups/nuenews-sqlite-backup.sqlite` (local, untracked, ignored)                                                                                         | A one-off backup, no doc mentions it                                                          | you decide; I will not touch it                                                                              |
| B12 | Playwright config remnants (`eslint.config.js:8`, `.gitignore:16-18`)                                                                                      | Playwright is not installed                                                                   | remove until Playwright is added                                                                             |

Not confirmed, so dropped: the auditor said `ResolvedSource.faviconUrl` is never set. The reference it cited was a wrong line, and the field is read through the source row elsewhere. I did not verify it further.

## 3. Documentation: stale or wrong (all verified against code unless noted)

**README.md**

- Line 23: "API: online" does not exist; the top bar shows "Updated <time ago>".
- Lines 41-47: config table says all variables are optional and omits `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `CRON_SECRET`, `NODE_ENV`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `SUPABASE_URL` is required in production.
- Lines 35 and `.env.example:21`: changing `PORT` breaks the dev proxy because `vite.config.ts` hard-codes port 3000.
- Lines 51 and 129: "v1 has no login" is outdated (Supabase login exists; no login only in development).
- Line 95: "Planned: PostgreSQL, Pinia, Vue Router, TanStack Query, grid-layout-plus, MSW and Playwright": all except MSW and Playwright are built; MSW is not used.
- Lines 99-107: layout lists only one doc under `docs/`.
- Line 133: "Other providers are still to do": the YouTube provider exists.
- Line 159: hard-coded test counts conflict with the deployment plan and are not exact.
- Lines 161-163: "Immediately next" still lists real authentication; says CI runs on every push (it runs on pushes to `main` and all pull requests).

**CLAUDE.md**

- Line 45: "upserts items into SQLite" should say PostgreSQL.
- Line 16: `pnpm build` also type-checks the API.
- "Where we left off" should mention the MET Norway switch and that the app is deployed on Render.

**docs/DESIGN.md**

- Lines 18, 88: "no login" / "after auth lands".
- Line 86: `GET /export` and `POST /import` listed, not built.
- Line 102: `lib/ (ssrf, http, sanitize)`: the file is `text.ts`.
- Line 103: widget folders do not exist; widgets are flat files.
- Line 104: shared package list omits `weather.ts`.
- Line 115: Phase 6 lists Postgres and auth as future.
- Line 124: "RoyalRoad responses" fixtures do not exist.
- Lines 134, 139: MSW and Playwright are described as in use.
- Duplicates README's Stack and Design principles.

**docs/DEPLOYMENT-PLAN.md**

- Lines 9-10: "Where we start" describes the pre-migration state in present tense.
- Line 38: Step 1 item 7 says "Still open" but is done.
- Steps 2: items 2-5 lack the done marks that Step 3 has.
- Step 4: the owner checklist is out of date now that Supabase, the import and Render are done (and the pooler section moved to the Connect button). Should record what happened.
- Test counts (296 API, 150 web) are stale (now 344 and 175).

## 4. Proposed order of work

1. Part A code changes, one commit, then lint, typecheck and tests.
2. Part B items you approve.
3. Documentation fixes, one commit per file group; the plan and "Where we left off" rewritten last so they describe the final state.
4. Delete this report.
