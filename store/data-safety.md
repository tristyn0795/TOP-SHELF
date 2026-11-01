# Data safety, content rating and other app content answers

These are the answers for Play Console › **Policy › App content**. They match what the game actually does and what `/privacy` says. If the game changes (for example, adding accounts, analytics or ads), update these and the privacy policy together.

## What TOP SHELF does with data

- **Saves and settings:** stored only on the device (localStorage / IndexedDB). Never sent anywhere.
- **Online play:** stick and button inputs and a random 4-letter room code pass through the game server to keep both players in sync. They aren't linked to a person, aren't stored, and the room is deleted when the game ends.
- **Hosting logs:** Railway may keep standard request logs (IP address, time, path) for operations and security.
- **Microphone:** never requested in the Android app. The recording studio is hidden there.
- **No:** accounts, ads, analytics, crash reporting SDKs, tracking, location, contacts, payments.

## Data safety form

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | (Not asked when the answer above is No. If it is: **Yes**, everything uses HTTPS / secure WebSockets.) |
| Do you provide a way for users to request that their data is deleted? | (Not asked when the answer above is No. Saves are on the device: uninstall or clear app data.) |

**Why "No":** Google's definition of collection covers data sent off the device *and stored or used* by the developer. Online inputs are processed ephemerally to run the match and are never stored or linked to anyone, and hosting logs are standard operational records. If you'd rather be extra cautious, answer **Yes**, choose **App activity › Other actions**, and mark it **Processed ephemerally**, **Not shared**, **Required for app functionality**. Either way, keep it consistent with `/privacy`.

## Content rating (IARC questionnaire)

- **Category:** Game.
- **Violence:** body checks are part of the sport, with no blood, injury detail or fighting. Answer **No** to the realistic and fantasy violence questions; mention "sports contact (hockey body checks)" where a free-text box allows it.
- **Fear, sexuality, language, controlled substances, crude humour:** **No**.
- **Gambling or simulated gambling:** **No**.
- **Users interact with each other:** **Yes**: online matches with friends by room code. There's **no chat, no voice and no user-generated content**.
- **Shares the user's location:** **No**.
- **Digital purchases:** **No**.
- **Expected rating:** Everyone / PEGI 3 / ESRB E.

## Target audience and content

- **Target age groups:** pick **13–15, 16–17 and 18+**. The game is fine for younger players, but selecting under-13 age groups enrols the app in Google's Families policy, which adds extra requirements.
- **Could it unintentionally appeal to children?** Answer honestly. Retro sports with no mascots or cartoon branding aimed at kids usually counts as **No**.

## Other declarations

| Section | Answer |
|---|---|
| Ads | **No**, the app has no ads |
| App access | **All functionality is available without special access** (no login) |
| Government app | No |
| Financial features | None |
| Health | None |
| News app | No |
| Data deletion | Not applicable (no account, nothing stored server-side) |
| Privacy policy URL | `https://top-shelf-production-b470.up.railway.app/privacy` |
