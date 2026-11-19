import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Pass the directory containing @viz-js/viz and sharp, or use installed modules.
const localRequire = createRequire(import.meta.url);
const require = process.argv[2]
  ? createRequire(path.join(path.resolve(process.argv[2]), 'package.json'))
  : localRequire;
const { instance } = require('@viz-js/viz');
const sharp = require('sharp');
const viz = await instance();
const directory = path.dirname(fileURLToPath(import.meta.url));
const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.dot')).sort();

for (const file of files) {
  const source = await fs.readFile(path.join(directory, file), 'utf8');
  const engine = source.includes('// engine: neato') ? 'neato' : 'dot';
  const result = viz.render(source, { format: 'svg', engine });
  // WASM Graphviz reports estimated widths for some Unicode characters.
  // Arial glyphs are supplied by the PNG renderer. Inspect exported labels visually.
  const errors = result.errors.filter(({ message }) => !message.includes('width of non-ASCII character'));
  if (result.status !== 'success' || errors.length > 0) {
    throw new Error(`${file}: ${JSON.stringify(result.errors)}`);
  }
  const stem = path.join(directory, path.basename(file, '.dot'));
  await fs.writeFile(`${stem}.svg`, result.output, 'utf8');
  const png = await sharp(Buffer.from(result.output), { density: 144 })
    .flatten({ background: '#ffffff' }).png().toBuffer();
  await fs.writeFile(`${stem}.png`, png);
  const { width, height } = await sharp(png).metadata();
  console.log(`${file} -> ${width} x ${height} PNG`);
}
