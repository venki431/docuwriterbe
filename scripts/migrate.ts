import fs from 'fs';
import path from 'path';
import { pool } from '../src/db/pool';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

async function ensureSchemaMigrationsTable(): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function alreadyAppliedNames(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>(
    `select name from schema_migrations`,
  );
  return new Set(rows.map((r) => r.name));
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      `insert into schema_migrations (name) values ($1)`,
      [filename],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await ensureSchemaMigrationsTable();
  const applied = await alreadyAppliedNames();
  const all = listMigrationFiles();

  const pending = all.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`[migrate] nothing to do — ${all.length} migration(s) already applied.`);
    await pool.end();
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s): ${pending.join(', ')}`);

  for (const filename of pending) {
    const started = Date.now();
    try {
      await applyMigration(filename);
      console.log(`[migrate] ✓ ${filename} (${Date.now() - started}ms)`);
    } catch (err) {
      console.error(`[migrate] ✗ ${filename} — rolled back`);
      throw err;
    }
  }

  console.log(`[migrate] done — applied ${pending.length} migration(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
