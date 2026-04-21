#!/usr/bin/env bash
# Re-exec under bash if invoked via sh/dash (which lack pipefail, local, etc.)
if [ -z "${BASH_VERSION:-}" ]; then
    if command -v bash >/dev/null 2>&1; then
        case "${0##*/}" in
            sh|dash|ash|ksh|mksh)
                exec bash -s -- "$@"
                ;;
        esac
        exec bash "$0" "$@"
    else
        printf '\033[31m Error: bash is required but not found. Install bash first.\033[0m\n' >&2
        exit 1
    fi
fi
# ─────────────────────────────────────────────────────────────────────
# Marco Extension installer for Linux and macOS
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/alimtvnetwork/macro-ahk-v21/main/scripts/install.sh | bash
#
# Options:
#   --version <ver>  Install a specific version (e.g. v2.116.1). Default: latest.
#   --dir <path>     Target directory. Default: $HOME/marco-extension
#   --repo <o/r>     GitHub owner/repo override.
#
# Examples:
#   curl -fsSL .../install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --version v2.116.1
#   ./install.sh --dir ~/my-extension
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="alimtvnetwork/macro-ahk-v21"
TMP_DIR=""

cleanup() {
    if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
        rm -rf "${TMP_DIR}"
    fi
}
trap cleanup EXIT

# ── Logging helpers ─────────────────────────────────────────────────

step()  { printf ' \033[36m%s\033[0m\n' "$*" >&2; }
ok()    { printf ' \033[32m%s\033[0m\n' "$*" >&2; }
err()   { printf ' \033[31m%s\033[0m\n' "$*" >&2; }

# ── Detect OS ───────────────────────────────────────────────────────

detect_os() {
    local uname_out
    uname_out="$(uname -s)"
    case "${uname_out}" in
        Linux*)  echo "linux" ;;
        Darwin*) echo "darwin" ;;
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

# ── Resolve version (latest or pinned) ─────────────────────────────

resolve_version() {
    local version="$1"
    if [ -n "${version}" ]; then
        echo "${version}"
        return
    fi

    step "Fetching latest release..."
    local url="https://api.github.com/repos/${REPO}/releases/latest"
    local tag

    if command -v curl >/dev/null 2>&1; then
        tag="$(curl -fsSL "${url}" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
    elif command -v wget >/dev/null 2>&1; then
        tag="$(wget -qO- "${url}" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
    else
        err "Neither curl nor wget found. Cannot fetch latest release."
        exit 1
    fi

    if [ -z "${tag}" ]; then
        err "Failed to determine latest version."
        exit 1
    fi

    echo "${tag}"
}

# ── Download helper ────────────────────────────────────────────────

download() {
    local url="$1" dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL -o "${dest}" "${url}"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "${dest}" "${url}"
    else
        err "Neither curl nor wget found."
        exit 1
    fi
}

# ── Download asset ──────────────────────────────────────────────────

download_asset() {
    local version="$1"
    local asset_name="marco-extension-${version}.zip"
    local base_url="https://github.com/${REPO}/releases/download/${version}"
    local asset_url="${base_url}/${asset_name}"

    local archive_path="${TMP_DIR}/${asset_name}"

    step "Downloading ${asset_name} (${version})..."
    if ! download "${asset_url}" "${archive_path}"; then
        err "Download failed."
        err "URL: ${asset_url}"
        exit 1
    fi

    ok "Downloaded successfully."
    echo "${archive_path}"
}

# ── Extract and install ────────────────────────────────────────────

install_extension() {
    local archive_path="$1" install_dir="$2" version="$3"

    step "Installing to ${install_dir}..."

    # Clean previous install
    if [ -d "${install_dir}" ]; then
        rm -rf "${install_dir}"
    fi

    mkdir -p "${install_dir}"

    # Extract
    if command -v unzip >/dev/null 2>&1; then
        unzip -qo "${archive_path}" -d "${install_dir}"
    else
        err "unzip not found. Cannot extract archive."
        err "Install unzip: sudo apt install unzip (Debian/Ubuntu) or brew install unzip (macOS)"
        exit 1
    fi

    # Verify extraction
    local file_count
    file_count="$(find "${install_dir}" -type f | wc -l | tr -d ' ')"
    if [ "${file_count}" -eq 0 ]; then
        err "Extraction produced no files in ${install_dir}"
        exit 1
    fi

    # Write version marker
    echo "${version}" > "${install_dir}/VERSION"

    ok "Installed ${file_count} files to ${install_dir}"
}

# ── Resolve install directory ──────────────────────────────────────

resolve_install_dir() {
    local dir="$1"
    if [ -n "${dir}" ]; then
        echo "${dir}"
        return
    fi
    echo "${HOME}/marco-extension"
}

# ── Parse arguments ────────────────────────────────────────────────

parse_args() {
    VERSION=""
    INSTALL_DIR=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --version|-v)
                VERSION="$2"
                shift 2
                ;;
            --dir|-d)
                INSTALL_DIR="$2"
                shift 2
                ;;
            --repo|-r)
                REPO="$2"
                shift 2
                ;;
            --help|-h)
                echo "Usage: install.sh [--version <ver>] [--dir <path>] [--repo <owner/repo>]"
                echo ""
                echo "Options:"
                echo "  --version <ver>  Install a specific version (e.g. v2.116.1)"
                echo "  --dir <path>     Target directory (default: ~/marco-extension)"
                echo "  --repo <o/r>     GitHub owner/repo override"
                exit 0
                ;;
            *)
                err "Unknown option: $1"
                err "Run with --help for usage."
                exit 1
                ;;
        esac
    done
}

# ── Print install summary ──────────────────────────────────────────

print_install_summary() {
    local version="$1" install_dir="$2"

    echo ""
    step "Install summary"
    printf '  Version:     %s\n' "${version}" >&2
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
    echo "  To update later, re-run this script — it replaces the folder."
    echo ""
    printf '  \033[90mExample with custom directory:\033[0m\n'
    printf '    ./install.sh --dir ~/marco-extension\n'
}

# ── Main ───────────────────────────────────────────────────────────

main() {
    echo ""
    echo " Marco Extension installer"
    printf ' \033[90mgithub.com/%s\033[0m\n' "${REPO}"
    echo ""

    parse_args "$@"

    detect_os

    local version install_dir archive_path

    version="$(resolve_version "${VERSION}")"
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
