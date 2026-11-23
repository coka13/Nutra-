/** @param {string | undefined} value */
function isPrivatePreviewOrigin(value) {
  try {
    const url = new URL(value || '');
    if (
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return false;
    const octets = url.hostname.split('.').map(Number);
    if (
      octets.length !== 4 ||
      octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    )
      return false;
    const [a, b] = octets;
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  } catch {
    return false;
  }
}

module.exports = { isPrivatePreviewOrigin };
