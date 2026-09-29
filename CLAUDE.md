# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Taccuino: a personal Electron task manager for Windows. There is no database and no network. Every task, project, tag category and tag is a Markdown file with YAML front matter, kept in a user-chosen data folder (usually on OneDrive). The UI, code comments, user-facing strings and data keys (`titolo`, `stato`, `priorita`, `scadenza`, `progetto`…) are all in **Italian**, and new code should follow suit. The README (also in Italian) documents the on-disk data format in detail.

## Commands

```bash
npm install
npm start                                        # run the app (electron .)
npm test                                         # node --test test/*.test.js
node --test --test-name-pattern="slugify" test/store.test.js  # run a single test by name
npm run dist                                     # Windows installer + portable exe in dist/
```

- There is no linter, formatter, bundler or build step. `.editorconfig` sets 2-space indent, LF and UTF-8.
- `TACCUINO_USERDATA=<dir> npm start` moves the local config (`config.json`: data folder, window bounds) away from `%APPDATA%\Taccuino`, so dev runs can use a throwaway data folder. `Taccuino/` and `test-data/` are gitignored for this purpose.
- In the running app, `F5` reloads the renderer and `Ctrl+Shift+I` opens DevTools (unpackaged builds only).
- Tests cover only `src/main/` (store + front matter), each against a fresh temp dir. The renderer has no tests.

## Architecture

**Main process (`src/main/`, CommonJS, Node)**
- `store.js`: the `Store` class holds all file I/O and data rules: default categories, sequential task IDs (`T-001`, computed from the highest existing file), the automatic `storico` (history) lines written when state, priority, due date or project change, setting and clearing `completato` based on states flagged `chiuso`, tag merge, and project decisions. Writes are atomic (a `.tmp-<pid>` file, then rename) so OneDrive never syncs a half-written file. `p()` checks every path segment with `isSafeName`.
- `frontmatter.js`: a hand-written parser/serializer for a **YAML subset** (scalars, inline lists, block lists). It is not a full YAML library, so any new field shape must fit that subset. Files may also be edited by hand (CRLF, inline lists).
- `main.js`: window setup, IPC and the folder watcher. Every IPC handler goes through `handle()`, which wraps the result as `{ok, value}` or `{ok:false, error}`. `fs.watch` sends `data:changed` to the renderer after external edits; it ignores `.tmp-*` files and anything within 1.5 s of the store's own `lastWrite`.
- `preload.js`: exposes `window.api` through `contextBridge`, and turns `{ok:false}` back into a thrown `Error`. The renderer runs sandboxed with no Node access.

**Adding a data operation** touches all three layers: a `Store` method → `handle('x:y', …)` in `main.js` → an entry in `window.api` in `preload.js`.

**Renderer (`src/renderer/`, native ES modules, no framework, no build)**
- `state.js`: a single mutable state object `S` (`config`, `data` from `api.load()`, `view`, `ui`) plus read helpers (`cat`, `tagOf`, `values`, `sortTasks`…).
- Views in `views/` are pure functions that return HTML strings. Always escape interpolated values with `esc()` from `lib/util.js`.
- `app.js`: `render()` rebuilds `#app` with `innerHTML` on every change, then restores focus, text selection and scroll positions. Events are delegated from the root element through data attributes that map to handler tables: `data-action` → `actions`, `data-change` → `changes`, `data-input` → `inputs`, `data-keydown` → `keydowns`, `data-submit` → `submits`. A new interaction means adding the attribute in a view and a handler in the matching table. Wrap async work in `run()`, which shows errors as a toast and triggers the mascot's error pose. After a save, the usual pattern is `await reload()`: reload everything from disk, then re-render.
- An external `data:changed` event is deferred while the user is typing (`pendingReload`) and applied on focus-out.
- `mascot.js`: the crow mascot. It lives outside `#app` so re-renders don't interrupt its animations. Event → pose sequences are in `REACTIONS`, and the animations are at the bottom of `styles.css`.
- The CSP in `index.html` blocks inline scripts and all network access. Fonts come from `@fontsource` packages in `node_modules` (listed in the `build.files` array of `package.json`).

## Data model rules worth knowing

- A task's ID is its **filename**, not its `id` field, so a OneDrive conflict copy (`T-042-PC.md`) appears as a separate task.
- `stato` and `priorita` are system categories (`sistema: true`). They can be renamed and reordered but not deleted. User categories live under `task.tags[catId]` in memory and are written as top-level front-matter keys named after the category ID (a list when the category is `multipla`).
- A tag's ID is its filename slug and does not change when the tag is renamed, so tasks never need rewriting after a rename.
- Tag order (`ordine`) matters: priority order drives task sorting (`prioRank`).
