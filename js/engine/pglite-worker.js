// Web Worker：SQLエンジンを画面とは別のスレッドで動かします。
// 長時間かかるSQLは、画面側からこのWorkerごと停止（terminate）して安全に打ち切れます。
import { PgliteCore, serializeError } from './pglite-core.js';

const core = new PgliteCore();

self.onmessage = async (ev) => {
  const { id, type, sql, localUrl } = ev.data;
  try {
    if (type === 'init') {
      const info = await core.init(localUrl);
      self.postMessage({ id, ok: true, info });
    } else if (type === 'exec') {
      self.postMessage({ id, ...(await core.exec(sql)) });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: serializeError(e) });
  }
};
