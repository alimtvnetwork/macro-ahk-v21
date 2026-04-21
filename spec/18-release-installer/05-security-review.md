# 05 — Security Review

## Threat Model

The pinned installer's job is to give a user a **reproducible, non-rolling install** of a specific extension version. The threats it must guard against:

| # | Threat | Mitigation in v0.1 |
|---|--------|--------------------|
| T1 | Silent version drift (user thinks they got vX, actually got vY) | Stamped constant + hard error if sentinel still present |
| T2 | Attacker swaps `latest` to a malicious release | Pinned installer **never queries `latest`**; immune by design |
| T3 | Attacker deletes the targeted release and replaces it | Asset 404 produces hard error (exit code 4); installer refuses to fall back |
| T4 | Tampered installer binary mid-flight (MITM on download) | Out of scope for v0.1 — see "Future Hardening" |
| T5 | Tampered ZIP archive mid-flight | Partially mitigated by checksums.txt, but the installer does **not** verify them in v0.1 — see "Future Hardening" |
| T6 | User passes `-Version latest` thinking it's safe | Hard-rejected with explicit error message |
| T7 | User passes `-Version main` or a branch name | Hard-rejected by version-format regex |

## Integrity Guarantees (v0.1)

The installer **does** guarantee:

- ✅ No network call to determine the target version (when stamped — the 99.9% case)
- ✅ No silent roll-forward to a newer release
- ✅ Explicit error exits for every "fall-back-to-something-else" scenario
- ✅ Atomic install (clean target dir before extract, abort on extract failure)
- ✅ Manifest verification post-extract

The installer **does not** guarantee in v0.1:

- ❌ Cryptographic verification of the downloaded ZIP (no SHA256 check against `checksums.txt`)
- ❌ Code signing of the installer itself (PowerShell ExecutionPolicy, GPG, etc.)
- ❌ TLS pinning to `github.com` (relies on system trust store)
- ❌ Air-gapped install (always requires `github.com` reachability)

## Future Hardening (v0.2+)

In priority order:

1. **Built-in checksum verification** — The installer fetches `checksums.txt` from the same release and verifies the ZIP's SHA256 before extracting. ~15 lines added to each script. Eliminates threat T5.
2. **Signed installers** — Sign `release-version.ps1` with an Authenticode certificate (Windows) and provide GPG signatures for the Bash variant. Eliminates threats T4 and T5 against active attackers.
3. **TLS pin** — Hardcode the expected `github.com` certificate fingerprint. Defense against compromised CAs. Low practical value vs. complexity.
4. **Reproducible builds** — Publish build provenance (SLSA) so end users can audit the GitHub Action that produced the assets. Defense against compromised CI.

These are tracked in `plan.md` as a follow-up workstream — **not blockers for v0.1**.

## Operator Checklist (per release)

Before tagging a release with the new pinned installer flow:

- [ ] `release.yml` contains the `sed` substitution for both `.ps1` and `.sh` templates.
- [ ] `release.yml` contains the sentinel-leak check (`grep -q '__PINNED_VERSION__'`).
- [ ] Release notes show the pinned section **above** the latest-channel section.
- [ ] Smoke-tested locally with the `sed` dry-run from spec 03.
- [ ] Verified in the GitHub Release UI that both `release-version.ps1` and `release-version.sh` appear in the asset list.
