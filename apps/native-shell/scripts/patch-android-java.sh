#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$root_dir/../.." && pwd)"

patch_file() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    return 0
  fi

  sed -i.bak 's/JavaVersion.VERSION_21/JavaVersion.VERSION_17/g' "$file_path"
  rm -f "${file_path}.bak"
}

patch_file "$root_dir/android/app/capacitor.build.gradle"
patch_file "$root_dir/android/capacitor-cordova-android-plugins/build.gradle"
patch_file "$root_dir/node_modules/@capacitor/android/capacitor/build.gradle"
patch_file "$root_dir/node_modules/@capacitor/push-notifications/android/build.gradle"

shopt -s nullglob
for file_path in "$repo_root"/node_modules/.bun/@capacitor+android@*/node_modules/@capacitor/android/capacitor/build.gradle; do
  patch_file "$file_path"
done
for file_path in "$repo_root"/node_modules/.bun/@capacitor+push-notifications@*/node_modules/@capacitor/push-notifications/android/build.gradle; do
  patch_file "$file_path"
done
shopt -u nullglob
