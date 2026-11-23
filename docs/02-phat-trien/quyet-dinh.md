# Nhật ký quyết định

| Mã | Trạng thái | Quyết định và lý do |
| --- | --- | --- |
| D01 | Áp dụng từ M1, mở rộng 0.5 | User mặc định và Admin cấp qua CLI vận hành. Một bảng tài khoản và kiểm tra quyền sở hữu theo từng tài nguyên. Đăng ký/hồ sơ không nhận quyền do client gửi. |
| D02 | Áp dụng từ M1 | React web responsive, Node.js/TypeScript Modular Monolith, PostgreSQL, Python nội bộ. Tách suy luận khỏi request HTTP qua hàng đợi PostgreSQL. |
| D03 | Chờ duyệt | Cà chua và dưa leo, mỗi loại hai bệnh đề xuất. Giới hạn phạm vi giúp nhóm thu thập đủ ảnh và kiểm chứng từng lớp. |
| D04 | MinIO áp dụng, R2 chờ triển khai | Ảnh riêng tư qua Node.js và kho tương thích S3. Local dùng MinIO; R2 cần cấu hình môi trường thật. Hướng dẫn theo bệnh đã duyệt vẫn cần mô hình được kiểm định. |
| D05 | Chờ duyệt | VPS Linux chạy Docker Compose, Cloudflare DNS/proxy và Full (strict), GitHub Actions + GHCR, sao lưu ngoài VPS. |
| D06 | Chốt theo phản hồi 12/11/2026 | ERD v2 kiểm tra cùng chủ và đúng loài qua khóa ngoại ghép. MVP dùng loài User chọn. Một ảnh có tối đa một chẩn đoán, mỗi chẩn đoán có một job. Thử lại sau `failed` dùng cùng ID, ảnh và job. [Ràng buộc SQL](../04-du-lieu/rang-buoc.md) |
| D07 | Chốt theo phản hồi 12/11/2026 | Nhật ký quản trị lưu năm trường với danh sách hành động cố định. Phản hồi chẩn đoán chuyển sang giai đoạn 2. |
| D08 | Áp dụng ở M1 | Express/TypeScript và React/Vite chạy cùng origin qua Nginx. Compose dựng MinIO Community từ phiên bản nguồn đã ghim vì lần kéo gói dựng sẵn trả lỗi truy cập. Cấu hình này phục vụ môi trường local. [MinIO Community](https://github.com/minio/minio/tree/RELEASE.2025-10-15T17-29-55Z#source-only-distribution) |
| D09 | Áp dụng 15/11/2026 | Hồ sơ riêng mặc định. Cộng đồng chỉ hiển thị phần nội dung được chia sẻ chủ động, dùng tiêu đề/giới thiệu do chủ cây nhập và bí danh người trồng. Ảnh sàng lọc lưu riêng theo tài khoản. |
| D10 | Áp dụng 15/11/2026 | Bản local sàng lọc dấu hiệu màu trên lá bằng Python và dùng chatbot theo chủ đề từ nguồn khuyến nông. Câu hỏi xử lý trong API nội bộ và lịch hội thoại giữ trong màn hình hiện tại. Chất lượng nhận diện từng bệnh cần bộ ảnh độc lập và báo cáo đánh giá. |
| D11 | Áp dụng ở 0.3 | Thêm ớt, húng quế và bạc hà. Gợi ý sàng lọc kết hợp dấu hiệu quan sát, loài được chọn và các bước kiểm tra có thể thực hiện tại nhà. |
| D12 | Áp dụng ở 0.3 | Nhật ký theo ngày có ảnh riêng tư cho cả cây đang theo dõi và đã lưu trữ. Lịch sử sàng lọc lấy trực tiếp từ chẩn đoán gắn với hồ sơ cây. |
| D13 | Áp dụng ở 0.3 | Sàng lọc và nhật ký dùng chung giới hạn tải, chuẩn hóa ảnh và quy trình giữ/xóa object. Python trả dấu hiệu thị giác, Node tạo gợi ý chăm sóc từ dấu hiệu và loài. |
| D14 | Áp dụng ở 0.4 | Chủ cây đang theo dõi hoặc đã lưu trữ có thể bật chia sẻ nhật ký và lịch sử kiểm tra, gồm ảnh và các mục thêm sau. Thành viên đã đăng nhập xem qua API cộng đồng. Bài cũ giữ mặc định riêng tư cho lịch sử, và tắt chia sẻ thu hồi đường dẫn ảnh. |
| D15 | Áp dụng ở 0.4 | Hồ sơ lưu riêng tên hiển thị, số điện thoại tùy chọn và ảnh đại diện. Email dùng để đăng nhập. Đổi email hoặc mật khẩu yêu cầu mật khẩu hiện tại và thu hồi toàn bộ phiên trong cùng giao dịch. |
| D16 | Áp dụng 18/11/2026 | Thiết kế theo ảnh chín màn hình người dùng cung cấp, với nền kem và thẻ bo tròn. Trang chủ dùng dữ liệu thật. Đăng ký nhận tên hiển thị tùy chọn qua cùng quy tắc hồ sơ, ghi trong giao dịch tạo tài khoản. [Ghi chú giao diện](../05-prompt/giao-dien-18-11.md) |
| D17 | Người dùng xác nhận, triển khai 0.5 ngày 19/11 | Chuyển lịch local sang PostgreSQL, UTC+7 cố định, once/daily/weekly/monthly. Rule ở `care_schedules`, lời nhắc ở `notifications`; unique theo lần hẹn và `clientId` nhập local. Thu hẹp thiết kế cũ: chưa có `care_occurrences`, complete/skip hay tự tạo care log. [API](../03-kien-truc/api.md) |
| D18 | Triển khai 0.5 ngày 19/11 | Notification Center lưu DB, chuông polling khi app mở. Worker tiến lịch và tạo lời nhắc cùng giao dịch; sau gián đoạn nhắc lần gần nhất, không gửi toàn bộ backlog. Web Push, preferences và timezone tùy chọn để sau. |
| D19 | Người dùng yêu cầu, triển khai 0.5 ngày 19/11 | Một cây có nhiều bài ngày/ghi chú/ảnh, sửa/xóa, cảm xúc và bình luận ảnh/trả lời/thích. Giữ API chia sẻ cũ làm quyền tổng. Bài mới mặc định không chia sẻ lịch sử; cần đồng ý rõ ràng. Bí danh công khai tách hồ sơ liên hệ. [Chi tiết](../03-kien-truc/cong-dong.md) |
| D20 | Triển khai 0.5 ngày 19/11 | Admin tìm/khóa/mở tài khoản và ẩn/hiện bài, audit cùng giao dịch. Khóa thu hồi phiên; chặn tự khóa và Admin hoạt động cuối cùng. Chưa triển khai CRUD danh mục/hướng dẫn quản trị. |
| D21 | Sửa giao diện 0.5 ngày 19/11 | Mở hồ sơ qua `#profile`, giữ tương thích `#settings`; đồng bộ trạng thái avatar khi thay/xóa. Chỉ bỏ avatar trùng trong lời chào Trang chủ, giữ header và Hồ sơ. |

Khi duyệt hoặc sửa, ghi người duyệt, ngày, lý do thay đổi và liên kết bằng chứng ngay ở mục tương ứng.

Lịch sử trạng thái các phiên cũ được giữ ở [lịch sử phiên](lich-su-phien.md). Kết quả xác minh hiện tại ở [snapshot bàn giao](trang-thai.md); nguồn schema là migration thực thi. [Sơ đồ và phạm vi snapshot](../07-so-do/README.md)

- 22/11: bắt đầu triển khai chat có ảnh bằng cách dùng lại hàng đợi sàng lọc hiện có. Giữ bảng xếp hạng bệnh ở giai đoạn đánh giá dữ liệu. Xác minh qua OTP email để dùng hạn mức miễn phí; xác minh số điện thoại chưa bật. [Cấu hình và nghiệm thu](../03-kien-truc/nang-cap-chat-otp.md)

- 23/11: thêm Gmail API cho OTP email khi chưa có tên miền gửi. Giữ Resend làm cấu hình thay thế. API, schema và chính sách xác minh email giữ nguyên.

- 23/11: dùng hai origin HTTPS cố định trong đợt chuyển tên miền. Giữ cookie theo host và kiểm tra CSRF. Không chuyển link chính trước khi xác nhận DNS, HTTPS và đăng nhập. [Runbook](../../deploy/plantcare-io-vn.md).

- 23/11: dùng phân luồng theo dữ liệu cho ảnh, hướng dẫn web và lịch sử tưới. Mô hình nhận hướng dẫn đã xuất bản theo độ liên quan và trả lời bằng JSON. Giữ một hội thoại mỗi tài khoản và cải tiến giao diện chat.

- 23/11: chỉ tạo tài khoản sau OTP, chỉ đổi email sau OTP gửi tới email mới. Giữ tài khoản cũ hoạt động. Chat chỉ đọc hồ sơ cây được đính kèm và thuộc người đăng nhập. Địa chỉ chính là www.plantcare.io.vn.

- 23/11: API gửi OTP báo số giây còn chờ bằng `Retry-After` để giao diện khóa nút gửi lại đúng thời điểm. Khi dịch vụ email báo lỗi, xóa mã vừa tạo để người dùng có thể gửi lại trong hạn mức. [API](../03-kien-truc/api.md)

- 23/11: tách biểu mẫu đổi email và đổi mật khẩu, dùng định dạng rút gọn khi hiển thị địa chỉ email. Log OTP dùng mã yêu cầu để hỗ trợ kiểm tra trên Render. Gmail thử lại sau khi làm mới access token; Resend chỉ thử lại với cùng khóa idempotency. [Kiểm tra gửi mã](../03-kien-truc/nang-cap-chat-otp.md#kiểm-tra-gửi-mã-trên-render)
