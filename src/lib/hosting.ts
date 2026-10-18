// True when the web build runs as a hosted page (set by the page that loads
// the bundle). Hosted pages can't open the print dialog, so PDF export hides.
export const hosted = typeof globalThis !== 'undefined' && !!(globalThis as { __FD_HOSTED__?: boolean }).__FD_HOSTED__
export const canPrint = !hosted
