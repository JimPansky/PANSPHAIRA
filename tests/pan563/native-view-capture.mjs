import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pngDimensionsV1 } from './capture-coverage.mjs';

// Observation only: actual native compositor VIEW pixels, without expanding a
// surface or resizing/emulating zoom. Full image is an explicitly pinned stitch
// of real scroll-position captures. No pixels are scaled or synthesized.
export async function captureFullNativeViewV1(page, context, state, metrics, evidence, name) {
  const width = Math.ceil(metrics.cssContentSize.width * state.dpr);
  const height = Math.ceil(metrics.contentSize.height * (state.dpr / state.nativeZoom));
  assert.ok(width > 0 && height > 0 && height <= 32767, 'PAN563_NATIVE_CAPTURE_EXTENT_DENIED');
  const session = await context.newCDPSession(page); const tiles = []; let coveredRows = 0;
  try {
    for (let index = 0; index < 128 && coveredRows < height; index++) {
      const view = await page.evaluate(y => new Promise(resolve => {
        scrollTo(0, y); requestAnimationFrame(() => resolve({ scroll: { x: scrollX, y: scrollY }, viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio }));
      }), index * state.viewport.height);
      assert.deepEqual(view.viewport, state.viewport); assert.equal(view.dpr, state.dpr); assert.equal(view.scroll.x, 0);
      const raw = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
      const bytes = Buffer.from(raw.data, 'base64'); const png = pngDimensionsV1(bytes); const pixelY = Math.round(view.scroll.y * state.dpr);
      assert.equal(png.width, width, 'PAN563_NATIVE_VIEW_WIDTH_DENIED');
      assert.ok(pixelY <= coveredRows, 'PAN563_NATIVE_VIEW_TILE_GAP');
      assert.ok(pixelY + png.height > coveredRows, 'PAN563_NATIVE_VIEW_TILE_STALLED');
      const file = join(evidence, name + '.tile-' + String(index).padStart(3, '0') + '.png'); writeFileSync(file, bytes);
      tiles.push({ file, png, pixelY, ...view, sha256: createHash('sha256').update(bytes).digest('hex'), data: raw.data });
      coveredRows = Math.min(height, pixelY + png.height);
    }
    assert.equal(coveredRows, height, 'PAN563_NATIVE_VIEW_FULL_HEIGHT_DENIED');
    const data = await page.evaluate(async ({ tiles, width, height }) => {
      const canvas = new OffscreenCanvas(width, height); const c = canvas.getContext('2d');
      for (const tile of tiles) {
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(tile.data), x => x.charCodeAt(0))], { type: 'image/png' }));
        c.drawImage(bitmap, 0, tile.pixelY); bitmap.close();
      }
      const blob = await canvas.convertToBlob({ type: 'image/png' }); const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    }, { tiles: tiles.map(({ data, pixelY }) => ({ data, pixelY })), width, height });
    await page.evaluate(() => scrollTo(0, 0));
    return { bytes: Buffer.from(data, 'base64'), tiles: tiles.map(({ data, ...pin }) => pin), method: 'FULL_PHYSICAL_EXTENT_STITCH_OF_REAL_NATIVE_VIEW_TILES_NO_RESIZE_NO_SYNTHETIC_PIXELS', coveredRows };
  } finally { await session.detach(); }
}
