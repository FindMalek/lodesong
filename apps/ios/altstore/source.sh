#!/usr/bin/env bash
# Writes the AltStore / SideStore source for one release: source.sh <ipa> <tag> [notes-file] > altstore.json
# APP_VERSION, APP_BUILD and DOWNLOAD_URL override what a v* tag implies (beta.sh). They must match the app in the IPA.
set -euo pipefail

IPA=${1:?ipa path}
TAG=${2:?release tag}
NOTES_FILE=${3:-}
REPO=${GITHUB_REPOSITORY:-FindMalek/lodesong}
RAW=https://raw.githubusercontent.com/$REPO/main/apps/ios/altstore

VERSION=${APP_VERSION:-${TAG#v}}
BUILD=${APP_BUILD:-1}
DOWNLOAD_URL=${DOWNLOAD_URL:-https://github.com/$REPO/releases/download/$TAG/lodesong-ios.ipa}
NAME=lodesong
ID=engineer.findmalek.lodesong.source
if [ "$TAG" = ios-beta ]; then
  NAME="lodesong beta"
  ID=$ID.beta
fi
SIZE=$(wc -c <"$IPA" | tr -d ' ')
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOTES="lodesong $VERSION"
if [ -n "$NOTES_FILE" ] && [ -s "$NOTES_FILE" ]; then NOTES=$(cat "$NOTES_FILE"); fi

jq -n \
  --arg repo "$REPO" --arg raw "$RAW" --arg version "$VERSION" \
  --arg date "$DATE" --argjson size "$SIZE" --arg notes "$NOTES" \
  --arg build "$BUILD" --arg url "$DOWNLOAD_URL" --arg name "$NAME" --arg id "$ID" '
{
  name: $name,
  identifier: $id,
  subtitle: "your own music player",
  description: "lodesong on your iPhone: a native app with background audio and downloads.",
  iconURL: ($raw + "/icon.png"),
  website: ("https://" + "github.com/" + $repo),
  tintColor: "111111",
  apps: [{
    name: "lodesong",
    bundleIdentifier: "engineer.findmalek.lodesong.ios",
    developerName: "FindMalek",
    subtitle: "your own music player",
    localizedDescription: "A native iPhone app for your lodesong server. Your library on the phone, playlists kept downloaded, music keeps playing with the screen locked.",
    iconURL: ($raw + "/icon.png"),
    tintColor: "111111",
    category: "entertainment",
    versions: [{
      version: $version,
      buildVersion: $build,
      date: $date,
      size: $size,
      downloadURL: $url,
      localizedDescription: $notes,
      minOSVersion: "26.0"
    }],
    appPermissions: { entitlements: [], privacy: { NSLocalNetworkUsageDescription: "lodesong talks to your server on your home network." } }
  }],
  news: []
}'
