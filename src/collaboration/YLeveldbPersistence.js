import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Y = require("yjs");
const { LeveldbPersistence } = require("y-leveldb");

export class YLeveldbPersistence {
  constructor({ utils, yLeveldbPath }) {
    this.utils = utils;
    this.yLeveldbPath = yLeveldbPath;
    this.ldb = null;
  }

  async initialize() {
    await mkdir(this.yLeveldbPath, { recursive: true });

    this.ldb = new LeveldbPersistence(this.yLeveldbPath);
    this.utils.setPersistence({
      provider: this.ldb,
      bindState: async (docName, ydoc) => {
        const persistedYdoc = await this.ldb.getYDoc(docName);
        const newUpdates = Y.encodeStateAsUpdate(ydoc);

        if (newUpdates.byteLength > 0) {
          await this.ldb.storeUpdate(docName, newUpdates);
        }

        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
        ydoc.on("update", update => {
          void this.ldb.storeUpdate(docName, update);
        });
      },
      writeState: async () => {}
    });
  }
}
