import { Client } from 'pg';

async function main() {
  const [option, value, ...extra] = process.argv.slice(2);
  const email = value?.trim().toLowerCase();
  if (option !== '--email' || !email || extra.length || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Cách dùng: node dist/modules/admin/bootstrap.js --email <email-tài-khoản-đã-đăng-ký>');
  }
  if (!process.env.DATABASE_URL) throw new Error('Cần cấu hình DATABASE_URL để cấp quyền quản trị.');
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000, statement_timeout: 15_000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(87234811, 2)');
    const { rows: [account] } = await client.query<{ id: string; role: string }>(`
      SELECT id, vai_tro AS role FROM accounts WHERE email = $1 AND yeu_cau_xoa_luc IS NULL FOR UPDATE
    `, [email]);
    if (!account) throw new Error('Không tìm thấy tài khoản đang hoạt động. Hãy đăng ký tài khoản trước.');
    if (account.role !== 'admin') {
      await client.query("UPDATE accounts SET vai_tro = 'admin' WHERE id = $1", [account.id]);
      await client.query('UPDATE sessions SET thu_hoi_luc = clock_timestamp() WHERE tai_khoan_id = $1 AND thu_hoi_luc IS NULL', [account.id]);
      await client.query(`INSERT INTO admin_audit_logs (nguoi_thuc_hien_id, hanh_dong, loai_doi_tuong, doi_tuong_id)
        VALUES (NULL, 'grant_admin', 'account', $1)`, [account.id]);
    }
    await client.query('COMMIT');
    console.log('Đã xác nhận quyền quản trị. Đăng nhập lại để sử dụng trang quản trị.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Không thể cấp quyền quản trị. Kiểm tra kết nối và migration.');
  process.exitCode = 1;
}
