import { mockApi } from './mock.js';

const nativeApi = typeof window !== 'undefined' ? window.tycl : null;

export const isElectron = Boolean(nativeApi && nativeApi.isElectron);
export const api = isElectron ? nativeApi : mockApi;

if (typeof document !== 'undefined') {
  document.body.classList.toggle('no-electron', !isElectron);
  document.body.classList.toggle('is-electron', isElectron);
}
