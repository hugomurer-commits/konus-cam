// Junta o servidor num único arquivo (dist/servidor.mjs). better-sqlite3 fica de fora
// porque tem parte nativa: vai junto como pasta em node_modules no instalador.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/servidor.mjs',
  external: ['better-sqlite3'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
