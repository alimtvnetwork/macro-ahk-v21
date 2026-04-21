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
# Marco Extension — PINNED-VERSION installer (Linux / macOS)
#
# This installer is bound to a SPECIFIC release version, stamped at
# release-build time. It NEVER queries `latest`. It is shipped only as
# a GitHub release asset.
#
# If you want the latest channel, use install.sh instead.
#
# Spec: spec/18-release-installer/
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="alimtvnetwork/macro-ahk-v21"

# ──────────────────────────────────────────────────────────────────────
# STAMPED CONSTANT — replaced by release.yml at asset-packaging time.
# Committed source contains the sentinel "__PINNED_VERSION__".
# A real release asset contains e.g. "v2.158.0".
# ──────────────────────────────────────────────────────────────────────
PINNED_VERSION='__PINNED_VERSION__'

VERSION_REGEX='^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$'
TMP_DIR=""

cleanup() {
    if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
        rm -rf "${TMP_DIR}"
    fi
}
trap cleanup EXIT

# ── Logging ─────────────────────────────────────────────────────────

step() { printf ' \033[36m%s\033[0m\n' "$*" >&2; }
ok()   { printf ' \033[32m%s\033[0m\n' "$*" >&2; }
err()  { printf ' \033[31m%s\033[0m\n' "$*" >&2; }

# ── OS detection ────────────────────────────────────────────────────

detect_os() {
    local uname_out
    uname_out="$(uname -s)"
    case "${uname_out}" in
        Linux*|Darwin*) ;;
        MINGW*|MSYS*|CYGWIN*)
            err "Windows detected. Use the PowerShell installer instead:"
            err "  irm https://github.com/${REPO}/releases/download/<VER>/release-version.ps1 | iex"
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

resolve_version() {
    local override="$1"

    # 1. Explicit override
    if [ -n "${override}" ]; then
        if [ "${override}" = "latest" ]; then
            err "'--version latest' is not allowed in release-version installer."
            err "Use scripts/install.sh if you want the latest channel."
            exit 3
        fi
        if ! is_valid_version "${override}"; then
            err "Invalid --version '${override}'. Must match v<major>.<minor>.<patch>[-prerelease]."
            exit 3
        fi
        echo "${override}"
        return
    fi

    # 2. Stamped constant
    if [ "${PINNED_VERSION}" != "__PINNED_VERSION__" ] && is_valid_version "${PINNED_VERSION}"; then
        echo "${PINNED_VERSION}"
        return
    fi

    # 3. URL fallback
    local from_url
    if from_url="$(version_from_url)" && is_valid_version "${from_url}"; then
        echo "${from_url}"
        return
    fi

    # 4. Hard error — no implicit "latest"
    err "release-version installer cannot determine its target version."
    err "This script is meant to be downloaded from a specific GitHub release page:"
    err "  https://github.com/${REPO}/releases"
    err ""
    err "If you want the latest version, use scripts/install.sh instead."
    exit 2
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

    step "Downloading ${asset_name} (${version})..."
    if ! download "${asset_url}" "${archive_path}"; then
        err "Download failed."
        err "URL: ${asset_url}"
        err ""
        err "Release ${version} may have been retracted or the asset is missing."
        err "The pinned installer will NOT roll forward to a newer version."
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
Usage: release-version.sh [--version <ver>] [--dir <path>] [--repo <owner/repo>]

Pinned-version installer for Marco Chrome Extension.
This installer is bound to a SPECIFIC release. It NEVER queries 'latest'.

Options:
  --version <ver>  Override the stamped version with a different specific version
                   (e.g. v2.150.0). The literal "latest" is rejected.
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
    echo ""
    step "Install summary"
    printf '  Version:     %s (pinned)\n' "${version}" >&2
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
    printf '  \033[33mPinned install — will NOT auto-update on re-run.\033[0m\n'
    printf '  \033[90mFor latest-channel installs, use install.sh instead.\033[0m\n'
}

# ── Main ────────────────────────────────────────────────────────────

main() {
    echo ""
    echo " Marco Extension installer (pinned)"
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
