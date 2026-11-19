# Giao diện theo ảnh tham chiếu ngày 18/11/2026

Tham chiếu do người dùng cung cấp gồm chín màn đăng nhập, đăng ký, Trang chủ, chi tiết cây, chụp ảnh, kết quả, chatbot, cộng đồng và hồ sơ.

## Quyết định triển khai

- Dùng DM Sans, nền kem `#f7f8f2`, xanh `#286749`, chữ `#173d2b`, thẻ trắng và bo tròn. Trên mobile có năm mục Vườn cây, Chẩn đoán, Trợ lý AI, Cộng đồng và Hồ sơ. Máy tính dùng thanh điều hướng trên.
- Trang chủ lấy cây, lần kiểm tra và nhật ký của tài khoản từ API. Danh sách Trang chủ giới hạn ba cây, nhãn `+` biểu thị còn trang sau. Chi tiết cây hỗ trợ mở từ URL `#garden?plant=<uuid>`.
- Ảnh loài cây trên thẻ được ghi rõ là minh họa. Thư viện ảnh ghi chép và kết quả kiểm tra lấy đúng ảnh của bản ghi.
- Các nút sửa hồ sơ mở biểu mẫu đang dùng. Đăng ký có tên hiển thị lưu vào hồ sơ trong giao dịch tạo tài khoản. Đăng nhập Google, khôi phục mật khẩu qua email, thông báo đẩy và nhắc lịch chăm sóc chưa có trong API hiện tại.
- Các màn dùng CSS theo phạm vi chức năng. `PlantPhoto` dùng chung cách hiển thị ảnh loài cây cho Trang chủ và vườn. Bộ CSS màn hình cũ `features.css` được loại bỏ.

## Ảnh cây trong nhà

Ảnh tạo bằng công cụ ImageGen tích hợp và lưu tại [indoor-monstera.webp](../../frontend/src/assets/indoor-monstera.webp), dung lượng khoảng 152 KB sau khi chuyển WebP. Ảnh phục vụ giới thiệu, đăng nhập và Trang chủ.

Prompt đã dùng

> Use case photorealistic-natural. Create a production lifestyle photograph for the PlantCare AI web app login and welcome screen. A single lush healthy Monstera deliciosa plant with naturally split broad dark-green leaves in a cream ceramic cylinder pot on a light oak floor next to a large sunlit window, soft pale sage limewash wall, cozy warm modern apartment, gentle morning natural light, a small woven basket in far background. Editorial interior photography, sophisticated muted palette of forest green, creamy off-white, pale sage and warm oak. Vertical portrait 4:5 composition with entire pot and most leaves in frame. Natural imperfect real leaf texture. NO people, NO text, NO logos, NO UI, NO watermark. The image is marketing illustration of growing plants at home.
