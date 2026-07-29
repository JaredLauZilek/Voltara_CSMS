import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // Integration tests share one database and one set of seeded chargers, so
    // they must not run concurrently: in parallel, one file's cleanup deletes
    // another file's rows mid-assertion. (That is exactly how the command-bus
    // timeout test first "failed" — its row was removed by a sibling file.)
    // Correctness over wall-clock here; the whole suite still runs in ~40s.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
