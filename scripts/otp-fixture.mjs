import { execFileSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));

export function fixtureEmailProof(email, subject = '', { expired = false } = {}) {
  if (!email.endsWith('@example.test')) throw new Error('OTP fixtures require example.test addresses.');
  const purpose = subject ? 'change' : 'register';
  const challengeId = randomUUID();
  const code = String(randomInt(1_000_000)).padStart(6, '0');
  const fixture = `import { createHmac } from 'node:crypto';
    import { Client } from 'pg';
    if (process.env.NODE_ENV !== 'development') throw new Error('Use the local Compose stack.');
    const payload = ${JSON.stringify(['account-email', purpose, subject, email, challengeId, code])};
    const digest = createHmac('sha256', process.env.CSRF_SECRET.trim()).update(JSON.stringify(payload)).digest('hex');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      await client.query("INSERT INTO account_email_challenges (id, purpose, subject, email, code_digest, expires_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6::int))",
        [payload[4], payload[1], payload[2], payload[3], digest, ${expired ? -1 : 10}]);
    } finally { await client.end(); }`;
  execFileSync('docker', ['compose', 'exec', '-T', 'backend', '/usr/local/bin/plantcare-entrypoint',
    'node', '--input-type=module', '-'], { cwd: project, input: fixture, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] });
  return { challengeId, code };
}
