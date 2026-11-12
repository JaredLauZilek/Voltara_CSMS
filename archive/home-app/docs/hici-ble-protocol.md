# HiCi BLE protocol — capture checklist

Status: **unverified**. HiCi (Hici Digital Power Technology, Hubei) publishes no BLE profile. Everything in `packages/shared/src/charger/hici/` is an assumed, conventional serial-over-BLE layout so the app has something complete to run against. This page is the bench procedure for replacing the assumptions with facts. Only `gatt.ts` and `codec.ts` should change as a result.

## What we know

- The HICI Charge app (`com.hiconics.ocpp`) pairs over Bluetooth and provisions Wi‑Fi; units advertise after power-up and (on some models) after a touch on the panel.
- The wallbox exposes Wi‑Fi + BLE; no OCPP on the units Voltara ships.

## Bench procedure (needs a development build and a powered unit)

1. Build and install a dev client: `eas build --profile development --platform android` (Android first — it reports more GATT detail and allows MTU 517).
2. Sign in as `installer@dev.voltara.com.my`, open **Profile → GATT explorer**, tap **Scan**.
3. Record for the unit: advertised **local name** (does it contain the serial?), **service UUIDs** in the advertisement, **manufacturer data** (hex), RSSI at 1 m.
4. Connect. Record the negotiated **MTU** and every **service → characteristic** with its properties. Expected: one vendor service with a write and a notify characteristic, plus Device Information (180A).
5. **Subscribe** to every notifiable characteristic, then: plug a car in, start a charge from the HICI app, stop it, unplug. Save the log — the push cadence and the status frame layout come from here.
6. Capture the HICI app's traffic too (Android: _Developer options → Enable Bluetooth HCI snoop log_, pull `btsnoop_hci.log`, open in Wireshark). Diff against your explorer log to find the **auth / PIN handshake** on connect and the exact **start / stop / set current** frames.
7. Fill in `gatt.ts` (UUIDs, name prefix, MTU) and `codec.ts` (header, length, checksum, command ids, status layout, info layout). Update the tests in `codec.test.ts` with real captured frames as fixtures.
8. If the unit requires OS-level pairing (a system PIN dialog appears), note it: `react-native-ble-plx` cannot drive bonding on Android; the first connection then has to happen from system Bluetooth settings, and the driver needs a "pair first" hint in the onboarding flow.

## What to bring back

| Item                                  | Where it goes                     |
| ------------------------------------- | --------------------------------- |
| Service / write / notify UUIDs        | `hici/gatt.ts`                    |
| Name prefix, MTU, advertise behaviour | `hici/gatt.ts`, `drivers/hici.ts` |
| Frame header, length, checksum        | `hici/codec.ts`                   |
| Command ids + reply ids               | `hici/codec.ts` `HiciCmd`         |
| Status payload layout and scaling     | `hici/codec.ts` `decodeStatus`    |
| Auth handshake                        | `drivers/hici.ts` `authenticate`  |
| Captured frames                       | `hici/codec.test.ts` fixtures     |
