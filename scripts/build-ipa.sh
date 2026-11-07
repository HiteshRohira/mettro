#!/usr/bin/env bash
# Builds an UNSIGNED Mettro.ipa for sideloading with AltStore / SideStore / Sideloadly
# (those tools re-sign it with your own Apple ID).
# Usage: ./scripts/build-ipa.sh            -> build/Mettro.ipa
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d ios ] || npx expo prebuild -p ios
rm -rf build/Mettro.xcarchive build/Payload build/Mettro.ipa
xcodebuild -workspace ios/Mettro.xcworkspace -scheme Mettro -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -archivePath build/Mettro.xcarchive archive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" | tail -n 5
# The Live Activity layout must be embedded in the widget extension (free Apple IDs have no App Group).
REG=build/Mettro.xcarchive/Products/Applications/Mettro.app/PlugIns/ExpoWidgetsTarget.appex/ExpoWidgets.bundle/ExpoWidgetsLayoutRegistry.json
python3 -I -c "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if d.get('liveActivities',{}).get('TripActivity') else 1)" "$REG" \
  || { echo "error: TripActivity layout missing from $REG (is src/widgets/StatusWidget.tsx still importing ./TripActivity?)"; exit 1; }
mkdir -p build/Payload
cp -R build/Mettro.xcarchive/Products/Applications/Mettro.app build/Payload/
(cd build && zip -qry Mettro.ipa Payload)
echo "Built $(pwd)/build/Mettro.ipa"
