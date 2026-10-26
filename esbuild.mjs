import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

// KaTeX styles name three font formats for each font. The page needs only woff2,
// so the other two become empty files. The woff2 files go to dist/fonts.
const katexFonts = {
  name: 'katex-fonts',
  setup(build) {
    build.onResolve({ filter: /\.(woff|ttf)(\?.*)?$/ }, (args) => ({ path: args.path, namespace: 'skipped-font' }));
    build.onLoad({ filter: /.*/, namespace: 'skipped-font' }, () => ({ contents: '', loader: 'dataurl' }));
  },
};

const configs = [
  {
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: ['webview/main.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    loader: { '.woff2': 'file' },
    assetNames: 'fonts/[name]',
    plugins: [katexFonts],
  },
];

// The mermaid script is 5 MB, so it is a separate file. The page loads it only when a diagram needs it.
function copyMermaid() {
  mkdirSync('dist', { recursive: true });
  copyFileSync('node_modules/mermaid/dist/mermaid.min.js', 'dist/mermaid.js');
}

if (watch) {
  copyMermaid();
  const contexts = await Promise.all(configs.map((config) => context(config)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(configs.map((config) => build(config)));
  copyMermaid();
}
