import postgres, { type Sql } from 'postgres';
import type { GatewayConfig } from '../config.js';

/** The pool: owns connections, transactions, and LISTEN. */
export type Db = Sql;

/**
 * Anything that can run a query — the pool or an open transaction. Helpers take
 * this so the same function works inside and outside `db.begin(...)`, which is
 * what lets StopTransaction close a session and write its final meter values
 * atomically without duplicating every query.
 */
export type Queryable = postgres.ISql;

export function createDb(config: GatewayConfig): Db {
  return postgres(config.DATABASE_URL, {
    max: config.databaseMaxConnections,
    // pgcrypto lives in `extensions` on hosted Supabase and in `public`
    // locally; naming both keeps crypt()/gen_salt() resolvable either way.
    connection: { search_path: 'public, extensions' },
    // postgres.js logs every NOTICE by default, which is noise from our
    // guarded DO blocks.
    onnotice: () => {},
    transform: { undefined: null },
  });
}
