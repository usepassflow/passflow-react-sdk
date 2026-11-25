const UNSAFE_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:', 'filesystem:']);

/**
 * Whether the browser may be sent, or may post, to an address the server gave: never one it would run or open as a
 * document. The address is read the way the browser will read it, and one that cannot be read is not safe. Neither
 * is an empty one: it would resolve to this page. An app's own scheme is safe.
 */
export const isSafeTarget = (address: string): boolean => {
  if (!address) return false;
  try {
    return !UNSAFE_SCHEMES.has(new URL(address, document.baseURI).protocol);
  } catch {
    return false;
  }
};
