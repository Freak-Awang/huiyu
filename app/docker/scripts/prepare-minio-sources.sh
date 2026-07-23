#!/bin/sh
set -eu

MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
MC_COMMIT=cf909e1063a9a0aea7926378b0c416ed0eea7742
MINIO_SHA256=45521908307306e925c98d629e1c17d78c8b72b6ee242b1bfb1409f7d8ee5841
MC_SHA256=aff96a5eb9694dfefe21c9bc090021b0ae33df68b960429b07abe3cd5adc89ea
CACHE_DIR=${MINIO_SOURCE_CACHE:-/opt/minio-source-cache}

command -v curl >/dev/null 2>&1 || {
  echo "curl is required to download MinIO sources" >&2
  exit 1
}

mkdir -p "$CACHE_DIR"
chmod 755 "$CACHE_DIR"

download() {
  url=$1
  output=$2
  expected_sha=$3

  if [ -f "$output" ] && echo "$expected_sha  $output" | sha256sum -c - >/dev/null 2>&1; then
    return
  fi

  curl -fL \
    --retry 20 \
    --retry-all-errors \
    --retry-delay 5 \
    --connect-timeout 30 \
    -C - \
    -o "$output" \
    "$url"

  echo "$expected_sha  $output" | sha256sum -c -
  chmod 644 "$output"
}

download \
  "https://codeload.github.com/minio/minio/tar.gz/$MINIO_COMMIT" \
  "$CACHE_DIR/minio.tar.gz" \
  "$MINIO_SHA256"

download \
  "https://codeload.github.com/minio/mc/tar.gz/$MC_COMMIT" \
  "$CACHE_DIR/mc.tar.gz" \
  "$MC_SHA256"

echo "Pinned MinIO sources are ready in $CACHE_DIR"
