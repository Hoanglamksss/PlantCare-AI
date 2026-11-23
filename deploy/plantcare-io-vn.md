# Chuyển PlantCare sang plantcare.io.vn

Địa chỉ chính đã dùng là https://www.plantcare.io.vn. Trên Vercel, trỏ tên miền gốc sang www nếu muốn người dùng dùng chung một phiên. Trong lúc đơn tên miền đang xử lý, tiếp tục dùng [bản demo Vercel](https://plant-care-ai-sigma.vercel.app/). Giao diện gọi /api trên cùng tên miền; Vercel chuyển các yêu cầu này tới Render theo frontend/vercel.json.

## Khi tên miền được cấp

1. Trong Vercel, vào dự án PlantCare → **Settings → Domains**, thêm **www.plantcare.io.vn** cho môi trường Production. Sao chép bản ghi DNS chính xác mà Vercel hiển thị cho dự án.
2. Thêm bản ghi đó ở nơi đang quản lý DNS cho plantcare.io.vn. Nếu Vercel yêu cầu xác minh quyền sở hữu, thêm TXT theo hướng dẫn trên màn hình. Đợi Vercel báo cấu hình hợp lệ và mở được trang qua HTTPS. Tham khảo [cách thêm tên miền của Vercel](https://vercel.com/docs/domains/set-up-custom-domain).
3. Deploy backend có hỗ trợ **APP_ADDITIONAL_ORIGINS** rồi áp dụng các giá trị trong [render-plantcare.env.example](render-plantcare.env.example). Cấu hình mới chấp nhận đúng hai origin HTTPS trong đợt chuyển. Giữ DATABASE_URL, CSRF_SECRET và các biến dịch vụ đã dùng. Không đổi địa chỉ backend trong rewrite nếu vẫn dùng cùng Web Service Render.
4. Sau khi Render sẵn sàng, chạy các kiểm tra bên dưới, rồi đăng nhập trên tên miền mới. Trình duyệt giữ cookie riêng cho từng tên miền, nên người đang mở bản demo cần đăng nhập lại khi chuyển sang www.plantcare.io.vn.
5. README dùng link chính www.plantcare.io.vn. Nếu muốn chỉ dùng tên miền mới, chuyển hướng địa chỉ demo tại Vercel nếu dự án hỗ trợ, rồi bỏ địa chỉ demo khỏi APP_ADDITIONAL_ORIGINS trên Render. Giữ các origin preview ra khỏi danh sách production.

## OTP dùng địa chỉ của dự án

Gmail API vẫn dùng được sau khi đổi domain web. Muốn gửi từ **otp@mail.plantcare.io.vn**, tạo domain **mail.plantcare.io.vn** trong Resend, thêm đúng bản ghi DNS mà Resend cung cấp và đợi trạng thái **Verified**. Miền phụ này dành cho gửi mail, không cần mở một web riêng. Xem [hướng dẫn xác minh domain của Resend](https://resend.com/docs/dashboard/domains/introduction).

Khi đã xác minh, trên Render đặt OTP_EMAIL_PROVIDER=resend, OTP_EMAIL_FROM=PlantCare <otp@mail.plantcare.io.vn> và RESEND_API_KEY. Kiểm tra mã đến một hộp thư nhận thật trước khi bật COMMUNITY_REQUIRE_VERIFIED_EMAIL=true. Có thể giữ cấu hình Gmail hiện có cho tới lúc Resend sẵn sàng. Gửi qua Resend miễn phí trong hạn mức gói.

## Sàng lọc ảnh trên Render

1. Trong Render, dùng Web Service Free chạy Docker với Root Directory `backend`, Dockerfile `./Dockerfile` và Docker Command `/bin/sh /app/start-render.sh`. Image chứa cả Node.js và [Python](../backend/inference/). Script chạy migration, sau đó Node khởi động Python trên `127.0.0.1:8000`. Để trống `INFERENCE_URL` để dùng Python trong cùng container.
2. Trong Cloudflare R2, tạo bucket riêng tư và giữ tắt cả `r2.dev` lẫn custom domain. Tạo khóa S3 với quyền **Object Read & Write** chỉ cho bucket đó. Ứng dụng kiểm tra quyền qua API trước khi đọc ảnh từ bucket. [Thiết lập khóa R2](https://developers.cloudflare.com/r2/api/tokens/)
3. Trong **Render → Environment**, nhập cùng lúc `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ACCESS_KEY` và `S3_SECRET_KEY`. Endpoint dùng địa chỉ S3 cấp tài khoản trong Cloudflare R2. Sau khi deploy, log `[screening] embedded_python_ready` xác nhận Python sẵn sàng. Log `[screening] storage_not_configured` cho biết cần cấu hình bucket. [Cấu hình mẫu](render-plantcare.env.example)
4. Đăng nhập bản online, mở **Chatbot → + → Đính kèm ảnh lá** và gửi ảnh thử. Kiểm tra thẻ sàng lọc chuyển từ chờ sang hoàn tất và xem lại ảnh bằng tài khoản có quyền. `screeningEnabled: true` từ `GET /api/v1/chat` chỉ xác nhận backend đã nhận cấu hình. Một lần gửi ảnh thành công mới xác nhận kết nối R2 và Python hoạt động cùng nhau.

## Kiểm tra trước khi chuyển link GitHub

Từ thư mục gốc dự án, chạy một lần với mỗi tên miền đang định dùng:

```powershell
node scripts/check-domain.mjs https://www.plantcare.io.vn
node scripts/check-domain.mjs https://plant-care-ai-sigma.vercel.app
```

Script không cần tài khoản và không gửi email. Nó kiểm tra Vercel nối tới API, Origin của web đi qua kiểm tra đăng nhập với một body rỗng, và Origin lạ bị chặn. Sau đó dùng tài khoản thử để kiểm tra đăng nhập, tải lại trang, gửi email OTP, gửi ảnh trong chat và xem ảnh cộng đồng giữa hai tài khoản.

Nếu domain mới chưa sẵn sàng, tiếp tục dùng bản demo. Nếu đã đổi APP_ORIGIN nhưng backend gặp sự cố trong lúc chuyển, có thể trả APP_ORIGIN về https://plant-care-ai-sigma.vercel.app và bỏ APP_ADDITIONAL_ORIGINS cho tới khi kiểm tra xong.
