import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

// Regenerates public/icons/*.png from the master art (public/icons/icon-512.png).
// The standard icons are flat #06b6d4 rounded-rect backgrounds with a white
// calendar glyph; the maskable variants are full-bleed squares with the glyph
// scaled to 0.82 and centered. This script re-derives every size from the 512px
// master so the set stays consistent. Output is a close visual match to the
// committed files, not byte-identical (PNG encoding is not reproducible).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, "..", "public", "icons");
const MASTER_PATH = path.join(ICONS_DIR, "icon-512.png");

const BG = [6, 182, 212];
const MASKABLE_SCALE = 0.82;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG file");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error(`unsupported PNG: bitDepth=${bitDepth} colorType=${colorType}`);
      }
    }
    else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const line = Buffer.from(raw.subarray(rowStart, rowStart + stride));
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? line[x - 4] : 0;
      const up = prev[x];
      const upLeft = x >= 4 ? prev[x - 4] : 0;
      let v = line[x];
      if (filter === 1) {
        v += left;
      }
      else if (filter === 2) {
        v += up;
      }
      else if (filter === 3) {
        v += (left + up) >> 1;
      }
      else if (filter === 4) {
        v += paeth(left, up, upLeft);
      }
      line[x] = v & 0xFF;
    }
    line.copy(out, y * stride);
    line.copy(prev);
  }
  return { width, height, data: out };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  out.writeUInt32BE(crc32(typeAndData), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function premultiply(rgba) {
  const out = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    out[i] = (rgba[i] * a) / 255;
    out[i + 1] = (rgba[i + 1] * a) / 255;
    out[i + 2] = (rgba[i + 2] * a) / 255;
    out[i + 3] = a;
  }
  return out;
}

function unpremultiply(pma) {
  const out = Buffer.alloc(pma.length);
  for (let i = 0; i < pma.length; i += 4) {
    const a = pma[i + 3];
    out[i] = a === 0 ? 0 : Math.min(255, Math.round((pma[i] * 255) / a));
    out[i + 1] = a === 0 ? 0 : Math.min(255, Math.round((pma[i + 1] * 255) / a));
    out[i + 2] = a === 0 ? 0 : Math.min(255, Math.round((pma[i + 2] * 255) / a));
    out[i + 3] = a;
  }
  return out;
}

function lanczos(x, a) {
  if (x === 0) {
    return 1;
  }
  if (Math.abs(x) >= a) {
    return 0;
  }
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

function resample1D(src, srcLen, dstLen) {
  const scale = dstLen / srcLen;
  const a = 3;
  const dst = new Float32Array(dstLen);
  for (let x = 0; x < dstLen; x++) {
    const center = (x + 0.5) / scale - 0.5;
    const start = Math.floor(center - a);
    const end = Math.ceil(center + a);
    let sum = 0;
    let weightSum = 0;
    for (let i = start; i <= end; i++) {
      const weight = lanczos(center - i, a);
      const idx = i < 0 ? 0 : i >= srcLen ? srcLen - 1 : i;
      sum += src[idx] * weight;
      weightSum += weight;
    }
    dst[x] = weightSum ? sum / weightSum : 0;
  }
  return dst;
}

function resize(rgba, srcW, srcH, dstW, dstH) {
  const pma = premultiply(rgba);
  const horizontal = Buffer.alloc(dstW * srcH * 4);
  for (let y = 0; y < srcH; y++) {
    for (let c = 0; c < 4; c++) {
      const src = new Float32Array(srcW);
      for (let x = 0; x < srcW; x++) {
        src[x] = pma[(y * srcW + x) * 4 + c];
      }
      const dst = resample1D(src, srcW, dstW);
      for (let x = 0; x < dstW; x++) {
        horizontal[(y * dstW + x) * 4 + c] = dst[x];
      }
    }
  }
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let x = 0; x < dstW; x++) {
    for (let c = 0; c < 4; c++) {
      const src = new Float32Array(srcH);
      for (let y = 0; y < srcH; y++) {
        src[y] = horizontal[(y * dstW + x) * 4 + c];
      }
      const dst = resample1D(src, srcH, dstH);
      for (let y = 0; y < dstH; y++) {
        out[(y * dstW + x) * 4 + c] = dst[y];
      }
    }
  }
  return unpremultiply(out);
}

