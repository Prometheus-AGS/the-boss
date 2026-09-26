---
description: The Boss developer environment, pinned prerequisites, project setup, and UI team workflow
---

# Develop The Boss

## IDE Setup

### VSCode like

- Editor: [Cursor](https://www.cursor.com/), etc. Any VS Code compatible editor.
- Recommended extensions are listed in [`.vscode/extensions.json`](../../.vscode/extensions.json).

### Zed

1. Install the [Oxc extension](https://github.com/oxc-project/zed-oxc) for Oxfmt and Oxlint.
2. Copy the example settings file to your local Zed config:
   ```bash
   cp .zed/settings.json.example .zed/settings.json
   ```
3. Customize `.zed/settings.json` as needed (it is git-ignored).

## Windows: Enable Symlinks

This project uses symlinks to synchronize files such as AGENTS.md and skills. Windows developers must enable symlink support before cloning:

1. **Enable Developer Mode** (Settings → Update & Security → For developers), or grant `SeCreateSymbolicLinkPrivilege` via `secpol.msc`.
2. **Configure Git**:
   ```bash
   git config --global core.symlinks true
   ```
3. Clone (or re-clone) the repository after enabling symlink support.

## Project Setup

### Install

```bash
pnpm install
```

### Setup Node.js

The required Node.js version is defined in `.node-version`. Use a version manager like [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to install it automatically:

```bash
nvm install
```

### Setup pnpm

The pnpm version is locked in the `packageManager` field of `package.json`. Just enable corepack and it will use the correct version automatically:

```bash
corepack enable
```

### Install Dependencies

```bash
pnpm install
```

### ENV

```bash
cp .env.example .env
```

### Start

```bash
pnpm dev
```

By default, development runs append `Dev` to Electron's default `userData`
directory, keeping local dev data separate from packaged app data. To run
multiple development instances at the same time, give each instance a unique
suffix. You can set it in `.env`:

```bash
CS_DEV_USER_DATA_SUFFIX=DevQuito
```

Or pass it inline when starting a dev instance:

```bash
CS_DEV_USER_DATA_SUFFIX=DevQuito pnpm dev
CS_DEV_USER_DATA_SUFFIX=DevParis pnpm dev
```

The suffix must be a single path component (no path separator, drive colon,
`* ? " < > |`, control character, or trailing dot). Blank values fall back to
`Dev`; anything else that breaks those rules stops the dev run instead of
falling back, so two instances never end up sharing one directory.

### Debug

```bash
pnpm debug
```

Then input chrome://inspect in browser

### Test

```bash
pnpm test
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

For architecture-specific commands and the pinned `better-sqlite3` prebuild workflow, see
[Linux Packaging](./linux-packaging.md).

## UI/UX and project teams

Follow [UI/UX routing and team adoption](./ui-ux-routing.md) for the current portable catalog and existing boss-core role bindings. Its Node 22+ helpers do not relax The Boss application engine and package-manager pins. Preserve shared design tokens and use the tracked Electron workflow for visible changes. Native role files are configuration, not proof of harness invocation.

## Documentation

Documentation is repository Markdown. Edit source headings and frontmatter, run `pnpm docs:index` to generate the index, then run `pnpm docs:check` once the documentation phase is complete. See [The Boss release workflow](./the-boss-release.md) for source-versus-installer evidence; the upstream release workflow is a separate process.
