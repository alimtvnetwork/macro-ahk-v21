# 03 — Asset Packaging

## Workflow Changes (`.github/workflows/release.yml`)

In the `Package release assets` step (currently around line 326), append:

```bash
# ── Pinned installers (release-only assets) ──
sed "s/__PINNED_VERSION__/${VER}/g" scripts/release-version.ps1 \
    > release-assets/release-version.ps1
sed "s/__PINNED_VERSION__/${VER}/g" scripts/release-version.sh \
    > release-assets/release-version.sh
chmod +x release-assets/release-version.sh

# ── Verify the sentinel was actually replaced ──
if grep -q '__PINNED_VERSION__' release-assets/release-version.ps1 \
   release-assets/release-version.sh; then
    echo "::error::Pinned-version sentinel was not substituted — installer would fail at runtime"
    exit 1
fi
```

The verification step is non-negotiable — a release that ships an unstamped pinned installer is broken by definition. Failing the workflow is the right outcome.

## Asset Order in the Release

Append the two new assets to the asset matrix in the release notes. They appear **above** `install.ps1` / `install.sh` so users see the pinned option first:

```
release-version.ps1   ← NEW, pinned to this release
release-version.sh    ← NEW, pinned to this release
install.ps1           ← existing, latest channel
install.sh            ← existing, latest channel
marco-extension-{VER}.zip
…
```

## Checksums

The existing `sha256sum * > checksums.txt` step automatically picks up the two new files because it globs the entire `release-assets/` directory. **No change needed.**

## Source File Layout

```
scripts/
├── install.ps1               # existing — latest channel
├── install.sh                # existing — latest channel
├── release-version.ps1       # NEW — sentinel template, never run from clone
└── release-version.sh        # NEW — sentinel template, never run from clone
```

The committed templates always contain `__PINNED_VERSION__`. They are **never executed from the repo** — the only way to run them is to download the stamped variant from a release.

## Local Smoke Test

A maintainer can dry-run the stamping locally:

```bash
VER="v2.158.0"
mkdir -p /tmp/release-test
sed "s/__PINNED_VERSION__/${VER}/g" scripts/release-version.ps1 \
    > /tmp/release-test/release-version.ps1
sed "s/__PINNED_VERSION__/${VER}/g" scripts/release-version.sh \
    > /tmp/release-test/release-version.sh
grep -H 'PinnedVersion\|PINNED_VERSION=' /tmp/release-test/*
```

Expected output:

```
/tmp/release-test/release-version.ps1:$script:PinnedVersion = 'v2.158.0'
/tmp/release-test/release-version.sh:PINNED_VERSION='v2.158.0'
```
