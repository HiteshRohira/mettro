# Installing Mettro on your iPhone (sideloading)

Mettro isn't on the App Store. You can install it yourself in one of three ways. All of them are free except Option C.

| | What you need | How long the app keeps working |
|---|---|---|
| **A. Xcode, free Apple ID** | A Mac with Xcode and a USB cable | 7 days, then reinstall (one click) |
| **B. AltStore / SideStore / Sideloadly** | The `Mettro.ipa` file and the sideload tool | 7 days. AltStore and SideStore can refresh automatically over Wi‑Fi |
| **C. Paid Apple Developer account** ($99/yr) | A Mac with Xcode | 1 year |

Requirements: an iPhone on **iOS 16.4 or later**. The Dynamic Island needs an iPhone 14 Pro or newer; other iPhones show the Live Activity on the Lock Screen.

---

## Before you start (every option)

1. **Turn on Developer Mode** (iOS 16+): *Settings → Privacy & Security → Developer Mode → On*. The iPhone restarts; confirm when asked.
   The option only appears after the phone has been connected to Xcode once, or after you try to open a sideloaded app.
2. Keep your iPhone **unlocked** while installing.

---

## Option A — Build with Xcode (recommended if you have a Mac)

```bash
git clone <this repo> mettro && cd mettro
npm install

# Use your own reverse-DNS bundle ID. It must be unique to your Apple ID.
METTRO_BUNDLE_ID=com.<yourname>.mettro npx expo prebuild -p ios --clean

# Free Apple ID (Personal Team) only: free accounts can't provision App Groups.
# The Live Activity still works; only the home-screen widget stops updating.
./scripts/strip-app-groups.sh

open ios/Mettro.xcworkspace
```

In Xcode:

1. Click **Mettro** in the left sidebar, then *Signing & Capabilities*.
2. Select the **Mettro** target. Tick *Automatically manage signing*. For **Team**, choose *Add an Account…*, sign in with your Apple ID, then pick *“Your Name (Personal Team)”*.
3. Select the **ExpoWidgetsTarget** target (it powers the Live Activity and the home‑screen widget) and set the **same Team**.
4. Plug in your iPhone and choose it in the device picker at the top.
5. Change the scheme's build configuration to **Release**: *Product → Scheme → Edit Scheme… → Run → Build Configuration → Release*. This bundles the app so it runs without a computer.
6. Press **▶ Run**.
7. On first launch, iOS says the developer is untrusted. Go to *Settings → General → VPN & Device Management*, tap your Apple ID, then tap **Trust**.

**Every 7 days** (free accounts only), connect the phone and press ▶ Run again. Your data, saved stations and settings are kept.

---

## Option B — Install the IPA with AltStore, SideStore or Sideloadly

No Xcode needed on the computer that installs it.

1. Get `Mettro.ipa`. Either download it from the releases page, or build it on a Mac with:
   ```bash
   npm install && ./scripts/build-ipa.sh     # → build/Mettro.ipa (unsigned)
   ```
2. Install one sideloading tool:
   - **AltStore** — https://altstore.io (needs AltServer on a Mac/PC; refreshes over Wi‑Fi)
   - **SideStore** — https://sidestore.io (refreshes on‑device, no computer after setup)
   - **Sideloadly** — https://sideloadly.io (simple drag‑and‑drop; manual refresh)
3. Connect the iPhone **by USB cable**. Sideloadly and AltServer only list phones they see over USB, or over Wi‑Fi after you enable *Finder → your iPhone → “Show this iPhone when on Wi‑Fi”*. A phone that Xcode sees over the network won't show up.
4. Open the tool, sign in with your Apple ID and drag in `Mettro.ipa`. The tool re‑signs the app for you, including the Live Activity extension.
5. Trust the profile: *Settings → General → VPN & Device Management → your Apple ID → Trust*.

Free Apple IDs can have **3 sideloaded apps** active at once and register **10 app IDs per week**. Mettro uses 2 (the app and its widget extension).

---

## Option C — Paid Apple Developer account

Same as Option A, but pick your paid team in step 2. The app then works for a year. You can also distribute it to up to 100 testers via TestFlight. To do that, run `npx eas-cli build -p ios` and submit it.

---

## First launch checklist

- **Location → “While Using”** shows your nearest stations. When you start a trip, choose **“Change to Always Allow”** so the Live Activity keeps updating with the screen locked.
- **Live Activities**: when you start your first trip, iOS asks *“Allow Live Activities from Mettro?”*. Tap **Allow**.
- Mettro never sends notifications. Line status refreshes quietly in the background.
- Optional: long‑press the home screen → **+** → *Mettro* to add the **Metro Status** widget.

## Troubleshooting

| Problem | Fix |
|---|---|
| *“Untrusted Developer”* | Settings → General → VPN & Device Management → Trust |
| *“Unable to install … App ID is not available”* | Your bundle ID is taken. Pick another `METTRO_BUNDLE_ID` and run prebuild again |
| Xcode: *“Signing for ExpoWidgetsTarget requires a development team”* | Set the Team on the **ExpoWidgetsTarget** target too (step 3) |
| Xcode: *“Provisioning profile … doesn't match … application-groups”* | You're on a free account. Run `./scripts/strip-app-groups.sh` after prebuild. The Live Activity still works (its layout is embedded at build time); the home‑screen widget won't receive live updates |
| Sideloadly lists only your Mac | Connect the iPhone by USB, or enable Wi‑Fi sync in Finder |
| App closes immediately after 7 days | The free signature expired. Reinstall (Option A) or refresh in AltStore/SideStore |
| Live Activity doesn't appear | Settings → Mettro → Live Activities → On. Also check *More → Live Activities* in the app |
| Routes say “offline route” | DMRC's server was unreachable. Mettro falls back to its built-in timetable and estimated fares |
