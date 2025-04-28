import { build } from "esbuild";
import { readFile } from "fs/promises";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url))
);

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  // Add Node.js built-in modules that are used
  'path',
  'fs',
  'https',
  'url',
  'crypto',
  'stream',
  'util',
  'events',
  'http',
  'net',
  'tls',
  'zlib'
];

const sharedConfig = {
  entryPoints: ["index.js"],
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  external,
  loader: { '.js': 'jsx' },
  format: 'esm',
  outbase: '.',
  banner: {
    js: `
      import { createRequire } from 'module';
      import { fileURLToPath } from 'url';
      import { dirname } from 'path';
      
      const require = createRequire(import.meta.url);
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
    `
  }
};

async function buildAll() {
  try {
    await build({
      ...sharedConfig,
      format: 'esm',
      outdir: 'dist',
    });

    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

buildAll();