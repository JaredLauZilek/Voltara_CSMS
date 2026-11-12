// HiCi AC charger — BLE protocol. Everything here is the *assumed* shape of
// the protocol until it is verified on the bench with the GATT explorer in
// apps/home (dev → "GATT explorer"). See docs/hici-ble-protocol.md for the
// capture checklist. Keep every HiCi-specific constant in this folder.

export * from './gatt';
export * from './codec';
