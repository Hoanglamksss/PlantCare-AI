# Kiểm tra API qua Swagger UI

Thử API hiện có tại [Swagger UI](http://localhost:8080/docs), đường dẫn trong bảng tính từ `/api/v1`. SW-08 và SW-09 cần dữ liệu thử có job `failed`. Có thể chạy lại tích hợp bằng `smoke-local.mjs`, `smoke-community.mjs` và `smoke-admin-schedules.mjs` trong thư mục scripts. Các kịch bản này không thay bằng chứng thao tác Swagger trên trình duyệt.

## Chuẩn bị

1. Mở Swagger UI tại `/docs` trên cùng origin với ứng dụng. Với local, dùng `http://localhost:8080` cho cả hai. Với staging, dùng HTTPS và giới hạn quyền xem cho người kiểm thử.
2. Chuẩn bị hai tài khoản User thử nghiệm và dùng phiên trình duyệt riêng. Khi chạy ca chẩn đoán/quản trị, chuẩn bị thêm tài khoản Admin và ảnh thử được phép sử dụng.
3. Dùng **Try it out** cho đăng ký, đăng nhập và thao tác nghiệp vụ. Swagger UI không cho điền header `Cookie` thủ công. Nếu Swagger UI không nhận được phiên từ bước đăng nhập, đăng nhập ở giao diện staging cùng origin rồi tải lại `/docs` và gọi `GET /auth/me` để xác nhận cookie được gửi. Với yêu cầu thay đổi dữ liệu sau khi đăng nhập, nhập header `X-CSRF-Token` lấy từ phản hồi đăng nhập hoặc `GET /auth/me`. Các yêu cầu thay đổi dữ liệu từ trình duyệt phải có origin hợp lệ. Nếu trình duyệt vẫn không gửi cookie, lưu bằng chứng lỗi Swagger và chạy thêm bài tích hợp dùng cookie jar. [Swagger Cookie Authentication](https://swagger.io/docs/specification/v3_0/authentication/cookie-authentication/)
4. Khi ghi bằng chứng, che giá trị cookie, thông tin đăng nhập và dữ liệu có thể định danh.

## Danh sách kịch bản

| ID | Thao tác | Kỳ vọng |
| --- | --- | --- |
| SW-01 | `POST /auth/register` với dữ liệu hợp lệ, email đã dùng, dữ liệu sai và payload cố gửi quyền `admin` | Tài khoản mới có quyền User. Email mới và email đã dùng nhận cùng thông báo `200`. Đăng ký lại giữ nguyên mật khẩu cũ. Dữ liệu sai và trường `role` bị từ chối |
| SW-02 | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, rồi gọi lại `GET /auth/me` | Đăng nhập hợp lệ tạo phiên. Sau khi đăng xuất, API xác thực trả `401`. Kiểm tra thêm mật khẩu sai và giới hạn số lần thử |
| SW-03 | User A tạo cây bằng `POST /plants`, xem qua `GET /plants`, đổi tên hoặc lưu trữ bằng `PATCH`, thử `POST` và `GET` tại `/plants/{plantId}/care-logs` | Dữ liệu trả về đúng với các thay đổi đã lưu. User B dùng ID cây của A để đọc/sửa cây hoặc đọc/thêm nhật ký nhận `404` |
| SW-04 | `POST /diagnoses` dạng multipart với `image`, `speciesCode`, `plantId` tùy chọn và `Idempotency-Key`. Thử không gắn cây, gắn cây đúng loài, gắn cây của User B, thiếu loài và chọn loài khác với cây của mình | Yêu cầu hợp lệ trả `202` cùng ID để gọi `GET /diagnoses/{diagnosisId}`. Cây sai chủ trả `404`. Thiếu loài hoặc loài khác với cây bị từ chối. Kết quả `completed` là `disease`, `healthy` hoặc `uncertain` |
| SW-05 | Gửi hai yêu cầu chẩn đoán cùng `Idempotency-Key` và cùng dữ liệu, thử khóa đó với dữ liệu khác, rồi xóa chẩn đoán và thử lại khóa | Yêu cầu lặp cùng dữ liệu trả `200` và cùng ID. Khóa trùng với dữ liệu khác trả `409`. Sau khi xóa, khóa cũ trả `410` trong 24 giờ và ảnh/kết quả cũ trả `404` |
| SW-06 | Gửi ảnh sai loại, quá dung lượng và ảnh không xác định được bệnh. Gọi `GET /diagnoses/{diagnosisId}/photo` với phiên của chủ ảnh và tài khoản khác | Tệp không hợp lệ bị từ chối. Ảnh hợp lệ có kết quả không chắc chắn trả `completed` với kết quả `uncertain`. Tài khoản khác không xem được kết quả hoặc ảnh của chủ ảnh |
| SW-07 | Gọi GET/PATCH `/admin/accounts` và `/admin/posts` bằng phiên User rồi Admin. Thử đọc ảnh/nhật ký riêng của User bằng phiên Admin | User nhận `403`; Admin khóa/mở tài khoản, ẩn/hiện bài theo quyền và ghi audit. Quyền quản trị không cho đọc ảnh/nhật ký riêng |
| SW-08 | Dùng dữ liệu thử có chẩn đoán `failed` do lỗi tạm thời và ảnh hợp lệ. Gọi `POST /diagnoses/{diagnosisId}/retry` với phiên của chủ và `X-CSRF-Token`, rồi mở đường dẫn từ `Location` | Trả `202` cùng ID cũ và `status: queued`. Lịch sử vẫn có một chẩn đoán với ảnh đó. Theo dõi kết quả tại cùng đường dẫn |
| SW-09 | Gọi `/retry` bằng tài khoản khác, thiếu `X-CSRF-Token`, khi chẩn đoán đang `queued`, `processing` hoặc `completed`, và khi chạm từng ngưỡng tải | Sai chủ trả `404`, thiếu token bị từ chối, sai trạng thái trả `409`, vượt hạn mức tài khoản trả `429`, hết sức chứa toàn hệ thống trả `503`. Các yêu cầu bị từ chối giữ nguyên dữ liệu |
| SW-10 | Chủ cây gọi `PUT /plants/{plantId}/share` với `shared`, `title`, `caption`. User khác mở `GET /community/plants` và thêm `POST /community/plants/{plantId}/comments`. Chủ cây tắt chia sẻ | User khác chỉ thấy phần được chủ chọn chia sẻ. Email, nhật ký và ảnh riêng không có trong phản hồi. Sau khi tắt chia sẻ, API bình luận trả `404` |
| SW-11 | Gửi `POST /chat` với `question` về đốm lá cà chua hoặc tưới dưa leo | Phản hồi gợi ý theo chủ đề, có `source` khi tìm được hướng dẫn phù hợp. Thiếu CSRF token trả `403` |
| SW-12 | Thêm ghi chú chữ cho cây đang theo dõi và gửi multipart với hai trường `images` và `happenedAt` cho cây lưu trữ. Sửa ngày qua `PATCH /plants/{plantId}/notes/{logId}` | Nhật ký giữ đúng thứ tự ảnh và ngày đã sửa. Chủ cây đọc được ảnh. Tài khoản khác dùng đường dẫn riêng tư nhận `404` |
| SW-13 | Quét ảnh có `plantId`, xem `GET /diagnoses?plantId=...` và mở ảnh từ hồ sơ cây | Lịch sử trả đúng lần sàng lọc và kết quả có các bước kiểm tra tại nhà. Ảnh chỉ đọc được bằng phiên của chủ cây |
| SW-14 | Chia sẻ cây đã lưu trữ với `includeHistory: true`. Dùng tài khoản khác mở chi tiết, nhật ký và lần kiểm tra cùng ảnh. Tắt riêng lịch sử rồi mở lại các đường dẫn ảnh | Nội dung hiển thị khi được phép. Tắt lịch sử giữ bài chia sẻ và thu hồi quyền đọc lịch sử cùng ảnh |
| SW-15 | Cập nhật hồ sơ bằng `PATCH /profile` và ảnh qua `PUT /profile/avatar`. Gọi `PATCH /profile/credentials` lần lượt với mật khẩu hiện tại sai, email đã dùng và thông tin hợp lệ | Hồ sơ và ảnh chỉ thuộc phiên đang dùng. Mật khẩu sai trả `403`, email đã dùng trả `409`. Đổi thành công thu hồi tất cả phiên, đăng nhập lại bằng thông tin mới được |
| SW-16 | Đăng ký và đổi mật khẩu với 11 ký tự rồi 129 ký tự | Trả `400 PASSWORD_TOO_SHORT` hoặc `400 PASSWORD_TOO_LONG` kèm thông báo tiếng Việt, giữ nguyên dữ liệu tài khoản |
| SW-17 | Tạo hai bài cùng cây bằng `/community/posts`, gửi bốn `images`, đổi ngày/chữ và PATCH `retainedPhotoIds`, sau đó xóa một bài | Nhiều bài độc lập, giữ/bỏ/nối ảnh đúng thứ tự, không mất bài khác; sai chủ hoặc ảnh ngoài bài bị từ chối |
| SW-18 | Gửi cảm xúc heart/cry/laugh/null, bình luận ảnh, trả lời bằng parentId, thích và xóa bình luận cha | Số đếm thật, mỗi người một cảm xúc/like; parent khác bài bị từ chối, xóa cha xóa toàn nhánh |
| SW-19 | Bài mới không gửi includeHistory, sau đó bật rõ ràng rồi tắt quyền tổng của cây khi URL ảnh đã biết | Ban đầu lịch sử riêng tư; consent cho xem đúng cây; thu hồi quyền làm bài/lịch sử/ảnh trả 404 với người khác |
| SW-20 | Tạo/sửa/tạm dừng/xóa `/schedules`, gửi lại clientId của tài khoản rồi clientId đã xóa; gọi bằng User khác | Lưu DB, replay cùng ID, deleted trả 410; sai chủ 404, cây lưu trữ không được bật lịch |
| SW-21 | Cho hai lượt worker xử lý cùng lịch đến hạn; đọc `/notifications` bằng hai User và PATCH đọc/đọc tất cả | Một thông báo cho cùng lịch/lần hẹn; không lộ tài khoản khác, trạng thái đọc và unreadCount lưu DB |
| SW-22 | Admin khóa User đang có phiên, thử tự khóa/khóa Admin hoạt động cuối, ẩn bài rồi tác giả sửa | Phiên User bị thu hồi; các hành động Admin bị bảo vệ trả 409; sửa bài không tự bỏ kiểm duyệt |

Ảnh chụp Swagger chỉ cần có phương thức, đường dẫn, mã phản hồi và phần dữ liệu minh họa đã che thông tin nhạy cảm. Ghi chú lỗi quan sát được nếu UI không thực hiện được thao tác.
