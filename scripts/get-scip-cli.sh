#!/usr/bin/env bash

set -eo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

SCIP_CLI_ASSET_PATH="$ROOT/.cache/scip.tar.gz"
SCIP_CLI_BIN_PATH="$ROOT/bin/scip"

[ -d "$ROOT/.cache" ] || mkdir -p "$ROOT/.cache"

ASSET="$(curl -sSL https://api.github.com/repos/sourcegraph/scip/releases/latest | jq -er '.assets | map(select(.name == "scip-linux-amd64.tar.gz"))[0].browser_download_url')"

if [[ $? != 0 ]] || [[ -z $ASSET ]]; then
    echo >&2 'Error: failed to find latest SCIP release asset'
    exit 1
fi

if ! curl -sSLo "$SCIP_CLI_ASSET_PATH" "$ASSET"; then
    echo >&2 'Error: failed to download latest SCIP release asset'
    exit 1
fi

[ -d "$SCIP_CLI_BIN_PATH" ] || mkdir -p "$SCIP_CLI_BIN_PATH"

tar -C "$SCIP_CLI_BIN_PATH" -xzf "$SCIP_CLI_ASSET_PATH"

ls -l1 --color=auto "$SCIP_CLI_BIN_PATH"/*
