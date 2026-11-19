# Ảnh kiểm tra giao diện 0.5

Ngày 19/11/2026, bản Docker local. Nội dung trong ảnh thuộc tài khoản giả `example.test`, cây và ảnh minh họa của dự án. Tài khoản/ảnh thử giao diện đã được dọn sau khi kiểm tra; không chứa thông tin đăng nhập thật.

| Ảnh | Kết quả quan sát |
| --- | --- |
| [Quản trị](admin.jpg) | Tìm tài khoản giả, hiển thị quyền Admin và vô hiệu nút tự khóa |
| [Cộng đồng](cong-dong.jpg) | Bài đã lưu có ghi chú, ngày, ảnh và bộ cảm xúc |
| [Hồ sơ](ho-so.jpg) | Đường dẫn `#profile` mở thông tin và các mục quản lý tài khoản |

Các thao tác khác đã thử: đăng bình luận kèm ảnh, ẩn/hiện bài mẫu, tạo lịch trên server, tải lại vẫn giữ lịch, xem nhắc việc và đánh dấu đã đọc. Swagger 0.5 gọi GET `/notifications` trả HTTP 200 với đúng dữ liệu của tài khoản giả. Console của tab bản dựng cuối không có lỗi ở lượt đọc.

Đo DOM ghi nhận bố cục rộng 1280 px và cộng đồng hẹp 480 px không tràn ngang. Khung chụp ở màn rộng có hai lề 144 px. Đây là kiểm tra trình duyệt máy tính; camera vật lý và bàn phím trên điện thoại thật chưa được nghiệm thu. [Biên bản đầy đủ](../bien-ban.md)
