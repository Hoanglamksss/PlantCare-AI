# Ảnh sơ đồ PlantCare AI 0.5

Đối chiếu mã nguồn và PostgreSQL local ngày **19/11/2026**, sau migration `0001`–`0011`. ERD hiện tại gồm **25 bảng**, trong đó có 24 bảng nghiệp vụ và `schema_migrations`. Snapshot chỉ lấy tên bảng, tên cột, kiểu và khóa. Các đường dẫn rút gọn trong sequence có tiền tố `/api/v1`.

| Ảnh PNG | Nội dung | Phạm vi |
| --- | --- | --- |
| [01 · Kiến trúc hệ thống](01-kien-truc-he-thong.png) | React/Nginx, Modular Monolith, PostgreSQL, MinIO và Python | Có Admin, lịch máy chủ và thông báo trong ứng dụng. Khối nét đứt mô tả hạng mục triển khai tiếp theo. |
| [02 · Use case User và Admin](02-use-case.png) | Cây, nhật ký, ảnh, cộng đồng, lịch, thông báo và quản trị | Hai tác nhân, đen trắng. |
| [03 · Sequence kiểm tra ảnh](03-sequence-kiem-tra-anh.png) | Chuẩn hóa ảnh, reservation, MinIO, job và kết quả | Node worker xử lý hàng đợi, Python sàng lọc dấu hiệu. |
| [04 · Sequence nhật ký và chia sẻ](04-sequence-nhat-ky-chia-se.png) | Nhật ký tối đa 4 ảnh, chia sẻ và thu hồi quyền | Bài legacy được đồng bộ sang bảng bài đăng mới. |
| [05 · Sequence cộng đồng](05-sequence-cong-dong.png) | Bài nhiều ảnh, trả lời phân cấp và cảm xúc | API mới dưới `/community/posts`, có kiểm duyệt và kiểm tra quyền. |
| [06 · ERD toàn bộ hiện tại](06-erd-hien-tai.png) | 25 bảng, cột và quan hệ từ metadata PostgreSQL | Đen trắng. Dùng SVG khi cần đọc toàn bộ sơ đồ lớn. |
| [07 · ERD cộng đồng hiện tại](07-erd-cong-dong-hien-tai.png) | Bài đăng, bình luận, phản ứng và các liên kết ảnh | Đen trắng, mỗi cây có nhiều bài. |
| [09 · ERD lịch và thông báo](09-erd-lich-thong-bao.png) | Lịch thuộc cây/tài khoản, thông báo và audit | Đen trắng. Múi giờ `Asia/Ho_Chi_Minh` và chống trùng theo lịch/giờ hẹn. |
| [10 · Sequence lịch và thông báo](10-sequence-lich-thong-bao.png) | API lưu lịch, worker, đọc và đánh dấu thông báo | PostgreSQL giữ giờ hẹn và lịch sử qua lần khởi động lại. |
| [11 · Sequence quản trị](11-sequence-quan-tri.png) | Khóa/mở tài khoản, thu hồi phiên và ẩn/hiện bài | Kiểm tra lại quyền trong giao dịch và ghi audit. |

[08 · ERD cộng đồng bản nháp](08-erd-cong-dong-ban-nhap.png) giữ lại thiết kế trước bản 0.5 để tham chiếu lịch sử. Các cột và trạng thái trong bản nháp cần đối chiếu với ERD 07 và migration 0009 đã triển khai.

Mỗi PNG có file `.dot` cùng tên để sửa nguồn và `.svg` để phóng lớn. ERD và use case dùng đen trắng. Kiến trúc và sequence dùng màu theo thành phần. `UQ*` đánh dấu cột tham gia khóa duy nhất ghép. Mũi tên quan hệ đi từ bảng được tham chiếu tới bảng giữ khóa ngoại, nhãn ghi số bản ghi đầu và cuối. Chi tiết CHECK, UNIQUE, trigger và chính sách xóa nằm trong [migration](../../backend/migrations).

## Xuất lại ảnh

`01-kien-truc-he-thong.dot` và `02-use-case.dot` là nguồn chỉnh trực tiếp. ERD được dựng từ [schema-snapshot.json](schema-snapshot.json), lấy metadata PostgreSQL bằng `capture-schema.mjs`. `build-sources.mjs` sinh ERD và sequence từ snapshot và luồng API. Bản nháp 08 giữ nguồn riêng.

Từ thư mục dự án, chạy lệnh đầu khi cần cập nhật snapshot từ Compose đang hoạt động, rồi sinh lại nguồn và ảnh. Đối số lệnh cuối là thư mục `node_modules` có `@viz-js/viz` và `sharp`.

```powershell
node docs/07-so-do/capture-schema.mjs
node docs/07-so-do/build-sources.mjs
node docs/07-so-do/render.mjs "<thu-muc-node_modules>"
```

Bộ ảnh được xuất bằng `@viz-js/viz` 3.31.0 và `sharp` 0.35.5, font Arial trên nền trắng. Đã kiểm tra trực quan nhãn tiếng Việt, khung bảng, các làn sequence và sơ đồ tổng thể. [Bằng chứng kiểm thử hệ thống](../06-kiem-thu/README.md) được lưu riêng với các kịch bản API và Docker.
