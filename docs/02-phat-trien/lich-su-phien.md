# Lịch sử các phiên trước bản 0.5

Tài liệu lưu nguyên bản bàn giao trước khi rút gọn ngày 19/11/2026. Các mô tả trạng thái dưới đây là lịch sử; xem [trạng thái hiện tại](trang-thai.md) khi tiếp tục công việc.

# Trạng thái bàn giao

**Cập nhật 19/11/2026 · Bản local 0.4 với giao diện mới**

- **12/11 · M1.** React, phiên đăng nhập, hồ sơ cây, nhật ký, Swagger, migration ERD v2 và bucket MinIO riêng đã chạy bằng Docker Compose.
- **15/11 · 0.2.** Trang chủ và menu mới, chia sẻ cây tự nguyện, bình luận, chatbot theo chủ đề và luồng sàng lọc ảnh Python. `0002` thêm bảng cộng đồng, `0003` thêm kết quả sàng lọc. Compose báo các dịch vụ khỏe. [Cách chạy](../../README.md#chạy-bản-local)
- **16/11 · 0.3.** Thêm ớt, húng quế và bạc hà, Trang chủ mới, nhật ký ảnh theo ngày cho cả cây đang theo dõi và đã lưu trữ. Hồ sơ cây có lịch sử kiểm tra kèm ảnh. Kết quả và chatbot có gợi ý xử lý tại nhà. Migration `0004` thêm loài và `0005` thêm ảnh nhật ký.
- **16/11 · 0.4.** Cộng đồng xem nhật ký, nhiều ảnh và lịch sử kiểm tra nếu chủ cây bật tùy chọn chia sẻ. Cây đã lưu trữ có thể chia sẻ trực tiếp. Cài đặt hỗ trợ hồ sơ và đổi thông tin đăng nhập. Migration `0006` chuyển ảnh nhật ký cũ sang bảng liên kết, `0007` thêm quyền chia sẻ lịch sử và `0008` thêm hồ sơ tài khoản.
- Mô-đun `media` dùng chung việc tải, chuẩn hóa, lưu và dọn ảnh. Frontend dùng chung camera, xem trước ảnh và hộp thoại chia sẻ. [Kiến trúc hiện tại](../03-kien-truc/README.md)
- Bản 0.3 đã chạy kiểm thử Compose và API cho năm loài, hai nhóm cây, quyền đọc ảnh, chatbot và lịch sử. Trình duyệt đã kiểm tra Trang chủ 390 px và đường dẫn Húng quế từ chatbot sang màn quét.
- Bản 0.4 đã nâng cấp trên Compose local. PostgreSQL áp dụng `0006`–`0008`, các dịch vụ khỏe và TypeScript đạt. `node scripts/smoke-local.mjs` kiểm tra hồ sơ, ảnh đại diện riêng, thu hồi phiên, nhật ký hai ảnh và bật/tắt quyền đọc lịch sử bằng hai tài khoản thử. Trình duyệt đã mở màn Cài đặt, biểu mẫu đổi thông tin đăng nhập và Swagger 0.4.0.
- Mô hình nhận diện từng loại sâu/bệnh, kiểm thử camera vật lý, kiểm định ảnh thực địa, API quản trị và phát hành VPS/Cloudflare/R2 vẫn mở. [Lộ trình](README.md) · [Nhật ký quyết định](quyet-dinh.md)

## Thiết kế lịch chăm sóc và thông báo — chờ phê duyệt

- Repository audit đã xác nhận nền tảng Express/TypeScript, PostgreSQL, phiên server-side, Origin/CSRF, `care_logs` và worker chẩn đoán PostgreSQL-backed.
- `care_logs.hoat_dong` hiện dùng `watering`, `fertilizing`, `observation`; `pruning`, `repotting`, `custom` và các mối quan hệ occurrence/chăm sóc cần migration mới khi được duyệt.
- Đã lập đề xuất bảng `care_schedules`, `care_occurrences`, `notifications`, `notification_preferences`, `push_subscriptions`, worker riêng, API, UX, kiểm thử và lộ trình triển khai.
- Giai đoạn này chỉ cập nhật tài liệu; chưa sửa migration, chưa thay database, chưa chạy migration và chưa triển khai code.
- Tài liệu liên quan: [Kiến trúc](../03-kien-truc/README.md), [API](../03-kien-truc/api.md), [dữ liệu](../04-du-lieu/README.md), [ràng buộc](../04-du-lieu/rang-buoc.md), [vòng đời dữ liệu](../04-du-lieu/vong-doi-du-lieu.md), [kiểm thử](../06-kiem-thu/README.md).
- Bước tiếp theo: phê duyệt D17/D18 và chi tiết recurrence, rồi triển khai theo Phase 1–7; chưa tự động tiếp tục implementation.


## Cập nhật 18/11/2026 — Giao diện hồ sơ

- Thanh điều hướng dùng icon người và mục Hồ sơ (`#profile`); liên kết `#settings` cũ vẫn mở đúng trang. Avatar trên header hiển thị cả trên mobile.
- Hồ sơ dùng API hiện có để sửa tên, ảnh đại diện, email, mật khẩu và đăng xuất.
- Chuyển các khối, biểu mẫu, nút và thẻ sang góc vuông; giữ hình tròn cho avatar và hình dạng lá trang trí. Đổi bảng màu toàn app sang xanh tươi, nền trắng và xanh nhạt.
- Kiểm tra: frontend TypeScript và build Vite thành công. Docker Desktop chưa chạy nên chưa kiểm tra lại trực tiếp luồng API và giao diện trong trình duyệt.
- Bước tiếp theo: mở Docker Desktop, chạy Compose và kiểm tra Hồ sơ trên desktop/mobile với tài khoản thử.
- Đã khởi động lại bằng `docker compose up --build -d --wait` ngày 18/11. Frontend mới build thành công, các dịch vụ khỏe. Trang chủ, `/health/ready` và `/docs/` đều trả HTTP 200. Kiểm tra tương tác Hồ sơ trên desktop/mobile vẫn là bước tiếp theo.

## Thiết kế theo ảnh chín màn hình ngày 18/11/2026

- Thiết kế mới theo mẫu người dùng cung cấp thay thế bảng màu và góc vuông của lượt cập nhật trước. Nền kem, xanh trầm, DM Sans và thẻ bo tròn áp dụng cho đăng nhập, đăng ký, Trang chủ, cây, nhật ký, chụp/kết quả, chatbot, cộng đồng và hồ sơ.
- Menu mobile có Vườn cây, Chẩn đoán, Trợ lý AI, Cộng đồng và Hồ sơ. Trang chủ lấy cây, nhật ký và lần kiểm tra thật từ API, nút thêm mở trực tiếp biểu mẫu. `PlantPhoto` dùng chung ảnh minh họa loài cây. Các màn có CSS theo chức năng, loại bỏ `features.css` cũ.
- Đăng ký có tên hiển thị, được kiểm tra bằng cùng schema hồ sơ và lưu trong giao dịch tạo tài khoản. Đăng ký trùng giữ nguyên hồ sơ.
- Frontend/backend TypeScript và build Docker đạt. Compose báo các dịch vụ khỏe. Smoke test bằng hai tài khoản giả đạt các luồng đăng ký có tên, hồ sơ, đổi thông tin đăng nhập, ảnh đại diện, nhiều ảnh nhật ký, chia sẻ/thu hồi lịch sử, chatbot và quyền riêng tư.
- Trình duyệt đã đối chiếu các màn chính ở 390 px và Trang chủ/đăng nhập desktop 1265 px. Đã mở biểu mẫu hồ sơ, thêm cây, kết quả ảnh và thử câu hỏi chatbot. Ô nhập chat nằm trên menu, trang không tràn ngang, console của Trang chủ desktop không có lỗi.
- Camera vật lý và bàn phím trên điện thoại thật cần kiểm tra tiếp. Đăng nhập Google, khôi phục mật khẩu qua email, thông báo đẩy và lịch nhắc chăm sóc cần bổ sung dịch vụ tương ứng. [Ghi chú thiết kế, ảnh và prompt](../05-prompt/giao-dien-18-11.md)

## Cập nhật giao diện đặt lịch 18/11/2026

- Thanh desktop/mobile giảm mục Hồ sơ khỏi thanh điều hướng và thêm `Đặt lịch` ở vị trí thứ hai.
- Hồ sơ và chuông thông báo được đặt ở cụm điều khiển góc phải trên header desktop và mobile.
- Thêm màn `Đặt lịch` với thêm/sửa/tạm dừng/tiếp tục/xóa lịch, lọc tất cả/đang bật/tạm dừng, màu theo loại công việc và hiệu ứng chuyển động khi cho phép trình duyệt.
- Màn lịch hiện lưu dữ liệu frontend local theo tài khoản trình duyệt; API care-scheduling và notification backend chưa triển khai, không coi đây là lịch hệ thống thật.
- Frontend typecheck và build Vite đạt ngày 18/11/2026.

## Đối chiếu mã nguồn, sơ đồ và giao diện ngày 19/11/2026

- Đã đọc lại phiên bản có màn Đặt lịch và thông báo ở header. Lịch vẫn lưu trong trình duyệt theo tài khoản. PostgreSQL local đã áp dụng `0001`–`0008`.
- Lưu bản nháp `0009_community_posts.sql` tại `docs/04-du-lieu/du-thao`. Bản nháp này cùng các thành phần giao diện cộng đồng viết dở chưa được nối thành tính năng bài đăng mới. Khởi động hiện tại dùng các mô-đun đã triển khai.
- Vùng chụp được căn giữa bằng chiều rộng giới hạn và lề tự động. Đã đo hai lề bằng nhau ở bố cục hẹp và rộng. Camera preview cũng giữ nội dung giữa khung.
- Đăng ký và đổi mật khẩu hiển thị thông báo tiếng Việt khi mật khẩu mới dưới 12 hoặc trên 128 ký tự. Giao diện có phản hồi ngay trong ô mật khẩu. Luồng đăng nhập cũ giữ khả năng xác thực tài khoản hiện có.
- Thêm màu nhấn xanh lam cho tưới nước, amber cho lưu trữ/chờ, sage cho chăm sóc và peach cho quan sát. Trang chủ có các màu nhấn theo nhóm chức năng.
- Đã xuất 8 ảnh PNG cùng DOT/SVG tại [thư mục sơ đồ](../07-so-do/README.md), gồm hệ thống, use case, ba sequence, ERD hiện tại và bản nháp cộng đồng. ERD hiện tại có 17 bảng kể cả bảng theo dõi migration.
- TypeScript frontend/backend và build Docker đạt. Compose báo các dịch vụ khỏe. Smoke test API đạt, gồm ca mật khẩu tiếng Việt, hồ sơ, nhật ký nhiều ảnh, ảnh riêng, chia sẻ/thu hồi lịch sử và chatbot.
- [Tóm tắt tích hợp AI](../03-kien-truc/tich-hop-ai.md) mô tả Python sàng lọc dấu hiệu, worker và chatbot từ khóa, cùng các bước bổ sung mô hình học và mô hình ngôn ngữ.
