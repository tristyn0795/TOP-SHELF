# Publishing TOP SHELF on Google Play

TOP SHELF ships to Play as a **Trusted Web Activity (TWA)**: a small Android app, built with Google's Bubblewrap, that opens `https://top-shelf-production-b470.up.railway.app` full screen with no browser bar. Game updates you push to GitHub reach the Play app as soon as Railway deploys them. You only need a new Play release to change the app's name, icon, package or web address.

| | |
|---|---|
| Package name | `com.topshelfhockey.app` (permanent once published) |
| Web address | `top-shelf-production-b470.up.railway.app` (set in `android/twa-manifest.json`) |
| Build | GitHub Actions › **Android app (Google Play)** (`.github/workflows/android.yml`) |
| Listing text and graphics | `store/listing.md`, `store/graphics/` |
| Policy answers | `store/data-safety.md` |
| Privacy policy | `https://top-shelf-production-b470.up.railway.app/privacy` |

## 1. Google Play developer account (one time)

1. Sign up at <https://play.google.com/console/signup> (one-time $25 fee, identity verification).
2. **Personal accounts must run a closed test first:** at least **12 testers** opted in for **14 days in a row** before you can apply for production. Organisation accounts (which need a D-U-N-S number) skip this.

## 2. Create your upload key (one time, on your computer)

You need Java's `keytool` (it comes with any JDK, for example Android Studio's).

```bash
keytool -genkeypair -v -keystore android.keystore -alias topshelf -keyalg RSA -keysize 2048 -validity 10000
```

- Choose a strong password. When it asks for a key password, use the same one or a second one.
- **Back up `android.keystore` and the passwords somewhere safe**, such as a password manager. Never commit the keystore to GitHub (`.gitignore` already blocks `*.keystore`).
- With Play App Signing, Google holds the real app signing key, and this is only your *upload* key. If you lose it, Play support can reset it, but that takes days.

Turn the keystore into text for GitHub. On macOS:

```bash
base64 -i android.keystore | pbcopy
```

On Linux:

```bash
base64 -w0 android.keystore
```

## 3. Add the GitHub secrets (one time)

In your GitHub repo, go to **Settings › Secrets and variables › Actions › New repository secret** and add:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the base64 text from step 2 |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_PASSWORD` | the key password (the same as above if you reused it) |

## 4. Build the app

1. On GitHub, open **Actions › Android app (Google Play) › Run workflow**.
2. Enter the **version name** (for example `1.7.0`, shown to players). Leave the build number empty to use the run number. It must go up with every upload.
3. When the run finishes, download the **top-shelf-android-…** artifact. It contains:
   - `app-release-bundle.aab`: upload this to Play.
   - `app-release-signed.apk`: install this directly on your phone to try it (`adb install app-release-signed.apk`).
4. The run summary shows your **upload key SHA-256**. You need it in step 6.

## 5. Create the app in Play Console

1. **Create app:** name `TOP SHELF: Retro Hockey`, default language English, **Game**, **Free**, then accept the declarations.
2. **Policy › App content:** fill in each section using `store/data-safety.md`. That covers privacy policy, ads, app access, content rating, target audience, data safety, and the government, financial, health and news declarations.
3. **Grow users › Store presence › Main store listing:** paste the text from `store/listing.md` and upload the files from `store/graphics/`.
4. **Store settings:** category **Sports**, plus your contact email.

## 6. Connect the app to the website (Digital Asset Links)

This is what removes the browser bar. If the app ever opens with a URL bar at the top, this step is wrong.

1. Upload the `.aab` to a testing track (step 7). Play Console then shows the keys under **Test and release › App integrity › App signing**.
2. Copy both SHA-256 fingerprints:
   - **App signing key certificate**: the key Google signs the Play version with.
   - **Upload key certificate**: your key, which also signs the test APK from GitHub.
3. In Railway, open your TOP SHELF service, then **Variables**, and add:
   - `ANDROID_SHA256` = both fingerprints separated by a comma, for example `AB:CD:…:EF,12:34:…:56`.
   - `CONTACT_EMAIL` = the email shown on the privacy policy.
4. Railway redeploys. Check that <https://top-shelf-production-b470.up.railway.app/.well-known/assetlinks.json> lists `com.topshelfhockey.app` and both fingerprints.
5. Optionally, check it with Google's tool: <https://developers.google.com/digital-asset-links/tools/generator> (site `top-shelf-production-b470.up.railway.app`, package `com.topshelfhockey.app`, plus a fingerprint).

## 7. Test, then release

1. **Internal testing:** create a release, upload the `.aab`, add yourself as a tester and install from the Play link. Check:
   - no browser bar
   - a Bluetooth controller works
   - the touch controls work
   - offline play works (flight mode, then single player)
   - the Options screen has no COMMENTARY STUDIO button
2. **Closed testing:** promote the same release and invite your 12+ testers for 14 days, as required for personal accounts.
3. **Production:** apply for production access from the Dashboard, then roll out.

## Updating later

- **Game changes:** push to GitHub and Railway deploys them. The Play app picks them up on next launch, with no new upload.
- **App changes** (icon, name, Android version bump, Bubblewrap/Android updates Google asks for): re-run the workflow with a higher version and upload the new `.aab`.
- **Target API level:** Google requires a recent Android target each year. Re-running the workflow rebuilds with the latest Bubblewrap, which keeps the target current.
- **Moving to a custom domain later:**
  1. Change `host`, `iconUrl`, `maskableIconUrl`, `webManifestUrl` and `fullScopeUrl` in `android/twa-manifest.json`.
  2. Set `ANDROID_SHA256` on the new deployment.
  3. Rebuild and upload. The package name stays the same.

## What's already in the game for Play

- **Web app manifest** (`public/manifest.webmanifest`): full screen, any orientation, icons including a maskable icon, screenshots and shortcuts.
- **Service worker** (`/sw.js`, generated by `server.js` from `server/sw.js`): caches the whole game, so single player works offline. ONLINE says when there's no connection.
- **Self-hosted font** (`public/fonts`, SIL Open Font License), so there are no third-party requests.
- **Asset links route** `/.well-known/assetlinks.json` (env `ANDROID_PACKAGE`, `ANDROID_SHA256`), and the **privacy policy** at `/privacy` (env `CONTACT_EMAIL`).
- **Play-app behaviour:** the app opens `/?src=twa` and the game remembers it. In the Play app, the microphone studio and the FULL SCREEN buttons are hidden.
