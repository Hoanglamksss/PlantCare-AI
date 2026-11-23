# Đề xuất nâng cấp PlantCare AI

**22/11/2026 · Chờ duyệt.** Tài liệu này đề xuất hành vi và tiêu chí nghiệm thu. Chưa thay đổi API, database hay bản đang chạy.

## 1. Chatbot tiếng Việt

Giữ giao diện Trợ lý AI và route POST /api/v1/chat trong giai đoạn chuyển tiếp. Thay logic chọn câu soạn sẵn bằng pipeline do backend Express điều phối. Chatbot tiếp nhận mọi tin nhắn và phản hồi phù hợp: chào hỏi tự nhiên, trả lời về chăm cây và cách dùng web, hỏi lại khi mơ hồ, từ chối ngắn gọn khi ngoài phạm vi.

1. Kiểm tra phiên, quyền sở hữu hội thoại và giới hạn tần suất. Đọc các lượt gần nhất từ PostgreSQL.
2. Giữ nguyên tin nhắn gốc; tạo bản chuẩn hóa Unicode, viết thường và bỏ dấu để tìm kiếm. Dùng từ điển loại cây, từ đồng nghĩa và lỗi thường gặp. Ví dụ “dua chuot” và “dưa leo” cùng một loài. Chỉ chuẩn hóa bản tìm kiếm, không sửa tên hay số do người dùng nhập trong lịch sử.
3. Kết hợp câu gốc, cách hiểu dự kiến và hội thoại để xác định ý định: xã giao, chăm cây, hướng dẫn web, hỏi dữ liệu cá nhân hoặc ngoài phạm vi. Trường hợp mơ hồ, trả một câu làm rõ và chờ xác nhận trước khi tư vấn. Nếu lỗi gõ nhỏ và ý đã rõ, có thể vừa nêu cách hiểu vừa trả lời.
4. Nếu cần kiến thức, truy xuất hướng dẫn đã duyệt theo loài/chủ đề. Bắt đầu bằng tìm từ khóa và từ đồng nghĩa; bổ sung embedding nếu bộ câu kiểm thử cho thấy bỏ sót nhiều. Nếu hỏi nhật ký hoặc kết quả ảnh, backend chỉ truy vấn dữ liệu thuộc tài khoản đang đăng nhập.
5. Gọi mô hình ngôn ngữ từ Render để tạo câu trả lời tiếng Việt. Kiểm tra đầu ra có loại phản hồi, nội dung và mã nguồn hợp lệ. Backend gắn liên kết từ tài liệu đã lấy; khi thiếu căn cứ, bot hỏi thêm hoặc nói chưa đủ dữ liệu. Lưu câu trả lời và lịch sử riêng theo tài khoản. Nếu mô hình lỗi, hiển thị lỗi và cho thử lại.
6. Admin duyệt nguồn và xem phản hồi người dùng báo sai. Đo khả năng hiểu tiếng Việt, tỷ lệ hỏi lại hợp lý, tỷ lệ trả lời có nguồn đúng và thời gian phản hồi.

| Người dùng nhập | Phản hồi mong muốn |
| --- | --- |
| alo | Chào bạn! Bạn muốn hỏi về cây hay cách dùng PlantCare? |
| la ca chua bi vang | Ý bạn là lá cà chua bị vàng đúng không? Lá già hay lá non bị trước? |
| cai nay bi dom | Bạn đang nói đến cây nào? Nếu đang xem kết quả ảnh, chọn kết quả đó để mình giải thích. |
| dat van uot | Nối với câu trước về cây cà chua, rồi hỏi về độ thoát nước khi cần. |
| giải hộ đề toán | Mình hỗ trợ chăm cây và cách dùng PlantCare. Bạn muốn hỏi gì về cây đang trồng? |

Kiểm thử thêm tiếng Việt có dấu, không dấu, lỗi gõ làm đổi loài, câu tiếp nối sau khi tải lại trang và yêu cầu truy cập hội thoại của người khác.

## 2. Sàng lọc bệnh qua ảnh và kế hoạch chăm sóc

Giữ luồng gửi ảnh, hàng đợi và worker. Python hiện dùng quy tắc nhận diện dấu hiệu màu; cần mô hình đã đánh giá trước khi hiển thị bảng xếp hạng bệnh.

