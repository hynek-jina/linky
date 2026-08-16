#!/usr/bin/env bash
# Vercel Ignored Build Step for the web app. Exit 0 skips the build, exit 1
# proceeds (Vercel's convention). See docs/architecture.md: browsers only get
# a new build when the root package.json version was bumped — a rebuild
# without a bump rewrites the SW precache manifest and re-prompts users who
# are already on the latest version.
set -u

cd "$(git rev-parse --show-toplevel)"

read_version() {
  node -e '
    const fs = require("fs");
    try {
      const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (typeof pkg.version === "string") process.stdout.write(pkg.version);
    } catch {}
  ' "$1"
}

current="$(read_version package.json)"
prev_sha="${VERCEL_GIT_PREVIOUS_SHA:-}"

# First deployment, or version unreadable: fail open and build.
if [ -z "$prev_sha" ] || [ -z "$current" ]; then
  echo "no previous deployment or unreadable version — building"
  exit 1
fi

# Vercel clones shallowly; the previous deployment's commit may be missing.
if ! git cat-file -e "$prev_sha^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=1 origin "$prev_sha" 2>/dev/null || true
fi
if ! git cat-file -e "$prev_sha^{commit}" 2>/dev/null; then
  echo "previous deployment commit unavailable — building"
  exit 1
fi

tmp="$(mktemp)"
git show "$prev_sha:package.json" >"$tmp" 2>/dev/null || true
previous="$(read_version "$tmp")"
rm -f "$tmp"

if [ -z "$previous" ]; then
  echo "previous version unreadable — building"
  exit 1
fi

if [ "$current" = "$previous" ]; then
  echo "version unchanged ($current) — skipping browser deploy"
  exit 0
fi

echo "version bump $previous -> $current — building"
exit 1
