# Chat nhiều lượt, ảnh trong chat và xác minh email

Bản demo đang dùng: [PlantCare AI](https://www.plantcare.io.vn/). Cấu hình trong frontend/vercel.json chuyển /api đến backend Render. Nội dung dưới đây mô tả phần nâng cấp trong mã nguồn; kiểm tra bản online sau khi phát hành.

## Cách chạy

1. Deploy backend trước để start-render.sh cập nhật PostgreSQL đến migration 0013.
2. Trên Render, đặt APP_ORIGIN=https://www.plantcare.io.vn cho domain chính. Giữ cookie HTTPS và các cấu hình database hiện có.
3. Bật mô hình chat bằng CHAT_MODEL_URL (URL đầy đủ của endpoint tương thích Chat Completions), CHAT_MODEL (model ID hỗ trợ JSON mode), CHAT_API_KEY (nếu nhà cung cấp yêu cầu). Khóa chỉ nằm ở backend. Khi chưa cấu hình mô hình, chat trả lời theo quy tắc cũ và trả kế hoạch theo kết quả ảnh khi hỏi đúng ngữ cảnh. Sau khi cấu hình, kiểm thử tiếng Việt trước khi mở rộng cho người dùng.
4. Trên Render, dùng Python trong cùng container và đặt đủ biến S3 cho bucket R2 riêng tư. Kiểm tra upload và đọc ảnh cộng đồng bằng hai tài khoản trên Vercel. [Cấu hình Render và R2](../../deploy/plantcare-io-vn.md#sàng-lọc-ảnh-trên-render)
5. Trên Vercel, dùng Root Directory frontend, build npm run build và thư mục xuất dist. Redeploy frontend sau khi backend sẵn sàng.

## Chat và ảnh

- Trợ lý dùng một hội thoại theo tài khoản. Giao diện tải 30 lượt gần nhất. Backend chuẩn hóa tiếng Việt không dấu và các lỗi gõ thường gặp để tìm kiếm, giữ câu gốc trong lịch sử và hiển thị “Ý bạn là…” khi có cách hiểu dự kiến. Đầu ra không chắc chắn yêu cầu người dùng làm rõ.
- Chào hỏi, hướng dẫn thao tác web, tra lần tưới và hỏi kế hoạch ngày mai từ kết quả ảnh được xử lý bằng dữ liệu của ứng dụng. Nhật ký chỉ đọc của chủ tài khoản và các lượt trả lời bằng nhật ký không gửi sang mô hình.
- Các câu hỏi chăm cây khác lấy tối đa ba hướng dẫn đã xuất bản liên quan theo từ khóa, ưu tiên đúng loài. Mô hình nhận câu gốc, lịch sử cùng chủ đề trong tối đa sáu lượt gần nhất, các hướng dẫn và kết quả sàng lọc khi tham chiếu ảnh. Backend từ chối các yêu cầu ngoài phạm vi và kiểm tra trường `inScope` của mô hình. Liên kết lấy từ danh sách nguồn phía backend.
- Khi mô hình không khả dụng, bot dùng hướng dẫn liên quan hoặc hỏi đúng thông tin còn thiếu để tiếp tục. Mô hình không nhận ảnh gốc.

- Gửi ảnh qua POST /api/v1/diagnoses, sau đó liên kết mã lượt sàng lọc với tin nhắn. Giao diện theo dõi trạng thái ngay trong cuộc trò chuyện. Chọn **Hỏi về ảnh này** dưới thẻ nếu có nhiều ảnh. Có thể thử lại lượt ảnh lỗi tạm thời.
- Python hiện sàng lọc dấu hiệu màu. Thẻ hiện nguyên nhân để đối chiếu và kế hoạch hôm nay, ngày mai, sau 48–72 giờ. Xếp hạng bệnh bằng mô hình cần bộ ảnh gán nhãn và ngưỡng được kiểm định theo từng loài. Chưa có dữ liệu để phát hành phần đó.
- Ảnh cộng đồng lớn được thu nhỏ trong trình duyệt trước khi gửi. Trường hợp ảnh cũ không hiển thị vẫn cần đối chiếu danh sách ảnh trong JSON, mã HTTP của URL ảnh và cấu hình kho ảnh trên bản online.

## OTP email qua Gmail API

Gmail API dùng địa chỉ Gmail của dự án để gửi mã đến email của người dùng. Chỉ chủ hộp thư gửi cấp quyền OAuth một lần; người nhận tiếp tục đăng nhập PlantCare như bình thường. Dùng một hộp thư Gmail riêng và thử trong nhóm nhỏ vì Gmail giới hạn gửi.

1. Trong [Google Cloud Console](https://console.cloud.google.com/), tạo hoặc chọn project PlantCare, bật **Gmail API**. Trong **Google Auth Platform**, đặt Audience là **External** nếu dùng Gmail cá nhân, thêm hộp thư gửi vào danh sách **Test users**. Thêm scope https://www.googleapis.com/auth/gmail.send.
2. Trong **Clients**, tạo **Web application**, thêm https://developers.google.com/oauthplayground vào **Authorized redirect URIs**. Lấy client ID và client secret.
3. Mở [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/). Bấm bánh răng, chọn **Use your own OAuth credentials**, nhập client ID và client secret, chọn **Offline**. Ở Step 1 nhập scope https://www.googleapis.com/auth/gmail.send và bấm **Authorize APIs** bằng hộp thư gửi. Ở Step 2 bấm **Exchange authorization code for tokens** và dùng giá trị **Refresh token**.
4. Thêm các biến sau trong **Render → backend → Environment** rồi deploy mã mới. Không đưa thông tin bí mật vào Git hoặc frontend.

```dotenv
OTP_EMAIL_PROVIDER=gmail
GMAIL_SENDER_EMAIL=plantcare.demo@gmail.com
GMAIL_CLIENT_ID=<OAuth client ID>
GMAIL_CLIENT_SECRET=<OAuth client secret>
GMAIL_REFRESH_TOKEN=<refresh token>
```

5. Đăng nhập PlantCare bằng email người nhận rồi vào **Hồ sơ → Xác minh email → Gửi mã**. Thử bằng một hộp thư khác hộp thư gửi. Chỉ bật COMMUNITY_REQUIRE_VERIFIED_EMAIL=true sau khi xác nhận gửi và nhập mã thành công.

Với OAuth External ở chế độ **Testing**, refresh token dùng scope Gmail hết hạn sau 7 ngày. Khi tiếp tục thử nghiệm, cấp lại token và cập nhật Render. Trước khi vận hành lâu dài, xử lý trạng thái phát hành và các yêu cầu xác minh mà Google Cloud hiển thị cho scope nhạy cảm. Xem [chính sách hết hạn OAuth](https://developers.google.com/identity/protocols/oauth2#expiration).

OTP có 6 chữ số, hiệu lực 10 phút, dùng một lần, tối đa 5 lần thử và chờ ít nhất 60 giây để gửi lại. Đổi email chỉ hoàn tất sau khi xác minh địa chỉ mới. Số điện thoại là thông tin liên hệ tùy chọn.

### Kiểm tra gửi mã trên Render

Trong **Logs**, lọc theo `[otp-mail]` hoặc `request_id`. `stage=accepted` nghĩa là nhà cung cấp đã nhận yêu cầu gửi. Khi có lỗi, log ghi bước lỗi, nhóm lỗi và mã HTTP nếu có. Địa chỉ nhận, OTP, khóa và nội dung phản hồi của nhà cung cấp không được ghi.

| Dấu hiệu trong log | Cần kiểm tra |
| --- | --- |
| `reason=configuration` | Kiểm tra `OTP_EMAIL_PROVIDER` và các biến tương ứng trong **Environment**. Sau khi lưu, triển khai bản có cấu hình mới. |
| `stage=gmail_oauth reason=invalid_grant` | Cấp lại refresh token từ hộp thư gửi và cập nhật `GMAIL_REFRESH_TOKEN` riêng trên Render. |
| `stage=gmail_send reason=rejected status=403` | Kiểm tra Gmail API đã bật và quyền `gmail.send` đã được cấp. |
| `stage=resend_send reason=rejected status=403` | Kiểm tra domain đã xác minh và `OTP_EMAIL_FROM` dùng địa chỉ trên domain đó. |

Gmail tự làm mới access token và thử gửi lại một lần nếu API gửi trả 401. Resend thử lại một lần khi API trả 5xx, dùng cùng khóa idempotency. Sau khi backend chạy bản mới, thử đăng ký và đổi email với hộp thư kiểm thử do nhóm kiểm soát.

### Giữ Resend nếu cần

Đặt OTP_EMAIL_PROVIDER=resend hoặc bỏ biến chọn nhà cung cấp. Cấu hình RESEND_API_KEY và OTP_EMAIL_FROM. Resend yêu cầu tên miền gửi đã xác minh để gửi cho người nhận ngoài tài khoản thử nghiệm.

## Nghiệm thu staging

- Gõ “alo”, “la ca chua bi vang”, một câu viết sai gây mơ hồ và câu hỏi ngoài phạm vi. Kiểm tra chào hỏi, “Ý bạn là…?”, hỏi lại và từ chối đúng ngữ cảnh.
- Gửi ảnh kèm câu hỏi, xem thẻ kết quả, hỏi “mai lam gi”, tải lại trang. Gửi ảnh thứ hai, chọn ảnh thứ nhất để hỏi tiếp. Tài khoản thứ hai không được đọc kết quả hay ảnh qua URL cũ.
- Thử OTP sai, hết hạn, gửi lại, nhập đúng và dùng lại. Trong Hồ sơ, kiểm tra **Đổi mật khẩu** và **Đổi email** là hai biểu mẫu riêng, và địa chỉ nhận hiển thị dạng `abc****@gmail.com` ở bước nhập OTP. Xác minh yêu cầu đăng bài được bật đúng theo cấu hình.
- Đăng bài có ảnh bằng tài khoản thứ nhất, kiểm tra tài khoản thứ hai thấy ảnh sau khi tải lại. Khi Admin ẩn bài, kiểm tra tài khoản thường mất quyền đọc ảnh.

[Kế hoạch chuyển sang plantcare.io.vn và gửi OTP từ tên miền dự án](../../deploy/plantcare-io-vn.md).

### Ví dụ cấu hình mô hình trên Render

Backend chỉ cần endpoint Chat Completions hỗ trợ JSON Object Mode. Ví dụ cấu hình tham khảo với Groq:

```dotenv
CHAT_MODEL_URL=https://api.groq.com/openai/v1/chat/completions
CHAT_MODEL=openai/gpt-oss-20b
CHAT_API_KEY=<khóa từ dự án nhà cung cấp>
```

Kiểm tra mô hình có trong tài khoản và hạn mức trước khi bật. Giữ khóa trong Render Environment và thử câu hỏi mới chưa có mẫu, chẳng hạn “húng quế và bạc hà trồng chung chậu có được không?”. Xem [JSON Object Mode](https://console.groq.com/docs/structured-outputs#json-object-mode).

Với Docker Compose, có thể đặt cùng ba biến môi trường cho backend; giữ giá trị khóa trong tệp môi trường ngoài Git hoặc nhập trong phiên shell. Khi bỏ cấu hình mô hình, luồng ảnh, nhật ký và hướng dẫn có sẵn vẫn hoạt động.

[Pipeline đầy đủ, database và OTP bắt buộc khi đăng ký hoặc đổi email](pipeline-chat-va-anh.md).
