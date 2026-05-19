/**
 * One-off script: converts images/icon.svg → images/icon.png at 128×128 px.
 * Run via: npm run build-icon
 *
 * Uses sharp (libvips) for pixel-perfect SVG rasterisation. Do not hand-craft
 * the PNG — always regenerate it from the SVG source so they stay in sync.
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'images', 'icon.svg');
const pngPath = join(root, 'images', 'icon.png');

const svgBuffer = readFileSync(svgPath);

await sharp(svgBuffer, { density: 144 })
    .resize(128, 128)
    .png()
    .toFile(pngPath);

console.log('Generated images/icon.png (128×128)');
