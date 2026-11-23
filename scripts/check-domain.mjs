const input = process.argv[2] ?? 'https://www.plantcare.io.vn';
const origin = new URL(input);
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password
  || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('Expected a site origin without a path, such as https://www.plantcare.io.vn');
}

async function check(path, options, status, code) {
  const response = await fetch(new URL(path, origin), {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null);
  if (response.status !== status || body?.code !== code) {
    throw new Error(`${path}: expected ${status} ${code}, got ${response.status} ${body?.code ?? '(no API error code)'}`);
  }
  console.log(`PASS ${path} → ${status} ${code}`);
}

async function checkLogin(originHeader, status, code) {
  await check('/api/v1/auth/login', {
    method: 'POST',
    headers: { Origin: originHeader, 'Content-Type': 'application/json' },
    body: '{}',
  }, status, code);
}

await check('/api/v1/auth/me', undefined, 401, 'AUTH_REQUIRED');
await checkLogin(origin.origin, 400, 'INVALID_INPUT');
await checkLogin('https://untrusted.example.invalid', 403, 'ORIGIN_FORBIDDEN');
