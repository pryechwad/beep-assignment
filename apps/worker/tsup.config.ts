import { defineConfig } from 'tsup';

// Worker and scheduler are separate entry points (separate long-running processes).
export default defineConfig({
  entry: ['src/worker.ts', 'src/scheduler.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@beep\//],
  external: ['@prisma/client', '.prisma/client'],
  // Bundled CommonJS dependencies (e.g. pino internals) call require(); give the ESM bundle a real one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
