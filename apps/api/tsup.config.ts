import { defineConfig } from 'tsup';

// Bundle the API + its @beep/* workspace packages (TypeScript sources) into plain Node ESM.
// npm dependencies stay external and are installed in the runtime image.
export default defineConfig({
  entry: ['src/server.ts'],
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
