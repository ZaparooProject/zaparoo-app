import {
  Nfc,
  NfcTag,
  NfcTagScannedEvent,
  NfcUtils
} from "@capawesome-team/capacitor-nfc";

export enum Status {
  Success,
  Error,
  Cancelled
}

export interface TagInfo {
  rawTag: NfcTag | null;
  tag: Tag | null;
}

export interface Result {
  status: Status;
  info: TagInfo;
}

export const sessionManager = {
  shouldRestart: false,
  setShouldRestart: (value: boolean) => {
    sessionManager.shouldRestart = value;
  },
  launchOnScan: true,
  setLaunchOnScan: (value: boolean) => {
    sessionManager.launchOnScan = value;
  }
};

export interface Tag {
  uid: string;
  text: string;
}

const createNdefTextRecord = (text: string) => {
  const utils = new NfcUtils();
  const { record } = utils.createNdefTextRecord({ text });
  return record;
};

export function int2hex(v: number[]): string {
  let hexId = "";
  for (let i = 0; i < v.length; i++) {
    hexId += v[i].toString(16).padStart(2, "0");
  }
  hexId = hexId.replace(/-/g, "");
  return hexId;
}

export function int2char(v: number[]): string {
  let charId = "";
  for (let i = 0; i < v.length; i++) {
    charId += String.fromCharCode(v[i]);
  }
  return charId;
}

function readNfcEvent(event: NfcTagScannedEvent): Tag | null {
  if (!event.nfcTag || !event.nfcTag.id) {
    return null;
  }

  let text = "";
  if (event.nfcTag.message && event.nfcTag.message.records.length > 0) {
    const ndef = event.nfcTag.message.records[0];

    if (ndef.payload) {
      let bs = ndef.payload;
      if (bs.length > 3 && bs[0] == 2) {
        bs = bs.slice(3);
      }
      text = int2char(bs);
    }
  }

  return { uid: int2hex(event.nfcTag.id), text: text };
}

export async function readTag(): Promise<Result> {
  return new Promise((resolve, reject) => {
    Nfc.addListener("nfcTagScanned", async (event) => {
      Nfc.stopScanSession();
      resolve({
        status: Status.Success,
        info: {
          rawTag: event.nfcTag,
          tag: readNfcEvent(event)
        }
      });
    });

    Nfc.addListener("scanSessionCanceled", async () => {
      Nfc.stopScanSession();
      resolve({
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null
        }
      });
    });

    Nfc.addListener("scanSessionError", async (err) => {
      Nfc.stopScanSession();
      reject(err);
    });

    Nfc.startScanSession();
  });
}

export async function writeTag(text: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const record = createNdefTextRecord(text);

    Nfc.addListener("nfcTagScanned", async (event) => {
      await Nfc.write({ message: { records: [record] } }).then(
        () => {
          console.log("write success");
          Nfc.stopScanSession();
          resolve({
            status: Status.Success,
            info: {
              rawTag: event.nfcTag,
              tag: readNfcEvent(event)
            }
          });
        },
        (error) => {
          Nfc.stopScanSession();
          reject(error);
        }
      );
    });

    Nfc.addListener("scanSessionCanceled", async () => {
      Nfc.stopScanSession();
      resolve({
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null
        }
      });
    });

    Nfc.addListener("scanSessionError", async (err) => {
      console.log("write error", err);
      Nfc.stopScanSession();
      reject(err);
    });

    Nfc.startScanSession();
  });
}

export async function formatTag(): Promise<Result> {
  return new Promise((resolve, reject) => {
    Nfc.addListener("nfcTagScanned", async (event) => {
      await Nfc.format().then(
        () => {
          console.log("format success");
          Nfc.stopScanSession();
          resolve({
            status: Status.Success,
            info: {
              rawTag: event.nfcTag,
              tag: readNfcEvent(event)
            }
          });
        },
        (error) => {
          console.error("format error", error);
          Nfc.stopScanSession();
          reject(error);
        }
      );
    });

    Nfc.addListener("scanSessionCanceled", async () => {
      Nfc.stopScanSession();
      resolve({
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null
        }
      });
    });

    Nfc.addListener("scanSessionError", async (err) => {
      console.log("write error", err);
      Nfc.stopScanSession();
      reject(err);
    });

    Nfc.startScanSession();
  });
}

export async function eraseTag(): Promise<Result> {
  return new Promise((resolve, reject) => {
    Nfc.addListener("nfcTagScanned", async (event) => {
      await Nfc.erase().then(
        () => {
          console.log("erase success");
          Nfc.stopScanSession();
          resolve({
            status: Status.Success,
            info: {
              rawTag: event.nfcTag,
              tag: readNfcEvent(event)
            }
          });
        },
        (error) => {
          console.error("erase error", error);
          Nfc.stopScanSession();
          reject(error);
        }
      );
    });

    Nfc.addListener("scanSessionCanceled", async () => {
      Nfc.stopScanSession();
      resolve({
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null
        }
      });
    });

    Nfc.addListener("scanSessionError", async (err) => {
      console.log("write error", err);
      Nfc.stopScanSession();
      reject(err);
    });

    Nfc.startScanSession();
  });
}

export async function readRaw(): Promise<Result> {
  return new Promise((resolve, reject) => {
    Nfc.addListener("nfcTagScanned", async (event) => {
      console.log("read raw success");
      Nfc.stopScanSession();
      resolve({
        status: Status.Success,
        info: {
          rawTag: event.nfcTag,
          tag: readNfcEvent(event)
        }
      });
    });

    Nfc.addListener("scanSessionCanceled", async () => {
      Nfc.stopScanSession();
      resolve({
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null
        }
      });
    });

    Nfc.addListener("scanSessionError", async (err) => {
      console.log("write error", err);
      Nfc.stopScanSession();
      reject(err);
    });

    Nfc.startScanSession();
  });
}

export async function makeReadOnly(): Promise<Result> {
  return new Promise((resolve, reject) => {
    Nfc.addListener("nfcTagScanned", async (event) => {
      await Nfc.makeReadOnly().then(
        () => {
          console.log("make read only success");
          Nfc.stopScanSession();
          resolve({
            status: Status.Success,
            info: {
              rawTag: event.nfcTag,
              tag: readNfcEvent(event)
            }
          });
        },
        (error) => {
          console.error("make read only error", error);
          Nfc.stopScanSession();
          reject(error);
        }
      );
    });

    Nfc.addListener("scanSessionCanceled", async () => {
      Nfc.stopScanSession();
      resolve({
        status: Status.Cancelled,
        info: {
          rawTag: null,
          tag: null
        }
      });
    });

    Nfc.addListener("scanSessionError", async (err) => {
      console.log("write error", err);
      Nfc.stopScanSession();
      reject(err);
    });

    Nfc.startScanSession();
  });
}

export async function cancelSession() {
  const supported = await Nfc.isSupported();
  if (supported.nfc) {
    await Nfc.removeAllListeners();
    await Nfc.stopScanSession();
  }
}
