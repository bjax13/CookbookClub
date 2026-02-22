#!/bin/sh
set -eu

suffix_path=""
append_suffix_if_dir() {
  if [ -d "$1" ]; then
    if [ -n "$suffix_path" ]; then
      suffix_path="$suffix_path:$1"
    else
      suffix_path="$1"
    fi
  fi
}

# Keep common Node/Git locations available as fallbacks without overriding
# the caller's PATH order (important in CI where setup-node injects toolchain paths).
append_suffix_if_dir "/opt/homebrew/bin"
append_suffix_if_dir "/usr/local/bin"
append_suffix_if_dir "/bin"
append_suffix_if_dir "/usr/bin"

if [ -n "$suffix_path" ]; then
  PATH="$PATH:$suffix_path"
fi

export PATH
exec "$@"
