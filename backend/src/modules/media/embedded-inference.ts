import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const address = 'http://127.0.0.1:8000';

export async function startEmbeddedInference(onFailure: () => void): Promise<ChildProcess | undefined> {
  if (process.env.PLANTCARE_EMBED_INFERENCE !== '1' || process.env.INFERENCE_URL) return;

  const child = spawn('/opt/plantcare-inference/bin/python', ['/app/inference/app.py'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      SCREENING_BIND_HOST: '127.0.0.1',
      SCREENING_SLOTS: '1',
      OPENBLAS_NUM_THREADS: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });

  let ready = false;
  let failed = false;
  function onExit() {
    failed = true;
    if (ready) onFailure();
  }
  child.once('error', onExit);
  child.once('exit', onExit);

  const deadline = Date.now() + 15_000;
  while (!failed && Date.now() < deadline) {
    const response = await fetch(`${address}/health`, { signal: AbortSignal.timeout(750) }).catch(() => undefined);
    const health = await response?.json().catch(() => undefined);
    if (!failed && response?.ok && health?.status === 'ok') {
      ready = true;
      console.log('[screening] embedded_python_ready');
      if (process.env.S3_ENDPOINT) process.env.INFERENCE_URL = address;
      else console.log('[screening] storage_not_configured');
      return child;
    }
    if (!failed) await delay(200);
  }

  stopEmbeddedInference(child);
  console.error('[screening] embedded_python_startup_failed');
  throw new Error('Embedded Python did not become ready.');
}

export function stopEmbeddedInference(child?: ChildProcess): void {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const timeout = setTimeout(() => child.kill('SIGKILL'), 3_000);
  timeout.unref();
  child.once('exit', () => clearTimeout(timeout));
  child.kill('SIGTERM');
}