function isolateGlyph(rgba) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) {
      continue;
    }
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const distanceToBg = (r - BG[0]) ** 2 + (g - BG[1]) ** 2 + (b - BG[2]) ** 2;
    const distanceToWhite = (r - 255) ** 2 + (g - 255) ** 2 + (b - 255) ** 2;
    if (distanceToBg < distanceToWhite) {
      out[i + 3] = 0;
    }
  }
  return out;
}

function composeMaskable(glyph, glyphSize, canvasSize) {
  const offset = (canvasSize - glyphSize) / 2;
  const out = Buffer.alloc(canvasSize * canvasSize * 4);
  for (let y = 0; y < canvasSize; y++) {
    for (let x = 0; x < canvasSize; x++) {
      const o = (y * canvasSize + x) * 4;
      const inGlyph = x >= offset && x < offset + glyphSize && y >= offset && y < offset + glyphSize;
      if (!inGlyph) {
        out[o] = BG[0];
        out[o + 1] = BG[1];
        out[o + 2] = BG[2];
        out[o + 3] = 255;
        continue;
      }
      const go = ((y - offset) * glyphSize + (x - offset)) * 4;
      const alpha = glyph[go + 3] / 255;
      out[o] = glyph[go] * alpha + BG[0] * (1 - alpha);
      out[o + 1] = glyph[go + 1] * alpha + BG[1] * (1 - alpha);
      out[o + 2] = glyph[go + 2] * alpha + BG[2] * (1 - alpha);
      out[o + 3] = 255;
    }
  }
  return out;
}

function glyphBBox(rgba, width) {
  let minX = width;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  const height = rgba.length / 4 / width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (rgba[o + 3] > 10 && rgba[o] > 250 && rgba[o + 1] > 250 && rgba[o + 2] > 250) {
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

const master = decodePng(readFileSync(MASTER_PATH));
if (master.width !== 512 || master.height !== 512) {
  throw new Error(`master icon must be 512x512, got ${master.width}x${master.height}`);
}

const glyph = isolateGlyph(master.data);
const scaledGlyphSize = Math.round(512 * MASKABLE_SCALE);
const scaledGlyph = resize(glyph, 512, 512, scaledGlyphSize, scaledGlyphSize);
const maskable512 = composeMaskable(scaledGlyph, scaledGlyphSize, 512);

const outputs = {
  "icon-180.png": resize(master.data, 512, 512, 180, 180),
  "icon-192.png": resize(master.data, 512, 512, 192, 192),
  "maskable-192.png": resize(maskable512, 512, 512, 192, 192),
  "maskable-512.png": maskable512,
};

const summary = [];
for (const [name, rgba] of Object.entries(outputs)) {
  const size = Number(name.match(/\d+/)[0]);
  const png = encodePng(size, size, rgba);
  writeFileSync(path.join(ICONS_DIR, name), png);
  const bbox = glyphBBox(rgba, size);
  summary.push(
    `${name}  ${size}x${size}  glyph x ${bbox.minX}-${bbox.maxX} y ${bbox.minY}-${bbox.maxY}  ${png.length} bytes`,
  );
}
writeFileSync(path.join(ICONS_DIR, "icon-512.png"), readFileSync(MASTER_PATH));

console.warn(`Regenerated icons from ${path.basename(MASTER_PATH)}:`);
console.warn(summary.join("\n"));
console.warn("Note: output is a visual match; PNG bytes are not reproducible, review before committing.");
