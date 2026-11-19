# PlantCare AI

[Kho mã nguồn GitHub](https://github.com/Hoanglamksss/PlantCare-AI) · Nhánh chính `main`.

Ứng dụng web theo dõi cà chua, dưa leo, ớt, húng quế và bạc hà, xem dấu hiệu trên lá, trao đổi trong vườn cộng đồng và hỏi cách chăm cây tại nhà.

**Trạng thái · Bản 0.5 đã kiểm tra local.** Có hồ sơ cây, nhật ký nhiều ảnh, cộng đồng nhiều bài với bình luận ảnh/trả lời/cảm xúc, hồ sơ cá nhân và trang Admin. Lịch chăm sóc lưu trên PostgreSQL, tạo thông báo trong app theo giờ Việt Nam. Bộ sàng lọc Python dựa trên vùng vàng và đốm sẫm; mô hình nhận diện từng bệnh cần dữ liệu gán nhãn và đánh giá độc lập. [Snapshot bàn giao ngắn](docs/02-phat-trien/trang-thai.md) ghi rõ bằng chứng đã có và phần còn mở.

**Giao diện.** Nền kem, xanh trầm, thẻ bo tròn và màu nhấn theo hoạt động. Menu có Vườn cây, Đặt lịch, Chẩn đoán, Trợ lý AI và Cộng đồng; Hồ sơ mở từ header, Admin chỉ hiện với tài khoản có quyền. Lịch cũ trong trình duyệt được nhập lên server bằng khóa chống trùng. [Ghi chú thiết kế](docs/05-prompt/giao-dien-18-11.md)

[API thực tế](docs/03-kien-truc/api.md) · [Cộng đồng và quyền riêng tư](docs/03-kien-truc/cong-dong.md) · [Sơ đồ bản 0.5](docs/07-so-do/README.md) · [Cách tích hợp AI](docs/03-kien-truc/tich-hop-ai.md) · [Triển khai VPS](deploy/README.md)

## Chạy bản local

Cần Node.js 22.12 trở lên và Docker Desktop đang chạy Linux containers. Lần dựng đầu tải các image nền và biên dịch MinIO từ bản nguồn đã ghim. Từ thư mục `plantcare-ai`, chạy:

```powershell
node scripts/setup-local.mjs
docker compose up --build -d --wait
```

- Mở [PlantCare AI](http://localhost:8080). Đăng nhập để dùng Vườn cây, Đặt lịch, Chẩn đoán, Trợ lý AI và Cộng đồng. Nút chia sẻ trong hồ sơ cây mở bài đăng có ảnh cho đúng cây đó.
- Mở [Swagger UI](http://localhost:8080/docs) hoặc [OpenAPI JSON](http://localhost:8080/openapi.json) trên cùng địa chỉ `localhost`. Dùng phiên đăng nhập trên trình duyệt và lấy `csrfToken` từ `GET /auth/me` cho các thao tác ghi. [Các bước kiểm tra Swagger](docs/06-kiem-thu/swagger.md)
- Chạy `node scripts/smoke-local.mjs` để kiểm tra với hai tài khoản giả trên cơ sở dữ liệu local. Lệnh tạo dữ liệu mẫu để đối chiếu phân quyền.
- Chạy `node scripts/smoke-community.mjs` để kiểm tra bài đăng, ảnh, bình luận phân cấp, cảm xúc và thu hồi quyền. Xem các kịch bản mới cùng [biên bản kiểm thử](docs/06-kiem-thu/bien-ban.md) trước khi ghi nghiệm thu 0.5.
- Chạy `node scripts/smoke-admin-schedules.mjs` để kiểm tra quyền quản trị, lịch và thông báo bằng tài khoản giả. Cấp quyền Admin cho tài khoản đã đăng ký bằng `docker compose exec backend /usr/local/bin/plantcare-entrypoint node dist/modules/admin/bootstrap.js --email EMAIL_DA_DANG_KY`, rồi đăng nhập lại và mở `#admin`.
- Dừng bằng `docker compose down`. Dữ liệu PostgreSQL và MinIO nằm trong Docker volumes. Tệp bí mật local được tạo trong `.secrets/` và nằm ngoài danh sách tệp Git theo dõi.

## Mã nguồn

| Thành phần | Nội dung |
| --- | --- |
| [frontend](frontend/package.json) | React, Vite và Nginx phục vụ giao diện cùng origin với API |
| [backend](backend/package.json) | Express/TypeScript Modular Monolith với xác thực, hồ sơ, cây, nhật ký, cộng đồng, sàng lọc ảnh, chatbot, quản trị và lịch/thông báo |
| [Migration](docs/04-du-lieu/README.md) | `0001`–`0011`, gồm cộng đồng nhiều bài, audit quản trị và lịch/thông báo PostgreSQL |
| [Docker Compose](compose.yaml) | Frontend, backend, PostgreSQL, MinIO, Python nội bộ và tác vụ khởi tạo |

Ảnh minh họa Trang chủ được tạo bằng công cụ tạo ảnh tích hợp. [Ảnh giàn dưa leo](frontend/src/assets/balcony-cucumber.webp) mô tả quả và lá trên giàn tre ở ban công có nắng. [Ảnh bộ ba cây chậu](frontend/src/assets/kitchen-garden.webp) mô tả ớt đỏ, húng quế và bạc hà ở ba khung ảnh liền nhau trong ánh sáng tự nhiên.

## Tài liệu dự án

| Thư mục | Nội dung |
| --- | --- |
| [01 · Giới thiệu](docs/01-gioi-thieu/README.md) | Tóm tắt dự án, nghiệp vụ, luồng xử lý, kiến trúc và sequence diagram |
| [02 · Quá trình phát triển](docs/02-phat-trien/README.md) | Tiến độ, các mốc, phân công và yêu cầu CLO1/CLO2 |
| [03 · Kiến trúc](docs/03-kien-truc/README.md) | Sơ đồ hệ thống, luồng chẩn đoán, [API](docs/03-kien-truc/api.md) và [triển khai](docs/03-kien-truc/trien-khai.md) |
| [04 · Dữ liệu](docs/04-du-lieu/README.md) | ERD v2, [ràng buộc SQL](docs/04-du-lieu/rang-buoc.md) và vòng đời ảnh |
| [05 · Prompt cho AI agent](docs/05-prompt/README.md) | Prompt bắt đầu, phạm vi tài liệu cần đọc và cách bàn giao |
| [06 · Kiểm thử](docs/06-kiem-thu/README.md) | Swagger, luồng test, hiệu năng, phục hồi và kiểm thử chéo |
| [07 · Ảnh sơ đồ](docs/07-so-do/README.md) | PNG hệ thống, ERD, use case và sequence, kèm nguồn DOT/SVG |

## Các điểm cần duyệt

1. [Phạm vi MVP](docs/01-gioi-thieu/README.md). Bản local hiện hỗ trợ năm loài để sàng lọc dấu hiệu; mô hình phân loại bệnh vẫn là định hướng.
2. [Sơ đồ hệ thống](docs/03-kien-truc/README.md). React, Node.js Modular Monolith, PostgreSQL, Python và R2/MinIO.
3. [Sơ đồ dữ liệu](docs/04-du-lieu/README.md). Hai quyền User và Admin, hồ sơ cây thuộc User, chẩn đoán có thể gắn vào hồ sơ hoặc thực hiện riêng.
4. [Kiến trúc VPS và CI/CD](docs/03-kien-truc/trien-khai.md) cùng [kế hoạch kiểm thử](docs/06-kiem-thu/README.md). Các ngưỡng tải và phục hồi sẽ được đo trên cấu hình thử nghiệm.

AI agent bắt đầu ở [AGENTS.md](AGENTS.md), rồi mở [trạng thái bàn giao](docs/02-phat-trien/trang-thai.md). Chỉ đọc [lịch sử cũ](docs/02-phat-trien/lich-su-phien.md) khi cần truy lại quyết định; hợp đồng hiện tại ở [API](docs/03-kien-truc/api.md) và [migration](docs/04-du-lieu/README.md).
