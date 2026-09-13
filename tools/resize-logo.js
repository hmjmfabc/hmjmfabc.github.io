'use strict';
/**
 * 纯 Node.js（零依赖）PNG 缩放 / 压缩工具。
 * 读取 8bit RGBA 或 RGB 的非隔行 PNG，使用面积平均法缩放后重新编码。
 *
 * 用法:
 *   node tools/resize-logo.js <input.png> <output.png> <size> [--stats]
 */

const fs = require('fs');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** 解码 PNG -> { width, height, data: Buffer(RGBA) } */
function decodePng(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('不是 PNG 文件');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8).toString('ascii');
    const data = buf.slice(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      trns = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`暂不支持位深 ${bitDepth}`);
  if (interlace !== 0) throw new Error('暂不支持隔行 PNG');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`暂不支持颜色类型 ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let value = line[x];
      switch (filter) {
        case 0: break;
        case 1: value = (value + a) & 0xff; break;
        case 2: value = (value + b) & 0xff; break;
        case 3: value = (value + ((a + b) >> 1)) & 0xff; break;
        case 4: value = (value + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`未知滤波类型 ${filter}`);
      }
      cur[x] = value;
    }
  }

  // 统一转换为 RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r;
    let g;
    let b;
    let a = 255;
    if (colorType === 6) {
      r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3];
    } else if (colorType === 2) {
      r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2];
    } else if (colorType === 0) {
      r = g = b = out[i];
    } else if (colorType === 4) {
      r = g = b = out[i * 2]; a = out[i * 2 + 1];
    } else {
      const idx = out[i];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      a = trns && idx < trns.length ? trns[idx] : 255;
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }

  return { width, height, data: rgba };
}

/** 面积平均缩放（预乘 alpha，避免透明边缘产生黑边） */
function resize(src, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = dy * scaleY;
    const y1 = Math.min(srcH, (dy + 1) * scaleY);
    const sy0 = Math.floor(y0);
    const sy1 = Math.ceil(y1);
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = dx * scaleX;
      const x1 = Math.min(srcW, (dx + 1) * scaleX);
      const sx0 = Math.floor(x0);
      const sx1 = Math.ceil(x1);
      let r = 0; let g = 0; let b = 0; let a = 0; let wsum = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        for (let sx = sx0; sx < sx1; sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (sy * srcW + sx) * 4;
          const alpha = src[i + 3] / 255;
          r += src[i] * alpha * w;
          g += src[i + 1] * alpha * w;
          b += src[i + 2] * alpha * w;
          a += src[i + 3] * w;
          wsum += w;
        }
      }
      const o = (dy * dstW + dx) * 4;
      const alphaSum = a / wsum;
      const inv = alphaSum > 0 ? 255 / alphaSum : 0;
      out[o] = Math.min(255, Math.round((r / wsum) * inv));
      out[o + 1] = Math.min(255, Math.round((g / wsum) * inv));
      out[o + 2] = Math.min(255, Math.round((b / wsum) * inv));
      out[o + 3] = Math.min(255, Math.round(alphaSum));
    }
  }
  return out;
}

/** 依据最小绝对差启发式逐行选择滤波类型，然后 zlib 压缩 */
function encodePng(rgba, width, height, opts = {}) {
  // 全不透明时可省略 alpha 通道（colorType 2），显著减小体积
  let opaque = true;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) { opaque = false; break; }
  }
  const bpp = opaque && opts.keepAlpha !== true ? 3 : 4;
  const colorType = bpp === 3 ? 2 : 6;
  const stride = width * bpp;
  const pixels = bpp === 4 ? rgba : Buffer.alloc(width * height * 3);
  if (bpp === 3) {
    for (let i = 0; i < width * height; i++) {
      pixels[i * 3] = rgba[i * 4];
      pixels[i * 3 + 1] = rgba[i * 4 + 1];
      pixels[i * 3 + 2] = rgba[i * 4 + 2];
    }
  }

  const raw = Buffer.alloc(height * (stride + 1));
  const candidates = [0, 1, 2, 3, 4];
  for (let y = 0; y < height; y++) {
    const cur = pixels.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    let best = null;
    let bestScore = Infinity;
    let bestType = 0;
    for (const type of candidates) {
      const line = Buffer.alloc(stride);
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0;
        const b = prev[x];
        const c = x >= bpp ? prev[x - bpp] : 0;
        let value = cur[x];
        if (type === 1) value = (value - a) & 0xff;
        else if (type === 2) value = (value - b) & 0xff;
        else if (type === 3) value = (value - ((a + b) >> 1)) & 0xff;
        else if (type === 4) value = (value - paeth(a, b, c)) & 0xff;
        line[x] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        best = line;
        bestType = type;
      }
    }
    raw[y * (stride + 1)] = bestType;
    best.copy(raw, y * (stride + 1) + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function main() {
  const [input, output, sizeArg, flag] = process.argv.slice(2);
  if (!input || !output || !sizeArg) {
    console.error('用法: node tools/resize-logo.js <input.png> <output.png> <size> [--stats]');
    process.exit(1);
  }
  const size = parseInt(sizeArg, 10);
  const src = decodePng(fs.readFileSync(input));

  if (flag === '--stats') {
    let transparent = 0;
    const colors = new Set();
    for (let i = 0; i < src.width * src.height; i++) {
      if (src.data[i * 4 + 3] < 250) transparent++;
      if (colors.size < 200000) {
        colors.add((src.data[i * 4] << 16) | (src.data[i * 4 + 1] << 8) | src.data[i * 4 + 2]);
      }
    }
    console.log(JSON.stringify({
      width: src.width,
      height: src.height,
      semiTransparentPixels: transparent,
      approxDistinctOpaqueColors: colors.size,
    }));
  }

  // 保持宽高比；输出为正方形画布尺寸 size x size（源图为正方形时等价于等比缩放）
  const ratio = src.width / src.height;
  const dstW = ratio >= 1 ? size : Math.max(1, Math.round(size * ratio));
  const dstH = ratio >= 1 ? Math.max(1, Math.round(size / ratio)) : size;

  const resized = resize(src.data, src.width, src.height, dstW, dstH);
  const png = encodePng(resized, dstW, dstH);
  fs.writeFileSync(output, png);
  console.log(`${input} (${src.width}x${src.height}) -> ${output} (${dstW}x${dstH}) : ${(png.length / 1024).toFixed(1)} KB`);
}

if (require.main === module) main();
module.exports = { decodePng, resize, encodePng };
