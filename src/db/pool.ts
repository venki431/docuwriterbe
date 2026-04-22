import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

if (!config.db.url) {
  // eslint-disable-next-line no-console
  console.warn('[db] DATABASE_URL is not set. Database calls will fail at runtime.');
}

export const pool = new Pool({
  connectionString: config.db.url,
  // Supabase pooler requires SSL. Disable with DATABASE_SSL=false for local Postgres.
  ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] pool error', err);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as unknown[] | undefined);
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
