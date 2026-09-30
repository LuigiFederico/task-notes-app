# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Taccuino: a personal Electron task manager for Windows. There is no database, and the only network use is the on-demand update check (see below). Every task, project, tag category and tag is a Markdown file with YAML front matter, kept in a user-chosen data folder (usually on OneDrive). The UI, code comments, user-facing strings and data keys (`titolo`, `stato`, `priorita`, `scadenza`, `progetto`…) are all in **Italian**, and new code should follow suit. The README (also in Italian) documents the on-disk data format in detail.

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
- `test/store.test.js` covers `src/main/` (store, formats, front matter), each test against a fresh temp dir. `test/renderer.test.js` imports the renderer's pure modules (`state.js`, `selectors.js`, `lib/util.js`) as ES modules, which is what `src/renderer/package.json` (`"type": "module"`) is for, and fills `S.data` by hand. Views, handlers and `core.js` touch the DOM and have no tests.

## Architecture

**Main process (`src/main/`, CommonJS, Node)**
- `store.js`: the `Store` class holds all file I/O and data rules: default categories, sequential task IDs (`T-001`, computed from the highest existing file), setting and clearing `completato` based on states flagged `chiuso`, tag merge, the trash. `p()` and `trashPath()` check every path segment with `isSafeName` (through `safeJoin`).
- `formats.js`: pure functions (no disk access) that turn each file into an object and back: `parseTask`/`serializeTask`, `parseProject`/`serializeProject` (description + decisions), `parseCategory`/`serializeCategory`, `parseTag`/`serializeTag`. Also `taskHistory`, which builds the `storico` lines written when state, priority, due date or project change, plus `slugify`, `today`, `isSafeName`, `idNum`.
- `fsutil.js`: atomic writes (a `.tmp-<pid>` file, then rename) so OneDrive never syncs a half-written file, retrying the rename on `EPERM`/`EBUSY`.
- `frontmatter.js`: a hand-written parser/serializer for a **YAML subset** (scalars, inline lists, block lists). It is not a full YAML library, so any new field shape must fit that subset. Files may also be edited by hand (CRLF, inline lists).
- `main.js`: window setup, IPC and the folder watcher. Every IPC handler goes through `handle()`, which wraps the result as `{ok, value}` or `{ok:false, error}`. `fs.watch` sends `data:changed` to the renderer after external edits; it ignores `.tmp-*` files and anything within 1.5 s of the store's own `lastWrite`.
- `updater.js`: updates through `electron-updater` against GitHub Releases (`build.publish` in `package.json`), triggered only by the Settings button (`update:check` → `update:download` → `update:install`, silent NSIS install and relaunch). `registerUpdates()` registers the three channels from `main.js`. Only NSIS installs can update; `updateBlock()` detects them by the `Uninstall Taccuino.exe` next to the exe and otherwise returns the message shown instead of the button. Releases are built by `.github/workflows/release.yml` on a `v*` tag push (`npm version minor && git push --follow-tags`).
- `preload.js`: exposes `window.api` through `contextBridge`, and turns `{ok:false}` back into a thrown `Error`. The renderer runs sandboxed with no Node access. The preload is sandboxed too, so it cannot `require` local files: the channel names are written out in both `main.js` and `preload.js`.

**Adding a data operation** touches all three layers: a `Store` method → `handle('x:y', …)` in `main.js` → an entry in `window.api` in `preload.js`.

**Renderer (`src/renderer/`, native ES modules, no framework, no build)**
- `state.js`: a single mutable state object `S` (`config`, `data` from `api.load()`, `view`, `ui`) plus read helpers over `S.data` (`cat`, `tagOf`, `values`, `openTasks`, `sortTasks`…) and the colour palettes.
- `selectors.js`: reads that depend on UI state or today's date: `currentTask`, `visibleTasks`, `groupDefs`, `tagUsage`, `overdueCount`, the weekly project stats.
- Views in `views/` are pure functions that return HTML strings. Always escape interpolated values with `esc()` from `lib/util.js`. Shared pieces (task row, pills, `colorPicker`, `select`/`options`, `kpiTile`, `confirmBox`…) live in `views/components.js`; views never import each other.
- `core.js`: `render()` rebuilds `#app` with `innerHTML` on every change, then restores focus, text selection and scroll positions. Also `reload()`, `run()`, `toast()` and `stopEditing()`. Wrap async work in `run()`, which shows errors as a toast and triggers the mascot's error pose. After a save, the usual pattern is `await reload()`: reload everything from disk, then re-render.
- `handlers/`: one file per topic (`common`, `task`, `project`, `tag`, `settings`), each exporting the tables it needs: `actions` (`data-action`, on click), `changes` (`data-change`), `inputs` (`data-input`), `keydowns` (`data-keydown`), `submits` (`data-submit`). `app.js` merges them (a duplicate name throws at startup), delegates the DOM events from the root element, and wires global shortcuts and the IPC events. A new interaction means adding the attribute in a view and a handler in the table of the matching topic file.
- Imports go one way: `app.js` → `handlers/` → `core.js` → `views/` → `selectors.js` → `state.js`. `core.js` never imports a handler; the task panel's save logic (`flush`, `afterFlush`, `closePanel`) lives in `handlers/task.js`, and other handlers import it from there.
- An external `data:changed` event is deferred while the user is typing (`pendingReload`) and applied on focus-out.
- `mascot.js`: the crow mascot. It lives outside `#app` so re-renders don't interrupt its animations. Event → pose sequences are in `REACTIONS`, and the animations are at the bottom of `styles.css`.
- The CSP in `index.html` blocks inline scripts and all network access from the renderer (updates run in the main process). Fonts come from `@fontsource` packages in `node_modules` (listed in the `build.files` array of `package.json`).

## Data model rules worth knowing

- A task's ID is its **filename**, not its `id` field, so a OneDrive conflict copy (`T-042-PC.md`) appears as a separate task.
- `stato` and `priorita` are system categories (`sistema: true`). They can be renamed and reordered but not deleted. User categories live under `task.tags[catId]` in memory and are written as top-level front-matter keys named after the category ID (a list when the category is `multipla`).
- A tag's ID is its filename slug and does not change when the tag is renamed, so tasks never need rewriting after a rename.
- Tag order (`ordine`) matters: priority order drives task sorting (`prioRank`).
