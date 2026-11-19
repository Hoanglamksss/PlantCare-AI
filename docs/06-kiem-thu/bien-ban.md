# Mẫu biên bản kiểm thử và phản hồi CLO2

## Bản 0.5 · local ngày 19/11/2026

Môi trường: Docker Compose local, Node.js/React/PostgreSQL/MinIO/Python, migration `0001`–`0011`. Tài khoản thử giả; chưa ghim mã commit trong biên bản này. Kết quả dưới được tổng hợp từ các agent chạy lệnh ở phiên triển khai, không đại diện cho môi trường VPS/R2.

| Phạm vi | Kết quả | Bằng chứng/lệnh |
| --- | --- | --- |
| Frontend/backend TypeScript, build Docker | Đạt theo root | `npm run typecheck` từng package và lượt dựng Compose 0.5 |
| Hồi quy nền tảng, hồ sơ, nhật ký/ảnh, chia sẻ và chatbot | Đạt theo root | `node scripts/smoke-local.mjs` |
| Bài đăng nhiều ảnh, giữ/bỏ ảnh khi sửa, phân trang, cảm xúc, bình luận ảnh/trả lời/thích | Đạt, script thoát 0 theo backend agent | `node scripts/smoke-community.mjs` |
| Cây/ảnh sai chủ, CSRF, parent khác bài, consent lịch sử, thu hồi quyền tổng, xóa cascade | Đạt trong bộ cộng đồng theo backend agent | Cùng script community; xác minh bằng HTTP và ảnh thực qua kho local |
| API Admin, cấp quyền CLI, khóa/mở và thu hồi phiên, kiểm duyệt không tự mất sau sửa | Đạt, script thoát 0 theo platform agent | `node scripts/smoke-admin-schedules.mjs` |
| Lịch CRUD/ownership, replay clientId và deleted 410, hai worker không nhân đôi, thông báo riêng/read-all, tháng nhuận/cuối tháng | Đạt trong bộ Admin/lịch theo platform agent | Cùng script Admin/lịch; PostgreSQL thực và kiểm tra qua phiên mới |
| Hai Admin khóa đồng thời vẫn còn Admin hoạt động | Đạt theo platform agent | Cùng script Admin/lịch; dữ liệu giả của lượt này được dọn sau chạy |
| Giao diện và Swagger 0.5 | Đạt phạm vi đã thử | Hồ sơ, tạo bài/bình luận ảnh, kiểm duyệt Admin, lưu lịch qua tải lại, nhắc/đã đọc. Swagger GET `/notifications` trả 200 bằng phiên giả. Bố cục 1280 px và cộng đồng 480 px không tràn ngang; camera hai lề bằng nhau. [Ảnh](anh-0.5/README.md) |
| Xác minh cấu hình production | Đạt bằng fixture local | Compose, Nginx không có quyền root với chứng chỉ giả, envsubst giữ biến Nginx, shell/YAML, deploy khóa đồng thời, backup nguyên tử, dừng khi migration lỗi. Chưa chạy VPS/R2 thật hoặc GitHub workflow |
| Camera vật lý, R2/Cloudflare/VPS, tải và khôi phục backup, chất lượng AI phân bệnh | Chưa chạy/nghiệm thu | Cần thiết bị, môi trường và dữ liệu đánh giá tương ứng |
| Mạng chậm/mất kết nối trên UI, nhập lịch cũ có mục lỗi | Chưa nghiệm thu bằng trình duyệt | Đã sửa xử lý hủy yêu cầu, giữ tiến độ nhập, `clientId` và polling; API chống trùng đạt. Cần kiểm tra UI bằng mô phỏng mạng và dữ liệu cũ riêng |

Chạy lại các script từ thư mục dự án khi Compose đang hoạt động. Script cộng đồng tạo dữ liệu thử; script Admin/lịch có dọn bốn tài khoản `example.test` được đánh dấu riêng của lượt chạy. Không đưa cookie, token, mật khẩu hoặc dữ liệu khách hàng vào bằng chứng. Khi root có kết quả mới, cập nhật bảng này và [snapshot bàn giao](../02-phat-trien/trang-thai.md).

## Biên bản của nhóm

| Mục | Điền khi thực hiện |
| --- | --- |
| Người thực hiện và ngày | |
| Commit, phiên bản mô hình và môi trường | |
| Bộ dữ liệu thử hoặc phiên bản kịch bản | |
| Điều kiện môi trường đo tải nếu áp dụng | |

| ID ca kiểm thử | Kết quả mong đợi | Kết quả quan sát | Trạng thái | Bằng chứng hoặc issue |
| --- | --- | --- | --- | --- |
| | | | Chưa chạy | |

Trạng thái sử dụng gồm **Chưa chạy**, **Đạt**, **Không đạt** và **Bị chặn**. Với ca bị chặn, ghi lý do và điều kiện để chạy lại. Bằng chứng có thể là ảnh Swagger, báo cáo CI, kết quả k6, báo cáo đánh giá AI hoặc nhật ký diễn tập phục hồi đã lọc dữ liệu nhạy cảm.

## Phản hồi kiểm thử dự án nhóm khác

Chỉ kiểm thử trong môi trường và phạm vi nhóm bạn cung cấp. Dùng tài khoản, ảnh và dữ liệu thử nghiệm theo hướng dẫn của nhóm bạn.

| Mục | Điền khi thực hiện |
| --- | --- |
| Nhóm nhận phản hồi và tên ứng dụng | |
| Người kiểm thử, ngày và bản build | |
| Môi trường, thiết bị và phạm vi được phép | |
| Tiêu đề phát hiện hoặc khuyến nghị | |
| Các bước tái hiện | |
| Kết quả mong đợi và kết quả thực tế | |
| Ảnh hưởng và mức ưu tiên đề xuất | |
| Bằng chứng đã che dữ liệu nhạy cảm | |
| Đường dẫn issue hoặc kênh đã gửi | |
| Phản hồi của nhóm bạn và kết quả kiểm tra lại | |

Đính kèm biên bản đã điền và liên kết issue trong báo cáo CLO2. Nếu kiểm tra lại sau khi nhóm bạn sửa, ghi bản build mới và đối chiếu cùng các bước tái hiện.
