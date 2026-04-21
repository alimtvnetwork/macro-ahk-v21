# 04 — Release Notes Template

The release notes generator (`Generate release notes` step in `release.yml`) currently emits a single "Quick Install" section with the latest-channel one-liners. This spec replaces it with **two clearly labeled sections**.

## New "Quick Install" Section

```markdown
### Quick Install

#### 🔒 Pinned to this release (recommended)

The pinned installer is bound to **this exact version** — `${VER}`.
It will not roll forward, even if a newer release exists.

**Windows (PowerShell):**
\`\`\`powershell
irm https://github.com/${REPO}/releases/download/${VER}/release-version.ps1 | iex
\`\`\`

**Linux / macOS:**
\`\`\`bash
curl -fsSL https://github.com/${REPO}/releases/download/${VER}/release-version.sh | bash
\`\`\`

#### 🌊 Latest channel (auto-update)

The latest-channel installer always resolves the newest published release at the
moment it runs. Use this if you want to follow `main`.

**Windows (PowerShell):**
\`\`\`powershell
irm https://raw.githubusercontent.com/${REPO}/main/scripts/install.ps1 | iex
\`\`\`

**Linux / macOS:**
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | bash
\`\`\`

**Pin a specific version (latest channel, manual override):**
\`\`\`powershell
& { \$Version = "${VER}"; irm https://raw.githubusercontent.com/${REPO}/main/scripts/install.ps1 | iex }
\`\`\`

\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | bash -s -- --version ${VER}
\`\`\`
```

## Asset Table Update

Add two rows to the existing asset table:

```markdown
| Asset | Description |
|-------|-------------|
| \`release-version.ps1\` | **Pinned** PowerShell installer (Windows) — installs **exactly ${VER}** |
| \`release-version.sh\` | **Pinned** Bash installer (Linux/macOS) — installs **exactly ${VER}** |
| \`install.ps1\` | Latest-channel PowerShell installer |
| \`install.sh\` | Latest-channel Bash installer |
…
```

## Why "Pinned" Comes First

Most users landing on a specific release page **want that exact version** — they got there via a link in a bug report, a changelog entry, or a known-good rollback target. Surfacing the pinned option first matches that intent and removes the foot-gun of "I copied the one-liner from v2.150 and somehow ended up on v2.160".

The latest channel stays available below for users explicitly opting into auto-update.
