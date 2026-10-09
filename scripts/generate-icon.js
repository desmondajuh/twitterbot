import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Generates a valid 256x256 RGBA PNG icon file.
 */
function createPngBuffer(width = 256, height = 256) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = createChunk("IHDR", ihdrData);

  // Raw pixel data: 1 filter byte (0) + width * 4 (RGBA) per scanline
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      // Vibrant sky blue theme (#0284c7)
      rawData[pixelOffset] = 2; // R
      rawData[pixelOffset + 1] = 132; // G
      rawData[pixelOffset + 2] = 199; // B
      rawData[pixelOffset + 3] = 255; // Alpha
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk("IDAT", compressedData);

  // IEND chunk
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);

  const crc32 = calcCrc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc32, 0);

  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

// CRC32 calculation table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function calcCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a PNG-embedded ICO file buffer.
 */
function createIcoFromPng(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: ICO
  header.writeUInt16LE(1, 4); // Count: 1 image

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(0, 0); // Width: 0 -> 256px
  dirEntry.writeUInt8(0, 1); // Height: 0 -> 256px
  dirEntry.writeUInt8(0, 2); // Colors: 0
  dirEntry.writeUInt8(0, 3); // Reserved: 0
  dirEntry.writeUInt16LE(1, 4); // Planes: 1
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel: 32
  dirEntry.writeUInt32LE(pngBuf.length, 8); // Size
  dirEntry.writeUInt32LE(22, 12); // Offset: 6 + 16 = 22

  return Buffer.concat([header, dirEntry, pngBuf]);
}

function main() {
  const iconsDir = path.resolve(process.cwd(), "build", "icons");
  const buildDir = path.resolve(process.cwd(), "build");

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const existingIco = path.join(iconsDir, "icon.ico");
  if (fs.existsSync(existingIco) && fs.statSync(existingIco).size > 5000) {
    console.log("🎨 High-resolution custom icon existing in build/icons/, keeping custom icon.");
    return;
  }

  const pngBuffer = createPngBuffer(256, 256);
  const icoBuffer = createIcoFromPng(pngBuffer);

  fs.writeFileSync(path.join(iconsDir, "icon.png"), pngBuffer);
  fs.writeFileSync(path.join(buildDir, "icon.png"), pngBuffer);
  fs.writeFileSync(path.join(iconsDir, "icon.ico"), icoBuffer);
  fs.writeFileSync(path.join(buildDir, "icon.ico"), icoBuffer);

  console.log("🎨 Generated icon.png & icon.ico in build/ & build/icons/");
}

main();
