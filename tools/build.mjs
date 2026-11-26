import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const template = readFileSync('src/template.html', 'utf8');

// Each entry becomes (a) an artifact fragment for publishing and (b) a standalone page to open locally.
const entries = [
  { name: 'lab',  src: 'src/lab/main.js',  css: 'src/style.css', title: 'Blob Shooter Lab', fragment: 'dist/game.html',          full: 'dist/index.html', minify: false },
  { name: 'hero', src: 'src/hero/main.js', css: 'src/hero/hero.css', title: 'Blob Shooter', fragment: 'dist/hero-artifact.html', full: 'dist/hero.html',  minify: true },
];
for (const e of entries) {
  const out = await build({ entryPoints: [e.src], bundle: true, format: 'esm', minify: e.minify, write: false, target: 'es2022', legalComments: 'none', loader: { '.glb': 'binary' } });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const page = template.replace('Blob Shooter Lab', e.title).replace('/*__CSS__*/', () => readFileSync(e.css, 'utf8')).replace('/*__JS__*/', () => js);
  writeFileSync(e.fragment, page);
  writeFileSync(e.full, '<!doctype html><html lang="en"><head><meta charset="utf-8">' + page + '</body></html>');
  console.log('built', e.name, Math.round(page.length / 1024) + ' KB');
}
