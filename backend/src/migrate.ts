import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

class MigrationError extends Error {}

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MigrationError('DATABASE_URL is required.');

  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (files.length === 0) throw new MigrationError('No SQL migrations found.');

  const migrations = await Promise.all(files.map(async name => {
    const sql = (await readFile(new URL(name, directory), 'utf8')).replace(/\r\n/g, '\n');
    const checksum = createHash('sha256').update(sql).digest('hex');
    return { name, sql, checksum };
  }));

  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, statement_timeout: 120_000 });
  try {
    await client.connect();
    await client.query('SELECT pg_advisory_lock(87234811, 1)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(rows.map(row => [row.name, row.checksum]));
    for (const [name, checksum] of applied) {
      if (migrations.find(migration => migration.name === name)?.checksum !== checksum) {
        throw new MigrationError('Applied migration history differs from local SQL files.');
      }
    }

    for (const { name, sql, checksum } of migrations) {
      if (applied.has(name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        const code = typeof error === 'object' && error !== null && 'code' in error &&
          typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? ` (${error.code})` : '';
        throw new MigrationError(`Migration ${name} failed${code}.`, { cause: error });
      }
      console.log(`Applied ${name}.`);
    }
    console.log('Database migrations are up to date.');
  } finally {
    // Closing the connection releases the session-scoped advisory lock.
    await client.end();
  }
}

try {
  await migrate();
} catch (error) {
  console.error(error instanceof MigrationError ? error.message : 'Could not prepare database migrations.');
  process.exitCode = 1;
}
