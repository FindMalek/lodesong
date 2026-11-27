#!/usr/bin/env bash
# Publishes a main build to the ios-beta branch, one parentless commit replaced each time (docs/ios.md):
# APP_VERSION=… APP_BUILD=… beta.sh <ipa>
set -euo pipefail

IPA=${1:?ipa path}
: "${APP_VERSION:?}" "${APP_BUILD:?}"
REPO=${GITHUB_REPOSITORY:-FindMalek/lodesong}
BRANCH=ios-beta
NAME=lodesong-ios-$APP_BUILD.ipa
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

OLD=$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)
PREVIOUS=
if [ -n "$OLD" ]; then
  git fetch --quiet --depth 1 origin "$OLD"
  PUBLISHED=$(git cat-file -p "$OLD:altstore.json" | jq -er '.apps[0].versions[0].buildVersion')
  # A re-run of an older build must not replace a newer one.
  if [ "$PUBLISHED" -gt "$APP_BUILD" ]; then
    echo "build $PUBLISHED is already published, keeping it"
    exit 0
  fi
  PREVIOUS=lodesong-ios-$PUBLISHED.ipa
fi

git log -1 --format='%h %s' >"$WORK/notes.md"
DOWNLOAD_URL=https://raw.githubusercontent.com/$REPO/$BRANCH/$NAME \
  "$HERE/source.sh" "$IPA" "$BRANCH" "$WORK/notes.md" >"$WORK/altstore.json"
# Vercel reads this from the pushed commit: without it every publish is a failed preview deployment.
echo '{ "git": { "deploymentEnabled": false } }' >"$WORK/vercel.json"

# A throwaway index, so the checkout is left alone.
export GIT_INDEX_FILE="$WORK/index"
add() { git update-index --add --cacheinfo "100644,$1,$2"; }
add "$(git hash-object -w "$IPA")" "$NAME"
add "$(git hash-object -w "$WORK/altstore.json")" altstore.json
for path in vercel.json apps/web/vercel.json; do
  add "$(git hash-object -w "$WORK/vercel.json")" "$path"
done
# The last IPA stays: the raw CDN can serve the previous altstore.json for a few minutes.
if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$NAME" ]; then
  add "$(git rev-parse "$OLD:$PREVIOUS")" "$PREVIOUS"
fi
COMMIT=$(git commit-tree "$(git write-tree)" -m "ios beta $APP_VERSION")

# Fails instead of overwriting if the branch moved since it was read.
git push --force-with-lease="refs/heads/$BRANCH:$OLD" origin "$COMMIT:refs/heads/$BRANCH"
