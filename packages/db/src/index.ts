import { PGlite } from "@electric-sql/pglite";

export interface SqlConnection {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; affectedRows?: number }>;
  exec(sql: string): Promise<unknown>;
}
export interface SqlDatabase extends SqlConnection {
  transaction<T>(fn: (db: SqlConnection) => Promise<T>): Promise<T>;
}
type DatabaseGlobal = typeof globalThis & {
  __galleryTwinDatabase?: Promise<SqlDatabase>;
};
const globalDatabase = globalThis as DatabaseGlobal;
export function databaseDirectory() {
  return process.env.GALLERY_DB_DIR || ".gallery-twin/pglite";
}
export async function getDatabase(): Promise<SqlDatabase> {
  if (!globalDatabase.__galleryTwinDatabase) {
    globalDatabase.__galleryTwinDatabase = (async () => {
      if (process.env.GALLERY_CLOUD === "1") {
        if (!process.env.DATABASE_URL)
          throw new Error("DATABASE_URL is required in cloud mode");
        const { Pool } = await import("pg");
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 3,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 15000,
          allowExitOnIdle: true,
        });
        const db: SqlDatabase = {
          query: async <T>(sql: string, params?: unknown[]) =>
            ((r) => ({ rows: r.rows as T[], affectedRows: r.rowCount ?? 0 }))(
              await pool.query(sql, params),
            ),
          exec: (sql) => pool.query(sql),
          transaction: async (fn) => {
            const client = await pool.connect();
            try {
              await client.query("BEGIN");
              // Preserve local single-writer semantics across serverless instances.
              await client.query("SELECT pg_advisory_xact_lock(71290461)");
              const result = await fn({
                query: async <T>(sql: string, params?: unknown[]) =>
                  ((r) => ({
                    rows: r.rows as T[],
                    affectedRows: r.rowCount ?? 0,
                  }))(await client.query(sql, params)),
                exec: (sql) => client.query(sql),
              });
              await client.query("COMMIT");
              return result;
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            } finally {
              client.release();
            }
          },
        };
        await db.transaction(async (connection) => {
          await migrate(connection);
        });
        return db;
      }
      const db = new PGlite(databaseDirectory());
      await db.waitReady;
      await migrate(db);
      return db;
    })().catch((error) => {
      globalDatabase.__galleryTwinDatabase = undefined;
      throw error;
    });
  }
  return globalDatabase.__galleryTwinDatabase;
}

export async function migrate(db: SqlConnection) {
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
    CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS owner_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
}

export async function withTransaction<T>(
  fn: (db: SqlConnection) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  // Native PGlite transaction queues concurrent queries behind the callback.
  return db.transaction(fn);
}
