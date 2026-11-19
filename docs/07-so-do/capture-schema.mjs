import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
const query = `
  SELECT json_build_object(
    'version', '0.5', 'migrations', '0001–0011',
    'tables', (
      SELECT json_agg(json_build_object('name', table_name, 'columns', columns) ORDER BY table_name)
      FROM (
        SELECT table_info.relname AS table_name,
          json_agg(json_build_object(
            'name', attribute.attname,
            'type', format_type(attribute.atttypid, attribute.atttypmod),
            'nullable', NOT attribute.attnotnull,
            'identity', attribute.attidentity <> '',
            'generated', attribute.attgenerated <> '',
            'primary', EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = table_info.oid
              AND c.contype = 'p' AND attribute.attnum = ANY(c.conkey)),
            'foreign', EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = table_info.oid
              AND c.contype = 'f' AND attribute.attnum = ANY(c.conkey)),
            'unique', EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = table_info.oid
              AND c.contype = 'u' AND attribute.attnum = ANY(c.conkey)),
            'uniqueSingle', EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = table_info.oid
              AND c.contype = 'u' AND array_length(c.conkey, 1) = 1 AND attribute.attnum = ANY(c.conkey))
          ) ORDER BY attribute.attnum) AS columns
        FROM pg_class table_info JOIN pg_namespace namespace ON namespace.oid = table_info.relnamespace
        JOIN pg_attribute attribute ON attribute.attrelid = table_info.oid
        WHERE namespace.nspname = 'public' AND table_info.relkind = 'r'
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
        GROUP BY table_info.oid
      ) table_data
    ),
    'relationships', (
      SELECT json_agg(json_build_object(
        'parent', parent.relname, 'child', child.relname,
        'columns', (SELECT json_agg(attribute.attname ORDER BY position.ordinality)
          FROM unnest(fk.conkey) WITH ORDINALITY position(attnum, ordinality)
          JOIN pg_attribute attribute ON attribute.attrelid = fk.conrelid AND attribute.attnum = position.attnum),
        'optional', EXISTS (SELECT 1 FROM pg_attribute attribute WHERE attribute.attrelid = fk.conrelid
          AND attribute.attnum = ANY(fk.conkey) AND NOT attribute.attnotnull),
        'unique', EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = fk.conrelid
          AND c.contype IN ('u', 'p') AND c.conkey <@ fk.conkey)
      ) ORDER BY parent.relname, child.relname, fk.conname)
      FROM pg_constraint fk JOIN pg_class parent ON parent.oid = fk.confrelid
      JOIN pg_class child ON child.oid = fk.conrelid
      JOIN pg_namespace namespace ON namespace.oid = child.relnamespace
      WHERE fk.contype = 'f' AND namespace.nspname = 'public'
    )
  ) AS snapshot
`;

const code = `import { Client } from 'pg';
const db = new Client({connectionString:process.env.DATABASE_URL});
try { await db.connect(); const result = await db.query(${JSON.stringify(query)}); console.log(JSON.stringify(result.rows[0].snapshot)); }
finally { await db.end(); }`;
const output = execFileSync('docker', ['compose', 'exec', '-T', 'backend', '/usr/local/bin/plantcare-entrypoint',
  'node', '--input-type=module', '-'], { cwd: project, input: code, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const snapshot = JSON.parse(output);
await writeFile(new URL('./schema-snapshot.json', import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Captured ${snapshot.tables.length} public tables, schema metadata only.`);
