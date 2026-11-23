# Tích hợp AI trong PlantCare AI

Đối chiếu mã nguồn ngày 19/11/2026. Hệ thống đang có dịch vụ Python nội bộ cho ảnh và chatbot theo chủ đề trong Node.js.

## Luồng ảnh đang chạy

1. React gửi ảnh, loài cây và hồ sơ cây tùy chọn tới `POST /api/v1/diagnoses`. Node kiểm tra phiên, CSRF, quyền sở hữu, loài cây và giới hạn tải.
2. Node gọi Python `POST /prepare` để giải mã và chuẩn hóa JPEG, loại metadata, rồi ghi vào bucket MinIO riêng. Cấu hình lưu trữ dùng giao thức S3 và có thể trỏ đến R2 khi triển khai.
3. Trong cùng giao dịch PostgreSQL, Node tạo `diagnoses` và `diagnosis_jobs`. API trả `202` để giao diện tiếp tục đọc kết quả theo ID.
4. Worker trong backend nhận job, tải ảnh từ kho riêng và gọi Python `POST /analyze`. Lease 45 giây giúp nhận lại công việc bị gián đoạn. Lỗi phụ thuộc tạm thời có tối đa ba lượt xử lý.
5. Python `visual-screening-1` dùng Pillow và NumPy để tìm mô xanh, vùng vàng và đốm sẫm quanh lá. Phản hồi có `outcome`, `findings`, `quality` và `modelVersion`. Hiện kết quả thuật toán là `healthy` hoặc `uncertain`.
6. Worker lưu kết quả vào PostgreSQL. Node kết hợp dấu hiệu với loài đã chọn để trả nguyên nhân có thể và các bước chăm sóc tại nhà. React hiển thị ảnh, kết quả và lịch sử của cây.

`quality` phản ánh chất lượng quan sát theo quy tắc hiện tại. Thuật toán chưa có trọng số học từ dữ liệu để đưa xác suất từng bệnh. [Python](../../inference/screening.py) · [API ảnh và lưu trữ](../../backend/src/modules/media/services.ts) · [Worker](../../backend/src/modules/diagnosis/queue.ts) · [Gợi ý chăm sóc](../../backend/src/modules/diagnosis/guidance.ts)

## Chatbot đang chạy

`POST /api/v1/chat` chuẩn hóa tiếng Việt, tìm loài cây và từ khóa rồi chọn câu trả lời đã biên soạn, kèm nguồn tham khảo và gợi ý chụp ảnh khi phù hợp. Câu hỏi được xử lý trong backend, lịch trò chuyện giữ trong màn hình React. [Mã chatbot](../../backend/src/modules/chat/router.ts)

## Mở rộng nhận diện bệnh

- Thu thập và gán nhãn ảnh của từng loài, gồm cây khỏe, các bệnh mục tiêu và ảnh ngoài phạm vi. Chia dữ liệu theo cây hoặc phiên chụp để đánh giá bằng ảnh độc lập.
- Đưa mô hình đã đánh giá vào dịch vụ Python, thay phần suy luận trong `analyze_photo`. Giữ worker và API công khai, cập nhật schema phản hồi nội bộ nếu thêm bệnh hoặc điểm dự đoán.
- Khi trả `disease`, cập nhật validator ở `media/services.ts` và phần lưu kết quả để ánh xạ nhãn sang `diseases`. Database yêu cầu bệnh phù hợp loài được chọn. Gắn hướng dẫn đã duyệt và phiên bản mô hình để truy lại kết quả.
- Đo độ chính xác từng bệnh, lỗi nhận nhầm cây khỏe và thời gian xử lý. Chọn ngưỡng để trả `uncertain` khi ảnh mờ, thiếu dấu hiệu hoặc nằm ngoài nhóm đã hỗ trợ.

## Mở rộng chatbot

Backend có thể bổ sung mô hình ngôn ngữ, dùng câu hỏi cùng dữ liệu cây mà người dùng có quyền xem và hướng dẫn đã duyệt để tạo câu trả lời. Câu trả lời cần dẫn nguồn, phân biệt dấu hiệu quan sát với bệnh được xác nhận và ưu tiên việc chăm sóc có thể thực hiện tại nhà.

Đặt khóa dịch vụ ở cấu hình bí mật của backend. Giới hạn độ dài hội thoại, thời gian xử lý và số yêu cầu theo tài khoản. Nếu dùng dịch vụ bên ngoài, chỉ gửi nội dung cần cho câu hỏi và kiểm tra quyền trước khi đưa ảnh hoặc ghi chép vào ngữ cảnh.

## Phạm vi hiện tại

Năm loài được hỗ trợ gồm cà chua, dưa leo, ớt, húng quế và bạc hà. Bước tiếp theo của AI là xây dữ liệu kiểm định, bổ sung mô hình nhận diện bệnh và đo chất lượng trả lời chatbot.

[Luồng chat nhiều lượt, ảnh trong chat và cấu hình mô hình](nang-cap-chat-otp.md) mô tả phần nâng cấp sau bản 0.5.
