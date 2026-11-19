# Quá trình phát triển

Bản 0.5 mở rộng cộng đồng, quản trị và lịch server/thông báo trong app. Đọc [snapshot bàn giao](trang-thai.md) để biết phần đã kiểm tra và phần còn mở; [lịch sử phiên](lich-su-phien.md) giữ nội dung cũ. Quyết định và lý do ở [nhật ký quyết định](quyet-dinh.md).

| Mốc | Việc triển khai | Bằng chứng hoàn thành |
| --- | --- | --- |
| M0 · Thiết kế | Duyệt phạm vi, tác nhân, sơ đồ, ERD, API và cách triển khai. | Xác nhận các đề xuất hoặc ghi thay đổi trong nhật ký. |
| M1 · Nền tảng | Khởi tạo React, API Node.js/TypeScript, migration PostgreSQL, Docker Compose, MinIO và OpenAPI. | Chạy lại từ bản sao sạch; đăng ký/đăng nhập và gọi API bằng Swagger ở local. |
| M2 · Theo dõi cây | Tạo hồ sơ cây, nhật ký, danh mục và trang Admin. | Demo trên điện thoại, kiểm thử hai tài khoản và phân quyền. |
| M3 · Chẩn đoán | Chuẩn hóa ảnh, hàng đợi, dịch vụ Python, huấn luyện và tích hợp hướng dẫn. | Một luồng ảnh đến kết quả chạy xuyên hệ thống, báo cáo kiểm thử mô hình và tình huống không chắc chắn. |
| M4 · Vận hành | CI/CD, VPS, R2, domain Cloudflare, TLS, giám sát và sao lưu. | URL staging/production, phiên bản đang chạy, số liệu tải và biên bản khôi phục. |
| M5 · Nghiệm thu | Chạy bộ kiểm thử, kiểm thử chéo ứng dụng nhóm khác, tổng hợp báo cáo. | Bằng chứng Swagger đã ẩn thông tin nhạy cảm, báo cáo lỗi/khuyến nghị và báo cáo kỹ thuật. |

Giai đoạn 2 bổ sung phản hồi của chủ chẩn đoán và quy trình thẩm định phản hồi.

## Lịch và thông báo ở 0.5

Sau xác nhận của người dùng, MVP đã có rule PostgreSQL, CRUD lịch theo giờ Việt Nam, worker nhắc lịch, chuông thông báo trong app và nhập dữ liệu trình duyệt chống trùng. Quy tắc và bằng chứng nằm ở [API](../03-kien-truc/api.md), [D17/D18](quyet-dinh.md) và [trạng thái](trang-thai.md).

Các phần sau để giai đoạn tiếp theo: task complete/skip và nhật ký tự động, `care_occurrences`, timezone tùy chọn/quiet hours, notification preferences và Browser Push. Không dùng lộ trình đề xuất cũ làm bằng chứng các chức năng này đã có.

## Phối hợp nhóm

- Gán người phụ trách và người review cho từng hạng mục API/dữ liệu, giao diện, AI, vận hành và QA. Một thành viên có thể phụ trách nhiều hạng mục.
- Mỗi thay đổi có issue, nhánh và pull request nhỏ, kèm cách kiểm tra và liên kết đến tài liệu liên quan. Thay đổi API/schema đi cùng cập nhật OpenAPI/migration.
- Với **CLO1**, báo cáo đính kèm sơ đồ Modular Monolith, cấu hình Compose đã ẩn bí mật, kết quả thử R2/MinIO và URL demo qua Cloudflare.
- Với **CLO2**, báo cáo nêu mục tiêu, thiết kế, đóng góp từng thành viên, phương pháp thử, kết quả, hạn chế và các lỗi/khuyến nghị đã gửi khi kiểm thử nhóm khác. Dùng [bộ tài liệu kiểm thử](../06-kiem-thu/README.md) để lưu bằng chứng.
