#!/usr/bin/env bash
# Re-exec under bash if invoked via sh/dash
if [ -z "${BASH_VERSION:-}" ]; then
    if command -v bash >/dev/null 2>&1; then
        case "${0##*/}" in
            sh|dash|ash|ksh|mksh)
                exec bash -s -- "$@"
                ;;
        esac
        exec bash "$0" "$@"
    else
        printf '\033[31m Error: bash is required but not found.\033[0m\n' >&2
        exit 1
    fi
fi

# ─────────────────────────────────────────────────────────────────────
# Marco Extension — Unified installer (Linux / macOS)
#
# Single installer — the version is auto-derived from the script's source
# URL when downloaded from a GitHub release page (so each release-page
# one-liner is implicitly pinned to that exact release). When run from
# raw.githubusercontent.com/.../main/ or from a clone, it falls back to
# resolving the GitHub `latest` release.
#
# Resolution order:
#   1. Explicit --version override (vX.Y.Z[-pre], or `latest`).
#   2. URL parsed from $BASH_SOURCE / $0 / $MARCO_INSTALLER_URL
#      — matching /releases/download/(vX.Y.Z)/.
#   3. GitHub Releases API → `latest`.
#
# Examples:
#   # Release-page one-liner (URL-pinned):
#   curl -fsSL https://github.com/alimtvnetwork/macro-ahk-v21/releases/download/v2.158.0/install.sh | bash
#
#   # From main (latest channel):
#   curl -fsSL https://raw.githubusercontent.com/alimtvnetwork/macro-ahk-v21/main/scripts/install.sh | bash
#
#   # Explicit override:
#   ./install.sh --version v2.150.0
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="alimtvnetwork/macro-ahk-v21"
VERSION_REGEX='^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$'
TMP_DIR=""
URL_PINNED=0

cleanup() {
    if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
        rm -rf "${TMP_DIR}"
    fi
}
trap cleanup EXIT

# ── Logging ─────────────────────────────────────────────────────────

step() { printf ' \033[36m%s\033[0m\n' "$*" >&2; }
ok()   { printf ' \033[32m%s\033[0m\n' "$*" >&2; }
warn() { printf ' \033[33m%s\033[0m\n' "$*" >&2; }
err()  { printf ' \033[31m%s\033[0m\n' "$*" >&2; }

# ── OS detection ────────────────────────────────────────────────────

detect_os() {
    local uname_out
    uname_out="$(uname -s)"
    case "${uname_out}" in
        Linux*|Darwin*) ;;
        MINGW*|MSYS*|CYGWIN*)
            err "Windows detected. Use the PowerShell installer instead:"
            err "  irm https://raw.githubusercontent.com/${REPO}/main/scripts/install.ps1 | iex"
            exit 1
            ;;
        *)
            err "Unsupported OS: ${uname_out}"
            exit 1
            ;;
    esac
}

# ── Version resolution ─────────────────────────────────────────────

is_valid_version() {
    [[ "$1" =~ $VERSION_REGEX ]]
}

version_from_url() {
    local candidate
    for candidate in "${BASH_SOURCE[0]:-}" "${0:-}" "${MARCO_INSTALLER_URL:-}"; do
        if [ -n "${candidate}" ] && [[ "${candidate}" =~ /releases/download/(v[0-9]+\.[0-9]+\.[0-9]+[^/]*)/ ]]; then
            echo "${BASH_REMATCH[1]}"
            return 0
        fi
    done
    return 1
}

fetch_latest_version() {
    step "Resolving latest release from github.com/${REPO}..."
    local url="https://api.github.com/repos/${REPO}/releases/latest"
    local tag

    if command -v curl >/dev/null 2>&1; then
        tag="$(curl -fsSL "${url}" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
    elif command -v wget >/dev/null 2>&1; then
        tag="$(wget -qO- "${url}" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
    else
        err "Neither curl nor wget found — cannot fetch latest release."
        exit 5
    fi

    if [ -z "${tag}" ]; then
        err "Failed to determine latest version from GitHub API."
        exit 5
    fi
    echo "${tag}"
}

resolve_version() {
    local override="$1"

    # 1. Explicit override
    if [ -n "${override}" ]; then
        if [ "${override}" = "latest" ]; then
            fetch_latest_version
            return
        fi
        if ! is_valid_version "${override}"; then
            err "Invalid --version '${override}'. Must match v<major>.<minor>.<patch>[-prerelease] or 'latest'."
            exit 3
        fi
        echo "${override}"
        return
    fi

    # 2. URL-derived pin
    local from_url
    if from_url="$(version_from_url)" && is_valid_version "${from_url}"; then
        URL_PINNED=1
        step "Pinned to ${from_url} (derived from download URL)."
        echo "${from_url}"
        return
    fi

    # 3. Fallback to latest
    fetch_latest_version
}

# ── Download ────────────────────────────────────────────────────────

download() {
    local url="$1" dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL -o "${dest}" "${url}"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "${dest}" "${url}"
    else
        err "Neither curl nor wget found."
        exit 5
    fi
}

