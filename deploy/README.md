# Đưa PlantCare AI lên VPS

Bộ cấu hình này đã được chuẩn bị để triển khai. Chưa có tên miền, VPS, khóa R2 và chứng chỉ thật nên chưa phát hành online. Chạy local vẫn dùng `compose.yaml`, không dùng bộ cấu hình production.

## Chuẩn bị lần đầu

1. Chuẩn bị VPS Linux có Docker Engine, Compose v2, OpenSSL, Git, `flock` của util-linux và bộ nhớ phù hợp. Bắt đầu với 2 vCPU/4 GB RAM, đo tải trước khi công bố số người dùng phục vụ. Bật Docker cùng hệ điều hành. Chỉ công khai 443, giới hạn SSH và giới hạn cổng web cho Cloudflare tại firewall của nhà cung cấp. Không mở PostgreSQL, Python hoặc Node API ra Internet.
2. Chuyển DNS sang Cloudflare, tạo bản ghi A của ứng dụng trỏ VPS, bật proxy. Tạo Origin CA Certificate đúng hostname, chọn SSL/TLS **Full (strict)** và bật Always Use HTTPS tại Edge. [Hướng dẫn Cloudflare](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/) · [Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
3. Tạo bucket R2 riêng tư. Tạo thông tin xác thực S3 chỉ cho bucket ứng dụng, với quyền đọc/ghi/xóa ảnh. Không bật public bucket. [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/)
4. Đưa source lên VPS, chạy từ thư mục gốc:

```sh
sh scripts/prepare-production.sh
```

Điền hostname và endpoint/bucket trong `.env.production`. Đặt dữ liệu thật vào các file sau, không chèn vào source, tài liệu hay lệnh shell được lưu lịch sử:

| File trong `.secrets/production/` | Nội dung |
| --- | --- |
| `postgres_password`, `csrf_secret` | Script sinh sẵn, giữ nguyên khi chạy lại |
| `r2_access_key` | Access Key ID của R2 |
| `r2_secret_key` | Secret Access Key của R2 |
| `origin.crt` | Chứng chỉ Origin CA dạng PEM |
| `origin.key` | Private key PEM của chứng chỉ |

Giới hạn quyền đọc `.env.production` cho tài khoản vận hành. Script đặt thư mục `.secrets/production` thành `0700` và file bí mật thành `0444`: thư mục ngăn tài khoản khác trên VPS truy cập, còn file gắn riêng vào container cho phép Node/Nginx chạy không có quyền root đọc cấu hình. Compose gắn bí mật thành file, không mã hóa chúng trên đĩa VPS. Nginx sinh cấu hình vào bộ nhớ tạm do UID 101 sở hữu; không cần quyền root để thay file cấu hình trong image. Không gửi `.secrets`, bản dump hoặc `.env.production` lên Git. Sao lưu khóa và mật khẩu trong kho bí mật của nhóm. [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)

Các dải IP được tin cậy trong Nginx đã đối chiếu với [danh sách IPv4](https://www.cloudflare.com/ips-v4/) và [IPv6](https://www.cloudflare.com/ips-v6/) chính thức ngày 19/11/2026. Trước phát hành, tải lại hai danh sách, đối chiếu các dòng `set_real_ip_from` trong template và cập nhật nếu thay đổi. Script kiểm tra `nginx -t` trước khi chạy dịch vụ mới. Chỉ header IP đến từ các dải này được dùng; firewall VPS vẫn cần giới hạn kết nối origin.

```sh
curl --fail --silent --show-error https://www.cloudflare.com/ips-v4/
curl --fail --silent --show-error https://www.cloudflare.com/ips-v6/
```

## Triển khai và cập nhật

```sh
sh scripts/deploy-production.sh --build
```

Script khóa lượt triển khai bằng `flock`, kiểm tra cấu hình/Nginx, build image rồi đợi PostgreSQL và Python sẵn sàng. Sau đó tạo DB dump, chạy đúng một lượt migration có kiểm tra checksum và đợi ứng dụng khỏe. Khi chạy lại, migration đã áp dụng được bỏ qua; lỗi sao lưu hoặc migration chặn bước khởi động ứng dụng mới. Bản đầu tạo volume PostgreSQL mới, tách khỏi local, và sao lưu DB trước migration đầu tiên. Không chạy `down -v` trên production. Nếu migration lỗi, script dừng để xử lý, không tự xóa hoặc phục hồi dữ liệu.

Khi đã có kho image, điền ba image kèm tag bất biến hoặc digest trong `.env.production`, rồi dùng `--pull`. Workflow mẫu [.github/workflows/containers.yml](../.github/workflows/containers.yml) build/kiểm tra/publish image trên GitHub Container Registry; chưa cấu hình SSH hoặc tự triển khai tới VPS.

Đăng ký tài khoản quản trị bằng giao diện thông thường, sau đó cấp quyền từ VPS:

```sh
docker compose --env-file .env.production -f compose.production.yaml exec backend \
  /usr/local/bin/plantcare-entrypoint node dist/modules/admin/bootstrap.js --email EMAIL_DA_DANG_KY
```

Đăng nhập lại và mở `https://TEN_MIEN/#admin`. Không có mật khẩu Admin mặc định. Bootstrap thu hồi các phiên cũ, chỉ cấp quyền cho tài khoản đang hoạt động. Swagger công khai bị tắt ở production; thử Swagger bằng dữ liệu giả trên local hoặc môi trường staging riêng.

## Kiểm tra sau khi triển khai

- Kiểm tra HTTPS qua hostname Cloudflare, `/health/ready`, đăng ký/đăng nhập, Hồ sơ, quét ảnh, lịch nhắc và thêm/xóa ảnh cộng đồng bằng tài khoản thử riêng.
- Kiểm tra cookie Secure/HttpOnly, chặn user thường truy cập API Admin, ảnh không đọc được sau thu hồi chia sẻ hoặc ẩn bài. Không dùng `curl -k` làm bằng chứng TLS hợp lệ. Origin CA được Edge tin cậy; truy cập IP VPS trực tiếp không phải luồng sử dụng của khách hàng.
- Khởi động lại từng dịch vụ và xác nhận dữ liệu còn nguyên. Theo dõi lỗi, CPU, RAM, dung lượng DB, hàng đợi ảnh và thời gian phản hồi. Đo tải staging trước khi tăng số người dùng. Giới hạn upload, bộ nhớ, connection pool và hàng đợi giảm áp lực nhưng không bảo đảm vô hạn người dùng.
- Lịch chăm sóc dùng giờ Việt Nam UTC+7. Worker lưu nhắc việc trong PostgreSQL, poll mỗi 10 giây; mở chuông trong app để xem. Không có SMS, email hay Web Push trong bản này.

## Sao lưu và phục hồi

Script tạo `backups/*.dump` trước mỗi lần cập nhật DB đang chạy. Đây chỉ là bản sao tại VPS. Lên lịch sao lưu hằng ngày và chuyển bản mã hóa ra kho ngoài VPS, quản lý thời hạn giữ bản sao và thử khôi phục định kỳ. R2 cần chính sách sao lưu/vòng đời riêng cho ảnh; DB dump không chứa file ảnh.

Khi phục hồi, dừng các thao tác ghi và giữ nguyên volume cũ. Tạo PostgreSQL riêng cùng phiên bản, rồi kiểm tra bằng bản dump đã tải xuống:

```sh
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  pg_restore -U plantcare -d TEN_DATABASE_TRONG --no-owner --no-acl < backups/BAN_SAO_LUU.dump
```

Chỉ chuyển ứng dụng sang DB đã kiểm tra sau khi đối chiếu số bản ghi và luồng ảnh. Không hạ image về bản cũ một cách tự động sau migration mới. Sao lưu trước cập nhật, thử phục hồi và chọn phiên bản schema tương thích trước khi rollback.
