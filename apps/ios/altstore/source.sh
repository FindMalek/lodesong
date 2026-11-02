#!/usr/bin/env bash
# Writes the AltStore / SideStore source for one release: source.sh <ipa> <tag> [notes-file] > altstore.json
set -euo pipefail

IPA=${1:?ipa path}
TAG=${2:?release tag}
NOTES_FILE=${3:-}
REPO=${GITHUB_REPOSITORY:-FindMalek/lodesong}
RAW=https://raw.githubusercontent.com/$REPO/main/apps/ios/altstore

VERSION=${TAG#v}
SIZE=$(wc -c <"$IPA" | tr -d ' ')
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOTES="lodesong $VERSION"
if [ -n "$NOTES_FILE" ] && [ -s "$NOTES_FILE" ]; then NOTES=$(cat "$NOTES_FILE"); fi

jq -n \
  --arg repo "$REPO" --arg raw "$RAW" --arg version "$VERSION" --arg tag "$TAG" \
  --arg date "$DATE" --argjson size "$SIZE" --arg notes "$NOTES" '
{
  name: "lodesong",
  identifier: "engineer.findmalek.lodesong.source",
  subtitle: "your own music player",
  description: "lodesong on your iPhone: the web player in its own app, with background audio.",
  iconURL: ($raw + "/icon.png"),
  website: ("https://" + "github.com/" + $repo),
  tintColor: "111111",
  apps: [{
    name: "lodesong",
    bundleIdentifier: "engineer.findmalek.lodesong.ios",
    developerName: "FindMalek",
    subtitle: "your own music player",
    localizedDescription: "The lodesong player in its own app. Point it at your server once; music keeps playing with the screen locked or the silent switch on.",
    iconURL: ($raw + "/icon.png"),
    tintColor: "111111",
    category: "entertainment",
    versions: [{
      version: $version,
      buildVersion: "1",
      date: $date,
      size: $size,
      downloadURL: ("https://" + "github.com/" + $repo + "/releases/download/" + $tag + "/lodesong-ios.ipa"),
      localizedDescription: $notes,
      minOSVersion: "16.0"
    }],
    appPermissions: { entitlements: [], privacy: { NSLocalNetworkUsageDescription: "lodesong talks to your server on your home network." } }
  }],
  news: []
}'
