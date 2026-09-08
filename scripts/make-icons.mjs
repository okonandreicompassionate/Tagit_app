/**
 * Renders every icon Expo needs from one SVG mark.
 *
 *   node scripts/make-icons.mjs
 *
 * Run this after changing assets/brand/mark.svg. Regenerating beats
 * hand-editing PNGs: the sizes stay in step and the geometry can only be wrong
 * in one place.
 *
 * The mark is 120×120 with the reticle inset 8 units, so it already carries
 * about 7% of its own padding. Each target below adds only what that surface
 * needs on top of that.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets');

const INK = '#0a0a09';
const SNAP = '#fffc00';

/**
 * The mark, drawn at a given size with a given colour and padding.
 * `pad` is a fraction of the canvas left empty around the 120-unit artwork.
 */
function markSvg({ size, color = SNAP, background = 'none', pad = 0.12 }) {
  const inner = Math.round(size * (1 - pad * 2));
  const offset = Math.round((size - inner) / 2);
  const scale = inner / 120;

  const bg =
    background === 'none'
      ? ''
      : `<rect width="${size}" height="${size}" fill="${background}"/>`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  ${bg}
  <g transform="translate(${offset},${offset}) scale(${scale})"
     stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M8,34 L8,8 L34,8"/>
    <path d="M86,8 L112,8 L112,34"/>
    <path d="M8,86 L8,112 L34,112"/>
    <path d="M112,86 L112,112 L86,112"/>
    <line x1="52" y1="60" x2="68" y2="60" stroke-width="7"/>
    <circle cx="44" cy="60" r="9" fill="${color}" stroke="none"/>
    <circle cx="76" cy="60" r="9" fill="${color}" stroke="none"/>
  </g>
</svg>`;
}

/**
 * A monochrome mark for Android's themed icons, which recolour a silhouette
 * and so must be a single flat colour on transparency.
 */
const targets = [
  // Store / launcher icon: full bleed on the app's black.
  { file: 'icon.png', size: 1024, background: INK, pad: 0.2 },

  // Adaptive foreground: Android crops to a circle and masks aggressively, so
  // the artwork sits inside the ~66% safe zone with heavy padding.
  { file: 'android-icon-foreground.png', size: 1024, background: 'none', pad: 0.31 },
  // Black, not yellow: the foreground mark is yellow, and yellow-on-yellow
  // is an invisible launcher icon. Matches icon.png.
  { file: 'android-icon-background.png', size: 1024, background: INK, pad: 0.5, blank: true },
  { file: 'android-icon-monochrome.png', size: 1024, background: 'none', color: '#ffffff', pad: 0.31 },

  // Splash: small and centred; Expo scales it onto the background colour.
  { file: 'splash-icon.png', size: 512, background: 'none', pad: 0.18 },

  // Favicon: heavier relative stroke survives being drawn at 16px.
  { file: 'favicon.png', size: 256, background: INK, pad: 0.14 },

  // Handy for the download page and social previews.
  { file: 'brand/mark-512.png', size: 512, background: 'none', pad: 0.08 },
  { file: 'brand/mark-on-light-512.png', size: 512, background: '#f4f2ea', color: INK, pad: 0.14 },
];

await mkdir(join(out, 'brand'), { recursive: true });

for (const t of targets) {
  // `blank` means the layer is a flat colour with no artwork — Android draws
  // the foreground over it, so any mark here would show through doubled.
  const svg = t.blank
    ? `<svg width="${t.size}" height="${t.size}" xmlns="http://www.w3.org/2000/svg"><rect width="${t.size}" height="${t.size}" fill="${t.background}"/></svg>`
    : markSvg(t);

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(join(out, t.file), png);
  console.log(`  ${t.file.padEnd(34)} ${t.size}×${t.size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log('\nIcons regenerated from assets/brand/mark.svg');
