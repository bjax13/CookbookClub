#!/bin/sh
set -eu

prefix_path=""
append_prefix_if_dir() {
  if [ -d "$1" ]; then
    if [ -n "$prefix_path" ]; then
      prefix_path="$prefix_path:$1"
    else
      prefix_path="$1"
    fi
  fi
}

# Keep common system paths and Homebrew prefixes available in constrained shells.
append_prefix_if_dir "/opt/homebrew/bin"
append_prefix_if_dir "/usr/local/bin"
append_prefix_if_dir "/bin"
append_prefix_if_dir "/usr/bin"

if [ -n "$prefix_path" ]; then
  PATH="$prefix_path:$PATH"
fi

export PATH
exec "$@"
