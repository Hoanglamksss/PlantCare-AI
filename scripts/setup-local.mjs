import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../.secrets/', import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });

for (const filename of ['postgres_password', 'csrf_secret', 'minio_password']) {
  const file = new URL(filename, directory);
  try {
    // Compose mounts these read-only for unprivileged containers. The parent directory is private.
    await writeFile(file, `${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o644 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await readFile(file, 'utf8');
    if (!/^[0-9a-f]{64}\r?\n?$/.test(existing)) {
      throw new Error(`Invalid local secret file: ${filename}. Existing files were preserved.`);
    }
  }
}

console.log('Đã chuẩn bị cấu hình bí mật cho môi trường local.');