1. Người dùng chọn loài, tải ảnh lá; có thể thêm ảnh mặt dưới hoặc toàn cây để đối chiếu. Backend kiểm tra quyền, định dạng và dung lượng. Python chuẩn hóa ảnh và loại metadata.
2. Kiểm tra ảnh mờ, thiếu sáng, không có lá hoặc không phù hợp loài. Trả hướng dẫn chụp lại khi không đủ bằng chứng.
3. Mô hình trả các ứng viên trong nhóm được hỗ trợ, gồm dấu hiệu bệnh, cây khỏe hoặc nguyên nhân chăm sóc nếu có dữ liệu huấn luyện phù hợp. Xếp hạng tối đa ba ứng viên đủ căn cứ theo điểm mô hình. Khi các ứng viên quá gần nhau hoặc dưới ngưỡng đã kiểm định, trả trạng thái chưa chắc chắn. Hiển thị lý do dựa trên quan sát có thể kiểm tra và phiên bản mô hình. Chỉ dùng phần trăm nếu xác suất đã được hiệu chuẩn và kiểm tra độc lập.
4. Backend ghép ứng viên với hướng dẫn đã duyệt, ưu tiên bước phù hợp đồng thời với nhiều khả năng. Không tự sinh đơn thuốc hoặc liều hóa chất từ điểm mô hình. Khi thiếu dữ kiện, ưu tiên quan sát và chụp bổ sung.
5. Trả kế hoạch theo ngày. Ví dụ: hôm nay chụp hai mặt lá và ghi nhận vùng tổn thương; ngày mai so sánh ảnh và kiểm tra lá mới; sau 48–72 giờ đánh giá vết có lan không và đề nghị hỗ trợ nếu xấu đi. Người dùng xác nhận trước khi đưa việc vào lịch chăm sóc hiện có.

Ưu tiên thí điểm một hoặc hai loài trước khi mở rộng. Tập ảnh cần có cây khỏe, nhóm bệnh mục tiêu, triệu chứng dễ nhầm và ảnh ngoài phạm vi. Chia bộ đánh giá theo cây hoặc đợt chụp để ảnh cùng cây không lọt vào cả hai tập. Đo top-1, top-3, kết quả theo từng lớp và tỷ lệ xin chụp lại trên ảnh kém chất lượng. Chốt ngưỡng sau khi có dữ liệu, trước khi nghiệm thu.

### Gửi ảnh và hỏi đáp ngay trong chatbot

1. Trong ô chat, người dùng chọn biểu tượng ảnh, xem trước, chọn cây hoặc loài và có thể gõ kèm câu hỏi tiếng Việt. Cho phép gửi chỉ ảnh; nếu chưa biết loài, bot hỏi để xác nhận trước khi phân tích.
2. Chat dùng lại API tạo lượt sàng lọc ảnh và hàng đợi hiện có. Backend kiểm tra quyền với cây, hội thoại và lượt sàng lọc. Lưu liên kết giữa tin nhắn và mã lượt sàng lọc ở server. Frontend hiển thị trạng thái đang phân tích ngay dưới ảnh; khi mở lại hội thoại, đọc trạng thái từ server để tiếp tục hiển thị đúng.
3. Khi có kết quả, chatbot hiển thị thẻ ngay trong hội thoại: tối đa ba khả năng đủ căn cứ, dấu hiệu quan sát được, mức chưa chắc chắn và kế hoạch chăm sóc theo ngày. Với bản xử lý ảnh hiện tại, chatbot chỉ giải thích dấu hiệu đã sàng lọc. Bảng xếp hạng bệnh chỉ bật khi mô hình ảnh mới đạt tiêu chí nghiệm thu.
4. Backend lấy kết quả có cấu trúc, hướng dẫn đã duyệt và các lượt chat liên quan để mô hình diễn đạt câu trả lời. Ví dụ, “Mai làm gì?” phải bám đúng ảnh và cây đang nói đến. Nếu có nhiều ảnh và chưa rõ người dùng nhắc ảnh nào, bot hỏi lại. Khi có ảnh mới, tạo lượt sàng lọc mới và cho phép so sánh nếu hai kết quả cùng cây.
5. Ảnh được lưu riêng; mô hình chat nhận kết quả sàng lọc và các dữ liệu cần thiết. Nếu ảnh mờ, yêu cầu chụp lại; nếu xử lý lỗi, hiện nút thử lại và chống tạo lượt trùng. Có thể chọn thêm các việc đã đề xuất vào lịch bằng thao tác xác nhận.

