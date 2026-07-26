import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  // Workspace packages ship TS source, so they must be bundled in; real npm
  // deps (pino, later ocpp-rpc/postgres) stay external and come from the
  // pruned node_modules that `pnpm deploy` puts in the Docker image.
  noExternal: ['@voltara/shared'],
  clean: true,
  sourcemap: true,
});
