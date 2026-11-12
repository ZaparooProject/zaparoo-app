/**
 * Zaparoo Core's Bluetooth LE API service. These values mirror Core's
 * `pkg/bluetooth/apigatt` package and must change only with it.
 */
export const BLE_SERVICE_UUID = "0da70001-b359-443b-836f-477d34b6a638";
export const BLE_RX_CHAR_UUID = "0da70002-b359-443b-836f-477d34b6a638";
export const BLE_TX_CHAR_UUID = "0da70003-b359-443b-836f-477d34b6a638";
export const BLE_INFO_CHAR_UUID = "0da70004-b359-443b-836f-477d34b6a638";
/**
 * Reads empty, and only over an encrypted link, so reading it makes the
 * phone pair with Core's Bluetooth stack first.
 */
export const BLE_BOND_CHAR_UUID = "0da70005-b359-443b-836f-477d34b6a638";

export const BLE_PROTOCOL_VERSION = 1;

/** How far ahead of the expected chunk a chunk may arrive and still be held. */
export const BLE_REORDER_WINDOW = 256;
/** Bytes of early chunks held while waiting for the ones before them. */
export const BLE_MAX_HELD_BYTES = 256 * 1024;
/** Recoverable framing mistakes tolerated before the link is dropped. */
export const BLE_MAX_PROTOCOL_ERRORS = 3;

/** ATT MTU every link starts with. */
export const BLE_DEFAULT_MTU = 23;
/** What ATT itself takes from every packet. */
export const BLE_ATT_HEADER_SIZE = 3;
/** The longest value an attribute can hold. */
export const BLE_MAX_CHUNK_SIZE = 512;
/** The MTU the app asks for on Android. */
export const BLE_REQUESTED_MTU = 512;
/**
 * iOS negotiates the MTU itself and the plugin does not report it. Every
 * iPhone that runs the app gets at least this, and writes with a response
 * fall back to long writes if it is ever lower.
 */
export const BLE_IOS_ASSUMED_MTU = 185;

/** Core's send window when Info does not say otherwise. */
export const BLE_DEFAULT_WINDOW = 64;
