# Anonymous usage counts

The App sends two anonymous counts to Zaparoo Online so the Pro screen can be measured without identifying anyone. Each request adds 1 to a daily total. The client is `src/lib/usageCounts.ts`; the contract is `POST /v1/analytics/app-counts` in the Zaparoo Online API.

## Events

| Event               | Sent                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pro_screen_viewed` | Once each time the Pro purchase screen opens.                                                                               |
| `pro_purchased`     | Once when a Pro purchase succeeds. Restoring a purchase, or recovering one the store says is already owned, is not counted. |

Nothing else is sent. The API also accepts `trial_started` from the App; the App does not send it.

## Fields

Both events carry the same five fields and no others.

| Field         | Value                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`      | Always `app`.                                                                                                                                                                                                       |
| `event`       | `pro_screen_viewed` or `pro_purchased`.                                                                                                                                                                             |
| `source`      | The entry point that opened the Pro screen: `nfc`, `camera`, `shake` or `settings`. A purchase reports the entry point of the screen it was made from.                                                              |
| `platform`    | `ios` or `android`.                                                                                                                                                                                                 |
| `app_version` | The release the running JavaScript belongs to, `MAJOR.MINOR.PATCH`. This is the version Settings shows: after a live update it is the live update's version, not the native binary's. No build number or bundle ID. |

The request has no account, device, installation or RevenueCat identifier, no timestamp and no `Authorization` header. Do not send it through the signed-in Online client in `src/lib/onlineApi.ts`.

## Entry point

`setProPurchaseModalOpen(true, source)` in `useStatusStore` records the entry point as `proPurchaseSource`. The same value picks the Pro screen's title and first sentence. An opener that passes no source is counted as `settings`, so every new way of opening the Pro screen must pass its own.

| Opened by                                       | `source`   |
| ----------------------------------------------- | ---------- |
| NFC scan, including tags read in the background | `nfc`      |
| Camera scan                                     | `camera`   |
| Shake to launch                                 | `shake`    |
| A Pro control in Settings                       | `settings` |
| A deep link blocked by the Pro check            | `nfc`      |

The API has no value for a deep link, so it is counted with tag taps.

## When nothing is sent

- Settings > Advanced > "Share anonymous usage counts" is off. It is on by default.
- The App is running on the web or embedded in Core.
- The build is a dev server build, a purchase preview build (`VITE_PURCHASE_PREVIEW=true`) or a local device test build (`VITE_DISABLE_LIVE_UPDATE_SYNC=true`).
- Saved settings could not be read this session, so the switch's saved value is unknown.
- The version is not a plain `MAJOR.MINOR.PATCH`.

## Failure

Sending is best effort. It never delays the screen or the purchase, is never retried or queued, shows no error and reports nothing to Rollbar.
