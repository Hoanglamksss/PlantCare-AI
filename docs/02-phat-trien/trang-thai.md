# Trạng thái bàn giao

**19/11/2026 · Bản 0.5 đã kiểm tra local, chưa phát hành online.** Đọc trang này trước; chỉ mở tài liệu thuộc phần đang làm. [Lịch sử các phiên](lich-su-phien.md) · [Quyết định](quyet-dinh.md) · [Mục lục](../../README.md)

## Đã có trong mã nguồn

- React/Vite, Express/TypeScript Modular Monolith, PostgreSQL, Python và MinIO/S3/R2; cookie phiên, Origin/CSRF và quyền User/Admin. Sàng lọc Python hiện dựa trên vùng vàng/đốm sẫm, chưa phải mô hình phân loại từng bệnh.
- Cây riêng, nhật ký tối đa bốn ảnh, lịch sử kiểm tra và quyền chia sẻ lịch sử chủ động. Cộng đồng mới có nhiều bài trên một cây, ngày/ghi chú/ảnh, sửa/xóa, ba cảm xúc, bình luận ảnh, trả lời phân cấp và thích bình luận. Bài mới mặc định không chia sẻ lịch sử. [API cộng đồng](../03-kien-truc/cong-dong.md)
- Trang Admin tìm tài khoản/bài đăng, khóa hoặc mở tài khoản và ẩn/hiện bài đăng; kiểm tra quyền ở API, thu hồi phiên khi khóa và ghi audit. Không thể khóa chính Admin đang dùng hoặc Admin hoạt động cuối cùng.
- Hồ sơ mở đúng qua `#profile` và liên kết `#settings` cũ; thay đổi/xóa ảnh đại diện đồng bộ lại trên giao diện. Chỉ bỏ avatar trùng cạnh lời chào Trang chủ, vẫn giữ ảnh ở header và Hồ sơ. Đổi email/mật khẩu yêu cầu mật khẩu hiện tại và thu hồi phiên.
- Lịch chăm sóc đã chuyển từ bộ nhớ trình duyệt sang PostgreSQL theo xác nhận của người dùng. Worker tạo thông báo trong app theo giờ Việt Nam UTC+7; nhập lịch cũ dùng `clientId` chống trùng. Web Push, task hoàn thành/bỏ qua và timezone tùy chọn chưa triển khai. [API](../03-kien-truc/api.md)
- Chuỗi migration hiện có `0001`–`0011`: `0009` cộng đồng nhiều bài, `0010` audit quản trị, `0011` lịch/thông báo. [Dữ liệu và ràng buộc](../04-du-lieu/README.md)

## Bằng chứng