download_asset() {
    local version="$1"
    local asset_name="marco-extension-${version}.zip"
    local asset_url="https://github.com/${REPO}/releases/download/${version}/${asset_name}"
    local archive_path="${TMP_DIR}/${asset_name}"

    step "Downloading ${asset_name}..."
    if ! download "${asset_url}" "${archive_path}"; then
        err "Download failed."
        err "URL: ${asset_url}"
        err ""
        err "Release ${version} may have been retracted or the asset is missing."
        exit 4
    fi

    ok "Downloaded successfully."
    echo "${archive_path}"
}

# ── Install ─────────────────────────────────────────────────────────

install_extension() {
    local archive_path="$1" install_dir="$2" version="$3"

    step "Installing to ${install_dir}..."

    if [ -d "${install_dir}" ]; then
        rm -rf "${install_dir}"
    fi
    mkdir -p "${install_dir}"

    if command -v unzip >/dev/null 2>&1; then
        unzip -qo "${archive_path}" -d "${install_dir}"
    else
        err "unzip not found. Install via apt/brew and retry."
        exit 6
    fi

    local file_count
    file_count="$(find "${install_dir}" -type f | wc -l | tr -d ' ')"
    if [ "${file_count}" -eq 0 ]; then
        err "Extraction produced no files in ${install_dir}"
        exit 6
    fi

    if [ ! -f "${install_dir}/manifest.json" ] && \
       ! find "${install_dir}" -maxdepth 3 -name manifest.json -print -quit | grep -q .; then
        err "manifest.json not found — archive may be corrupted."
        exit 6
    fi

    echo "${version}" > "${install_dir}/VERSION"
    ok "Installed ${file_count} files to ${install_dir}"
}

resolve_install_dir() {
    local dir="$1"
    if [ -n "${dir}" ]; then
        echo "${dir}"
    else
        echo "${HOME}/marco-extension"
    fi
}

# ── Args ────────────────────────────────────────────────────────────

parse_args() {
    VERSION_OVERRIDE=""
    INSTALL_DIR=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --version|-v)  VERSION_OVERRIDE="$2"; shift 2 ;;
            --dir|-d)      INSTALL_DIR="$2";      shift 2 ;;
            --repo|-r)     REPO="$2";             shift 2 ;;
            --help|-h)
                cat <<EOF
Usage: install.sh [--version <ver>] [--dir <path>] [--repo <owner/repo>]

Unified installer for Marco Chrome Extension.

When run from a GitHub release-page download URL, the version is auto-derived
from that URL (URL-pinned). Otherwise falls back to GitHub 'latest'.

Options:
  --version <ver>  Force a specific version (vX.Y.Z[-pre]) or 'latest'.
  --dir <path>     Target directory (default: ~/marco-extension)
  --repo <o/r>     GitHub owner/repo override
EOF
                exit 0
                ;;
            *)
                err "Unknown option: $1"
                err "Run with --help for usage."
                exit 3
                ;;
        esac
    done
}

# ── Summary ─────────────────────────────────────────────────────────

print_install_summary() {
    local version="$1" install_dir="$2"
    local pin_note=""
    if [ "${URL_PINNED}" -eq 1 ]; then
        pin_note=" (pinned via release URL)"
    fi
    echo ""
    step "Install summary"
    printf '  Version:     %s%s\n' "${version}" "${pin_note}" >&2
    printf '  Install dir: %s\n' "${install_dir}" >&2
    echo ""
    echo "  ----------------------------------------------------------"
    echo "  To load in Chrome / Edge / Brave:"
    echo ""
    echo "  1. Open chrome://extensions (or edge://extensions)"
    echo "  2. Enable 'Developer mode' (toggle in top-right)"
    echo "  3. Click 'Load unpacked'"
    echo "  4. Select: ${install_dir}"
    echo "  ----------------------------------------------------------"
    echo ""
    if [ "${URL_PINNED}" -eq 1 ]; then
        warn "URL-pinned install — re-running this exact one-liner reinstalls ${version}."
        printf '  \033[90mFor auto-update, use install.sh from raw.githubusercontent.com/.../main/.\033[0m\n'
    else
        printf '  \033[90mTo update later, re-run this script \xe2\x80\x94 it replaces the folder.\033[0m\n'
    fi
}

# ── Main ────────────────────────────────────────────────────────────

main() {
    echo ""
    echo " Marco Extension installer"
    printf ' \033[90mgithub.com/%s\033[0m\n' "${REPO}"
    echo ""

    parse_args "$@"
    detect_os

    local version install_dir archive_path
    version="$(resolve_version "${VERSION_OVERRIDE}")"
    install_dir="$(resolve_install_dir "${INSTALL_DIR}")"

    TMP_DIR="$(mktemp -d)"
    archive_path="$(download_asset "${version}")"
    install_extension "${archive_path}" "${install_dir}" "${version}"

    print_install_summary "${version}" "${install_dir}"

    echo ""
    ok "Done!"
    echo ""
}

main "$@"
