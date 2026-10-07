import assert from 'node:assert/strict';

// Capture observation only. Native tab zoom is read separately from chrome.tabs;
// CSS layout bounds alone cannot qualify screenshot pixel coverage.
export function pngDimensionsV1(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 24, 'PAN563_PNG_HEADER_REQUIRED');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PAN563_PNG_SIGNATURE_REQUIRED');
  assert.equal(bytes.subarray(12, 16).toString(), 'IHDR', 'PAN563_PNG_IHDR_REQUIRED');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
export function assertPhysicalCaptureWidthV1(bytes, cssContentWidth, dpr) {
  const png = pngDimensionsV1(bytes);
  assert.ok(Number.isFinite(cssContentWidth) && cssContentWidth > 0 && Number.isFinite(dpr) && dpr > 0);
  const expectedPhysicalWidth = Math.ceil(cssContentWidth * dpr);
  assert.ok(Math.abs(png.width - expectedPhysicalWidth) <= 1,
    'PAN563_SCREENSHOT_PHYSICAL_WIDTH_DENIED ' + JSON.stringify({ png, expectedPhysicalWidth, cssContentWidth, dpr }));
  return { png, expectedPhysicalWidth };
}
export function assertPhysicalCaptureCoverageV1(bytes, state, metrics) {
  const png = pngDimensionsV1(bytes);
  const css = metrics.cssContentSize;
  assert.ok(css && Number.isFinite(css.width) && Number.isFinite(css.height) && css.width > 0 && css.height > 0);
  assert.ok(Number.isFinite(state.dpr) && state.dpr > 0);
  assertPhysicalCaptureWidthV1(bytes, css.width, state.dpr);
  const expected = { width: Math.ceil(css.width * state.dpr), height: Math.ceil(css.height * state.dpr) };
  // One raster rounding pixel is allowed; half-width native200 crops are not.
  assert.ok(Math.abs(png.width - expected.width) <= 1 && Math.abs(png.height - expected.height) <= 1,
    'PAN563_SCREENSHOT_PHYSICAL_COVERAGE_DENIED ' + JSON.stringify({ png, expected, dpr: state.dpr, nativeZoom: state.nativeZoom, cssContentSize: css }));
  return { png, expected, outcome: 'PHYSICAL_EXTENT_MATCHED_NOT_HUMAN_VISUAL_REVIEW' };
}
