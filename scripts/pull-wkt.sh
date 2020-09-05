#!/usr/bin/env bash

set -eu
set -o pipefail

CACHE_DIR="./tmp/protos-include-cache"
OUTPUT_DIR="./tmp/protos-include"

PROTOBUF_VERSION=3.13.0
GOOGLEAPIS_VERSION=a8c73212a73d460b1edcd0830c4c3e31de33bdc5

PROTOBUF_ZIP=https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOBUF_VERSION}/protobuf-js-${PROTOBUF_VERSION}.zip
GOOGLEAPIS_ZIP=https://github.com/googleapis/googleapis/archive/${GOOGLEAPIS_VERSION}.zip

fetch() {
  local url="$1"
  local name="$2"
  local src_dir="$3"
  local dst_dir="${4:-""}"

  local zip_path="$CACHE_DIR/$name.zip"
  local unzip_path="$CACHE_DIR/$name/$src_dir"

  if [ ! -f "$zip_path" ]; then
    curl -L "$url" -o "$zip_path"
  fi
  if [ ! -d "$unzip_path" ]; then
    unzip "$zip_path" "*.proto" -d "$CACHE_DIR"
  fi

  mkdir -p "$OUTPUT_DIR/$dst_dir"
  rsync -av "$unzip_path/" "$OUTPUT_DIR/$dst_dir/"
}

[ -d "$CACHE_DIR" ] || mkdir -p "$CACHE_DIR"
[ -d "$OUTPUT_DIR" ] && rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

fetch "$PROTOBUF_ZIP" "protobuf-$PROTOBUF_VERSION" "src/google/protobuf" "google/protobuf"
fetch "$GOOGLEAPIS_ZIP" "googleapis-$GOOGLEAPIS_VERSION" "google/api" "google/api"

find "$OUTPUT_DIR"
