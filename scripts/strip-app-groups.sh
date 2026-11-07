#!/usr/bin/env bash
# For FREE Apple IDs (Personal Team), which can't provision App Groups.
# Removes the App Group entitlement from the app and widget extension after prebuild.
# The Live Activity still works (its layout is embedded at build time); only the
# home-screen widget stops receiving live updates.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in ios/Mettro/Mettro.entitlements ios/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements; do
  [ -f "$f" ] || continue
  /usr/libexec/PlistBuddy -c "Delete :com.apple.security.application-groups" "$f" 2>/dev/null || true
  echo "stripped App Groups from $f"
done
