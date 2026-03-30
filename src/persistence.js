// y-leveldb를 사용하는 Yjs 영속화 초기화 로직.
import { mkdir } from "node:fs/promises";

export async function initializePersistence({
  utils,
  Y,
  LeveldbPersistence,
  yLeveldbPath
}) {
  await mkdir(yLeveldbPath, { recursive: true });

  const ldb = new LeveldbPersistence(yLeveldbPath);
  utils.setPersistence({
    provider: ldb,
    bindState: async (docName, ydoc) => {
      const persistedYdoc = await ldb.getYDoc(docName);
      const newUpdates = Y.encodeStateAsUpdate(ydoc);

      if (newUpdates.byteLength > 0) {
        await ldb.storeUpdate(docName, newUpdates);
      }

      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
      ydoc.on("update", update => {
        void ldb.storeUpdate(docName, update);
      });
    },
    writeState: async () => {}
  });
}
