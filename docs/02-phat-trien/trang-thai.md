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
