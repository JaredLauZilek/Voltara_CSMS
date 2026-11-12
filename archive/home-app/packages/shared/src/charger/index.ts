// Charger domain model + protocol codecs. Pure TypeScript: no BLE library, no
// React. The Expo app's `ble/` layer moves bytes; everything here decides what
// the bytes mean. Keeping it here lets vitest cover it without a phone.

export * from './types';
export * from './simulator';
export * from './soc';
export * as hici from './hici';