- 23/11: image backend cho Render Free đóng gói Python và chạy sàng lọc trên loopback. Tính năng ảnh online cần biến S3 của bucket Cloudflare R2 riêng tư. [Cấu hình Render và R2](../../deploy/plantcare-io-vn.md#sàng-lọc-ảnh-trên-render)

- 20/11: thêm `backend/start-render.sh` vào image. Trên Render, đặt Docker Command là `/bin/sh /app/start-render.sh` để migration thành công trước khi mở HTTP, tránh phụ thuộc cách Render xử lý dấu nháy. Kiểm tra runtime trên Render cần xem log lần deploy tiếp theo.

- Git local dùng nhánh `main`, remote `origin` trỏ [Hoanglamksss/PlantCare-AI](https://github.com/Hoanglamksss/PlantCare-AI). Bí mật `.secrets/`, `.env*`, bản sao lưu, thư viện và kết quả build được loại khỏi Git.

- Root xác nhận frontend/backend TypeScript, build Docker và `smoke-local.mjs` đạt trên Compose local; đã áp dụng migration `0001`–`0011`.
- `node scripts/smoke-community.mjs` đã đạt với Compose local theo kết quả backend agent ngày 19/11: CRUD/nhiều ảnh, phân trang, cảm xúc, bình luận ảnh/trả lời/thích, sai chủ/CSRF và thu hồi quyền lịch sử/ảnh.
- `node scripts/smoke-admin-schedules.mjs` đạt theo kết quả platform agent: Admin/CSRF, thu hồi phiên, kiểm duyệt, lịch/chống nhập trùng, worker đồng thời và thông báo riêng, tháng nhuận/cuối tháng. [Biên bản](../06-kiem-thu/bien-ban.md)
- Trình duyệt đã kiểm tra Hồ sơ, Admin tìm/ẩn/hiện bài, bài đăng và bình luận ảnh, lịch lưu qua tải lại, chuông nhắc/đã đọc và Swagger 0.5 gọi `/notifications` trả 200. Bố cục rộng 1280 px và cộng đồng hẹp 480 px không tràn ngang; khung chụp có hai lề 144 px ở màn rộng. [Ảnh bằng dữ liệu giả](../06-kiem-thu/anh-0.5/README.md)
- Cấu hình production đã qua kiểm tra Compose/Nginx với chứng chỉ giả, shell/YAML và các tình huống chạy lại/thất bại bằng fixture. [Runbook VPS/R2](../../deploy/README.md). Chưa chạy VPS, R2 thật, GitHub publish hoặc đo tải production.
- [Sơ đồ PNG/SVG/DOT 0.5](../07-so-do/README.md) đã dựng từ PostgreSQL `0001`–`0011`: 25 bảng gồm 24 bảng nghiệp vụ và bảng migration. Có use case, hệ thống và sequence ảnh/cộng đồng/lịch/quản trị; bản nháp 08 gắn nhãn lịch sử.

## Bước tiếp theo

1. Điền domain, VPS, R2 và Origin CA theo runbook; triển khai staging rồi nghiệm thu HTTPS, sao lưu/khôi phục và đo tải trước production.
2. Kiểm tra camera/bàn phím trên điện thoại thật, nhập lịch cũ có mục lỗi và mạng chậm/mất kết nối. API chống trùng đã được kiểm thử; các tình huống trình duyệt cực đoan này chưa nghiệm thu.
3. Chất lượng AI cần bộ ảnh gán nhãn và đánh giá độc lập; hiện chỉ sàng lọc dấu hiệu và hướng dẫn chăm sóc theo quy tắc.

- 22/11: đã đối chiếu luồng chat và ảnh trong mã, soạn [đề xuất nâng cấp chờ duyệt](../03-kien-truc/de-xuat-nang-cap-ai.md). Cần tái hiện lỗi ảnh trên Vercel; chưa đổi mã, API hay schema.
- 22/11: bổ sung luồng gửi ảnh, sàng lọc và hỏi tiếp ngay trong chatbot vào đề xuất chờ duyệt. Chưa triển khai.

- 22/11: triển khai chat theo tài khoản, gửi ảnh và hỏi tiếp, kế hoạch chăm sóc theo ngày và OTP email Resend. Đã kiểm tra build và luồng backend bằng PostgreSQL/nhà cung cấp giả lập. Còn cần chạy migration 0012 trên staging, thử gửi mail thật, đo chất lượng tiếng Việt và kiểm tra ảnh hai tài khoản trên Vercel. Bảng xếp hạng bệnh chờ bộ ảnh đánh giá. README đã có link demo ở commit local 8df686b; GitHub chưa nhận do lỗi kết nối. [Cấu hình và nghiệm thu](../03-kien-truc/nang-cap-chat-otp.md).

- 23/11: thêm Gmail API để gửi OTP qua HTTPS từ hộp thư riêng. Build backend và kiểm tra bằng Google/Resend giả lập đã qua. Còn cần cấp Gmail OAuth cho hộp thư gửi trên Render, deploy và thử với một email nhận khác. [Hướng dẫn](../03-kien-truc/nang-cap-chat-otp.md#otp-email-qua-gmail-api).

- 23/11: chuẩn bị chuyển sang plantcare.io.vn. Backend chỉ nhận các origin cấu hình chính xác; mẫu Render giữ cả tên miền mới và bản demo Vercel. Đã build và kiểm tra middleware cùng script bằng mạng giả lập. DNS, HTTPS, đăng nhập và OTP thật chờ tên miền được cấp. [Hướng dẫn chuyển tên miền](../../deploy/plantcare-io-vn.md).

- 23/11: nâng giao diện chat và pipeline tiếng Việt, chọn nguồn theo câu hỏi, đọc lần tưới của chủ tài khoản và giữ đúng ảnh khi hỏi tiếp. Build hai ứng dụng, cấu hình Compose và kịch bản backend với dịch vụ giả lập đã qua. Mô hình thật cần cấu hình trên Render và nghiệm thu cùng upload ảnh; bản online chưa deploy.

- 23/11: cập nhật link www.plantcare.io.vn và tài liệu pipeline đầy đủ. Chat đọc cây chủ động đính kèm, hoạt động gần đây và kết quả ảnh có cùng cây. Đăng ký và đổi email phải xác nhận OTP, giữ đăng nhập cho tài khoản cũ. Build frontend/backend và kiểm tra route với dữ liệu giả lập đã qua. Scripts smoke dùng fixture OTP local; cần chạy migration 0013, smoke với Compose và gửi OTP thật trên staging. [Pipeline, database và nghiệm thu](../03-kien-truc/pipeline-chat-va-anh.md).

- Bổ sung ca smoke cho OTP sai địa chỉ, hết hạn, dùng lại và cho luồng hỏi tiếp từ ảnh của cây đã lưu. Đã kiểm tra cú pháp script và cấu hình Compose. Docker daemon chưa khả dụng ở máy hiện tại để chạy toàn bộ smoke.

- 23/11: thêm đếm ngược gửi lại OTP khi đăng ký, đổi email và xác minh trong Hồ sơ. Sửa bước gửi mã đầu tiên khi đổi email và xóa mã vừa tạo khi dịch vụ gửi mail báo lỗi. Build frontend/backend và kiểm tra các route với DB/dịch vụ email giả lập đã qua. Cần triển khai và thử với PostgreSQL cùng hộp thư thật trên staging.

- 23/11: đã chuẩn bị cấu hình local và mở Docker Desktop. Phiên lệnh bị từ chối kết nối Docker Engine nên chưa khởi động được Compose. Vite báo sẵn sàng ở cổng 5173 nhưng lượt mở trang chưa kết nối được. Cần chạy Compose từ phiên Windows có quyền Docker rồi kiểm tra `/health/ready`.

- 23/11: tách đổi email và mật khẩu, che email trong giao diện, bổ sung xử lý lỗi gửi Gmail/Resend và log theo mã yêu cầu. Build hai ứng dụng, kiểm tra render biểu mẫu, che email và gửi OTP giả lập đã qua. Trang chủ online mở được. Bản sửa còn ở mã nguồn local, cần quyền GitHub/Render để triển khai và thử gửi OTP thật. [Kiểm tra trên Render](../03-kien-truc/nang-cap-chat-otp.md#kiểm-tra-gửi-mã-trên-render)