Nghiệm thu: gửi ảnh kèm câu “la ca chua bi j”, xem kết quả ngay trong chat, hỏi tiếp “mai lam gi”, tải lại trang và kiểm tra thẻ kết quả vẫn còn. Kiểm tra thêm trường hợp có hai ảnh trong cùng hội thoại, ảnh không hợp lệ, worker lỗi và tài khoản khác không truy cập được ảnh hay kết quả.

## 3. Xác minh email và số điện thoại

- **Email:** Đăng ký → tạo liên kết xác minh ngẫu nhiên, dùng một lần → gửi qua nhà cung cấp email giao dịch → người dùng xác nhận trên web → ghi thời điểm xác minh. Khi đổi email, xác minh địa chỉ mới trước khi thay; thu hồi phiên theo luồng đổi thông tin hiện tại.
- **Số điện thoại:** Chuẩn hóa quốc tế (ví dụ +84), gửi OTP qua dịch vụ SMS, xác minh rồi lưu thời điểm. Đề xuất email bắt buộc trước khi đăng bài hoặc bình luận, và số điện thoại xác minh tùy chọn trong bản đầu. Tài khoản cũ có thông tin liên hệ sẽ thấy trạng thái chưa xác minh và được hướng dẫn bổ sung.
- Token lưu dưới dạng băm; OTP có thể do nhà cung cấp quản lý hoặc lưu dưới dạng HMAC có khóa riêng. Có hạn dùng, giới hạn lần thử và gửi lại theo tài khoản, địa chỉ nhận và IP. Dùng HTTPS API của nhà cung cấp; khóa API lưu ở backend Render. Kiểm thử mã sai, hết hạn, đã dùng, gửi lại và đổi thông tin liên hệ.

## 4. Ảnh bài viết cộng đồng không hiển thị

Mã hiện tại có luồng ảnh cho cộng đồng; cần tái hiện trên Vercel để xác định công đoạn lỗi. Backend yêu cầu cả dịch vụ Python để chuẩn hóa và kho S3/R2 để lưu ảnh. Nếu thiếu toàn bộ cấu hình ảnh, backend vẫn có thể chạy với chức năng ảnh không khả dụng.

| Kiểm tra trên bản online | Việc cần làm |
| --- | --- |
| Gửi bài thử có ảnh | Trong Network kiểm tra yêu cầu đăng bài có multipart và file; nếu tải ảnh thất bại, hiển thị lỗi rõ. |
| Đọc lại bài | Kiểm tra phản hồi API có danh sách ảnh. Nếu rỗng, rà luồng lưu tệp và ghi liên kết ảnh–bài. |
| Mở URL ảnh trong Network | Dùng đường dẫn cùng origin đi qua rewrite /api của Vercel. Với 401/403, kiểm tra cookie và quyền xem; với 404, kiểm tra đường dẫn, bản ghi và tệp; với 5xx, xem log theo request ID và kiểm tra dịch vụ ảnh. |
| Kiểm tra cấu hình ảnh | Kiểm tra INFERENCE_URL, S3_ENDPOINT, S3_BUCKET và thông tin xác thực S3 trên Render. Kiểm tra backend đọc/ghi đúng bucket và Python nhận được yêu cầu chuẩn hóa. |

Nghiệm thu bằng hai tài khoản trên Vercel: một người đăng ảnh, người còn lại xem được ảnh sau khi tải lại trang. Sau khi Admin ẩn bài, tài khoản thường cũng mất quyền xem ảnh theo đường dẫn cũ. Ảnh nhật ký riêng vẫn tuân theo quyền chia sẻ riêng.

## Thứ tự đề xuất để duyệt

1. Tái hiện và sửa ảnh cộng đồng trên staging.
2. Làm chatbot tiếng Việt nhiều lượt và đưa kho hướng dẫn đã duyệt vào sử dụng.
3. Thêm xác minh email; quyết định có đưa SMS vào cùng đợt hay không.
4. Chuẩn bị ảnh gán nhãn song song; chỉ đưa bảng xếp hạng bệnh lên web sau khi đạt tiêu chí đánh giá.

Các điểm cần chốt trước khi triển khai: phạm vi chatbot, loài thí điểm và nguồn ảnh, yêu cầu xác minh email/SMS, bộ tiêu chí phát hành cho AI. Kiến trúc dự kiến giữ Vercel cho web, Render cho Express, PostgreSQL cho dữ liệu và Python cho ảnh; chatbot gọi mô hình từ backend. Chưa kiểm tra ảnh lỗi trên bản online.
