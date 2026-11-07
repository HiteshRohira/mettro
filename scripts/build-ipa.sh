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
mkdir -p build/Payload
cp -R build/Mettro.xcarchive/Products/Applications/Mettro.app build/Payload/
(cd build && zip -qry Mettro.ipa Payload)
echo "Built $(pwd)/build/Mettro.ipa"
