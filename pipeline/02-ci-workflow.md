# 02 — CI Workflow

**File**: `.github/workflows/ci.yml`
**Triggers**: Push to `main`, Pull requests to `main`
**Concurrency**: Cancel previous in-flight builds when a new commit lands

## Pipeline Architecture

The CI pipeline is structured as **6 jobs** with dependency edges:

```
┌──────────┐
│  setup   │  ← Checkout, lint (root), test
└────┬─────┘
     │
     ├─────────────────────┐
     │                     │
┌────▼─────┐        ┌─────▼──────┐
│ build-sdk│        │build-prompts│
└────┬─────┘        └─────┬──────┘
     │                     │
     ├──────────┐          │
     │          │          │
┌────▼───┐ ┌───▼──────┐   │
│ xpath  │ │controller│   │
└────┬───┘ └───┬──────┘   │
     │         │           │
     └────┬────┘───────────┘
          │
   ┌──────▼───────┐
   │build-extension│  ← Downloads all artifacts, final build
   └──────────────┘
```

## Job Descriptions

### 1. `setup` — Lint & Test

Runs all quality gates before any build work begins.

| Step | Command | Purpose |
|------|---------|---------|
| Checkout | `actions/checkout@v4 (fetch-depth: 0)` | Full history for changelog generation |
| Enforce lowercase .md | `find + grep` | Block uppercase `.md` filenames |
| Setup Node.js | `actions/setup-node@v4 (node 20)` | Runtime environment |
| Setup pnpm | `pnpm/action-setup@v4 (pnpm 9)` | Package manager |
| Install root deps | `pnpm install --no-frozen-lockfile` | Root workspace packages |
| Root lint | `pnpm run lint` | ESLint 9 flat config (root) |
| Tests | `pnpm run test` | Vitest single-pass run |

### 2. `build-sdk` — Marco SDK

**Depends on**: `setup`
**Uploads**: `standalone-scripts/marco-sdk/dist/` as `sdk-dist` artifact

The SDK must build first because XPath and Macro Controller depend on it.

Build command chain:
```
check-axios-version → compile-instruction → tsc --noEmit → vite build → generate-dts
```

### 3a. `build-xpath` — XPath Utility

**Depends on**: `build-sdk`
**Downloads**: `sdk-dist`
**Uploads**: `standalone-scripts/xpath/dist/` as `xpath-dist` artifact

Build command chain:
```
check-axios-version → compile-instruction → tsc --noEmit → vite build
```

### 3b. `build-macro-controller` — Macro Controller

**Depends on**: `build-sdk`
**Downloads**: `sdk-dist`
**Uploads**: `standalone-scripts/macro-controller/dist/` as `macro-controller-dist` artifact

Build command chain:
```
check-axios-version → build:prompts → build:macro-less → build:macro-templates
→ compile-instruction → build:seed-manifest → check-version-sync
→ tsc --noEmit → vite build → sync-macro-controller-legacy
```

### 3c. `build-prompts` — Prompt Aggregation

**Depends on**: `setup` (no SDK dependency)
**Uploads**: `standalone-scripts/prompts/` as `prompts-dist` artifact

Build command: `node scripts/aggregate-prompts.mjs`

### 4. `build-extension` — Chrome Extension

**Depends on**: `build-sdk`, `build-xpath`, `build-macro-controller`, `build-prompts`
**Downloads**: All 4 artifacts into their respective `dist/` directories

Build command chain:
```
check-axios-version → lint-const-reassign → compile-instruction (×3)
→ check-standalone-dist → check-version-sync → vite build
```

After build, a **source map verification** step scans `chrome-extension/dist` for any `.map` files and **fails the pipeline** if any are found.

## Concurrency Strategy

```yaml
concurrency:
  group: ci-main-${{ github.sha }}
  cancel-in-progress: true
```

A new push to `main` cancels any in-progress CI run. This saves runner minutes
since only the latest commit matters.

## Artifact Passing Between Jobs

Each standalone script build uploads its `dist/` directory using `actions/upload-artifact@v4`.
Downstream jobs download these artifacts into the same relative paths before building.

| Artifact Name | Source Path | Consumed By |
|---------------|------------|-------------|
| `sdk-dist` | `standalone-scripts/marco-sdk/dist/` | xpath, controller, extension |
| `xpath-dist` | `standalone-scripts/xpath/dist/` | extension |
| `macro-controller-dist` | `standalone-scripts/macro-controller/dist/` | extension |
| `prompts-dist` | `standalone-scripts/prompts/` | extension |

Artifacts have a 1-day retention — they are ephemeral build intermediates only.


- Vitest with `vitest run` (single pass, no watch)
- jsdom environment for DOM-dependent tests
- Tests located in `src/__tests__/`, `src/test/`, and `**/__tests__/`

## What "Build Extension" Does Internally

The `build:extension` script chains several validation steps before the actual Vite build:

```
check-axios-version → lint-const-reassign → compile-instruction (×3)
→ check-standalone-dist → check-version-sync → vite build
```

See [05-build-chain.md](05-build-chain.md) for details.
