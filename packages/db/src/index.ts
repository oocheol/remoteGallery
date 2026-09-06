import { PGlite, type Transaction } from '@electric-sql/pglite';

/**
 * The embedded database is intentionally opened only by the Next.js process.
 * The standalone worker communicates through internal HTTP routes, never this
 * module, because PGlite's on-disk store is single-process.
 */
type DatabaseGlobal = typeof globalThis & { __galleryTwinDatabase?: Promise<PGlite> };
const globalDatabase = globalThis as DatabaseGlobal;

export type SqlDatabase = PGlite;

export function databaseDirectory() {
  return process.env.GALLERY_DB_DIR || '.gallery-twin/pglite';
}

export async function getDatabase(): Promise<SqlDatabase> {
  if (!globalDatabase.__galleryTwinDatabase) {
    globalDatabase.__galleryTwinDatabase = (async () => {
      const db = new PGlite(databaseDirectory());
      await db.waitReady;
      await migrate(db);
      return db;
    })();
  }
  return globalDatabase.__galleryTwinDatabase;
}

export async function migrate(db: SqlDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS galleries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      source_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scenes (
      gallery_id TEXT PRIMARY KEY REFERENCES galleries(id) ON DELETE CASCADE,
      scene JSONB NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artworks (
      id TEXT PRIMARY KEY,
      gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
      artwork JSONB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      role TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      public_derivative BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS exhibitions (
      id TEXT PRIMARY KEY,
      gallery_id TEXT NOT NULL UNIQUE REFERENCES galleries(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      placements JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      asset_ids JSONB NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      error JSONB,
      scene_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      lease_until TEXT,
      worker_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_queue_idx ON jobs(status, updated_at);
    CREATE TABLE IF NOT EXISTS shares (
      token TEXT PRIMARY KEY,
      exhibition_id TEXT NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,
      gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
      snapshot JSONB NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS owner_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
}

export async function withTransaction<T>(fn: (db: Transaction) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  // Native PGlite transaction queues concurrent queries behind the callback.
  return db.transaction(fn);
}
