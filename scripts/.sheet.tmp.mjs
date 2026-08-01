// Contact sheet: cada icono a 88 y a 32 sobre blanco, viejo arriba / nuevo abajo.
import { readdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const NEW = '/Users/omarbermejo/tdapp/assets/icons3d';
const OLD = '/private/tmp/claude-501/-Users-omarbermejo-tdapp/e2911218-b159-40aa-9f45-9f35f8e6e4dd/scratchpad';

const slugs = (await readdir(NEW)).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();

const CELL = 104;
const PAD = 8;
const cols = slugs.length;

async function strip(dir, size) {
  const comps = [];
  for (const [i, slug] of slugs.entries()) {
    let buf;
    try { buf = await readFile(`${dir}/${slug}.webp`); } catch { continue; }
    const img = await sharp(buf).resize(size, size).png().toBuffer();
    comps.push({ input: img, left: i * CELL + Math.round((CELL - size) / 2), top: Math.round((CELL - size) / 2) });
  }
  return sharp({ create: { width: cols * CELL, height: CELL, channels: 3, background: '#ffffff' } })
    .composite(comps).png().toBuffer();
}

const rows = [
  await strip(OLD, 88), await strip(NEW, 88),
  await strip(OLD, 32), await strip(NEW, 32),
];

await sharp({ create: { width: cols * CELL, height: rows.length * CELL + PAD * 3, channels: 3, background: '#ffffff' } })
  .composite(rows.map((input, i) => ({ input, left: 0, top: i * CELL + (i > 1 ? PAD * 2 : 0) })))
  .png()
  .toFile(`${OLD}/sheet.png`);

// Mediana de luminancia del objeto (solo pixeles con alfa), viejo vs nuevo.
async function median(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    hist[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++;
    n++;
  }
  let seen = 0;
  for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen >= n / 2) return v; }
  return 0;
}

console.log('icono            vieja  nueva');
for (const slug of slugs) {
  let o = '  -';
  try { o = String(await median(`${OLD}/${slug}.webp`)).padStart(3); } catch {}
  console.log(`${slug.padEnd(16)} ${o}    ${String(await median(`${NEW}/${slug}.webp`)).padStart(3)}`);
}
