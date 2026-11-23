# Hợp đồng API PlantCare AI · 0.5

React và Swagger gọi Node.js cùng origin. JSON dùng camelCase, thời gian trả về theo ISO 8601 UTC. Các đường dẫn có tiền tố `/api/v1`. [OpenAPI](../../backend/src/openapi.ts) và router trong mã nguồn là hợp đồng thực thi; việc có route trong mã chưa thay cho bằng chứng kiểm thử môi trường. Snapshot này cập nhật theo `0001`–`0011` ngày 19/11/2026.

## Phiên và quyền

- Đăng ký nhận `email`, `password`, cùng `phone` và `displayName` tùy chọn, rồi gán `user` trên server. Tên hiển thị bỏ khoảng trắng ở đầu/cuối và dài từ 1 đến 80 ký tự. Email mới và email đã dùng nhận cùng phản hồi `200` hướng dẫn thử đăng nhập, với thời gian xử lý tương đương. Đăng ký lại giữ nguyên tài khoản và hồ sơ hiện có. API từ chối trường ngoài schema, kể cả `role`. Đăng nhập sai dùng cùng thông báo lỗi `401` cho email không tồn tại và mật khẩu sai.
- `POST /auth/login` đặt cookie phiên ngẫu nhiên với `HttpOnly`, `Secure` trên HTTPS, `SameSite=Lax`, `Path=/` và phạm vi host hiện tại. Server lưu bản băm của token và ngày hết hạn. Đăng xuất thu hồi phiên ở server.
- Server kiểm tra `Origin` của yêu cầu thay đổi dữ liệu từ trình duyệt, bao gồm đăng ký và đăng nhập. Các thao tác sau đăng nhập thêm `X-CSRF-Token` từ `POST /auth/login` hoặc `GET /auth/me`. API kiểm tra token gắn với phiên. Origin phải khớp chính xác APP_ORIGIN hoặc một mục trong APP_ADDITIONAL_ORIGINS, nếu có. Local dùng ngoại lệ cookie phục vụ phát triển, staging kiểm thử hành vi qua HTTPS.
- Thiếu phiên trả `401`. Gọi API Admin bằng tài khoản User trả `403`. Tài nguyên riêng sai chủ trả `404` giống trường hợp ID không tồn tại. Admin có quyền quản trị danh mục và xem số liệu tổng hợp. API áp dụng cùng quy tắc chủ sở hữu cho tài nguyên riêng.

## Điểm cuối

Mật khẩu mới có độ dài từ 12 đến 128 ký tự. Đăng ký và đổi mật khẩu trả `400 PASSWORD_TOO_SHORT` hoặc `400 PASSWORD_TOO_LONG` với thông báo tiếng Việt nếu không đạt giới hạn này. Đăng nhập xác thực mật khẩu hiện có của tài khoản.

| Phương thức và đường dẫn | Quyền | Phản hồi dự kiến |
| --- | --- | --- |
| `POST /auth/register` · `POST /auth/login` | Công khai | `200` thông báo đăng ký chung, `200` tạo phiên khi thông tin hợp lệ |
| `GET /auth/me` · `POST /auth/logout` | Có phiên | `200` hồ sơ tối thiểu và token CSRF, `204` thu hồi phiên |
| `GET /profile` · `PATCH /profile` | Chính chủ | `200` trả hồ sơ, cập nhật `displayName` và `phone`. Giá trị `null` xóa trường tùy chọn |
| `PATCH /profile/credentials` | Chính chủ | Nhận `currentPassword` và `email` hoặc `newPassword`. Trả `204`, thu hồi toàn bộ phiên. Mật khẩu hiện tại sai trả `403`, email đã dùng trả `409` |
| `GET /profile/avatar` · `PUT /profile/avatar` · `DELETE /profile/avatar` | Chính chủ | Đọc JPEG qua đường dẫn phiên bản của hồ sơ, tải/thay ảnh qua trường multipart `image`, xóa ảnh trả `204` |
| `GET /catalog/species` | Có phiên | `200` danh sách loài đang bật để theo dõi. Khi bổ sung chẩn đoán, luồng nhận ảnh kiểm tra riêng danh sách loài có trong cấu hình mô hình |
| `GET /plants` · `POST /plants` | Có phiên | `200` danh sách của mình, `201` tạo cây từ `speciesCode`, `nickname`, `plantedOn` và `note` |
| `GET /plants/{plantId}` · `PATCH /plants/{plantId}` | Chủ sở hữu | `200` xem, đổi tên, cập nhật ghi chú/ngày trồng hoặc đặt `archived` để ngừng theo dõi. Loài cố định từ lúc tạo |
| `GET /plants/{plantId}/care-logs` · `POST /plants/{plantId}/care-logs` | Chủ sở hữu | `200` danh sách, `201` thêm mốc gồm `activity`, `note`, `happenedAt` |
| `POST /plants/{plantId}/notes` | Chủ sở hữu | `201` thêm ghi chú có `happenedAt` và nội dung chữ hoặc ảnh. Gửi JSON cho chữ hoặc multipart lặp trường `images` tối đa bốn lần, tổng tối đa 8 MiB. Trường `image` cho một ảnh vẫn dùng được |
| `PATCH /plants/{plantId}/notes/{logId}` | Chủ sở hữu | `200` sửa `happenedAt` cho ghi chú, giữ ảnh đã gắn |
| `GET /plants/{plantId}/care-logs/{logId}/photos/{photoId}` · `GET /plants/{plantId}/care-logs/{logId}/photo` | Chủ sở hữu | `200` đọc JPEG theo ID hoặc ảnh đầu tiên, `404` nếu sai chủ hoặc ảnh vắng mặt |
| `GET /diagnoses` · `POST /diagnoses` | Có phiên | `200` lịch sử, lọc theo `plantId` nếu có; `202` nhận ảnh và xếp công việc nền |
| `GET /diagnoses/{diagnosisId}` · `GET /diagnoses/{diagnosisId}/photo` | Chủ sở hữu | `200` trạng thái/kết quả hoặc ảnh riêng tư với `Cache-Control: private, no-store` |
| `POST /diagnoses/{diagnosisId}/retry` | Chủ sở hữu | `202` xếp lại chẩn đoán `failed` đủ điều kiện, trả cùng ID và `Location` |
| `DELETE /diagnoses/{diagnosisId}` | Chủ sở hữu | `204` sau khi bỏ quyền đọc ảnh/kết quả và ghi nhận công việc xóa ảnh bền vững |
| `GET /plants/{plantId}/share` · `PUT /plants/{plantId}/share` | Chủ sở hữu | `200` đọc hoặc đổi trạng thái chia sẻ cho cây đang theo dõi hoặc đã lưu trữ. Bài dùng `title` và `caption` do chủ cây chọn. Bật `includeHistory` để chia sẻ cả lịch sử và ảnh |
| `GET /community/plants` | Có phiên | `200` danh sách cây được chia sẻ, kèm bí danh, loại cây và số bình luận |
| `GET /community/plants/{plantId}` | Có phiên | `200` chi tiết bài chia sẻ và trạng thái chia sẻ lịch sử |
| `GET /community/plants/{plantId}/notes` · `GET /community/plants/{plantId}/diagnoses` | Có phiên | `200` các trang nhật ký và lần kiểm tra khi chủ cây bật chia sẻ lịch sử. Ảnh dùng đường dẫn dưới bài cộng đồng và trả `404` khi mất quyền đọc |
| `GET /community/plants/{plantId}/comments` · `POST /community/plants/{plantId}/comments` | Có phiên | `200` danh sách hoặc `201` bình luận về cây được chia sẻ. Nội dung gửi trong `body` |
| `DELETE /community/plants/{plantId}/comments/{commentId}` | Tác giả bình luận hoặc chủ cây | `204` xóa bình luận |
| `GET /community/posts` · `POST /community/posts` | Có phiên | `200` các trang bài đăng hoặc `201` tạo bài gắn cây của mình, ghi chú/ngày và tối đa bốn ảnh |
| `GET /community/posts/{postId}` · `PATCH /community/posts/{postId}` · `DELETE /community/posts/{postId}` | Đọc theo quyền chia sẻ; sửa/xóa chính chủ | `200` chi tiết/sửa, `204` xóa cùng bình luận và ảnh liên quan |
| `PUT /community/posts/{postId}/reaction` | Có phiên, bài đang hiển thị | Cảm xúc `heart`, `cry`, `laugh` hoặc `null`; trả số đếm thật và cảm xúc của mình |
| `GET /community/posts/{postId}/comments` · `POST /community/posts/{postId}/comments` | Đọc theo quyền bài; ghi khi bài đang hiển thị | Phân trang từng tầng bằng `parentId`, nhận chữ hoặc tối đa bốn ảnh |
| `PUT /community/posts/{postId}/comments/{commentId}/like` · `DELETE /community/posts/{postId}/comments/{commentId}` | Thích: thành viên; xóa: tác giả hoặc chủ bài | Nhận `{liked}`, hoặc xóa bình luận cùng toàn bộ nhánh trả lời |
| `GET /community/posts/{postId}/notes` · `GET /community/posts/{postId}/diagnoses` | Có phiên, cả bài và cây cho phép chia sẻ lịch sử | Lịch sử/ảnh phân trang độc lập, thu hồi ngay khi tắt chia sẻ |
| `GET /chat` | Có phiên | Tối đa 30 lượt đã lưu, trạng thái bật mô hình và `screeningEnabled` cho biết backend có cấu hình dịch vụ ảnh |
| `POST /chat` | Có phiên và CSRF | Hỏi đáp chăm cây và cách dùng PlantCare, hiểu tiếng Việt không dấu, lỗi gõ và câu nối tiếp. Dùng requestId để gửi lại an toàn, diagnosisId để đính kèm ảnh và contextDiagnosisId để hỏi về một ảnh. Có thể trả lời, hỏi thêm hoặc từ chối ngoài phạm vi. Phản hồi có thể có interpretation khi cần xác nhận cách hiểu và origin để nhận biết nguồn trả lời |
| `GET /chat/screening/{id}` | Chủ sở hữu | Trạng thái, dấu hiệu và kế hoạch theo ngày |
| `GET /auth/email-verification` | Có phiên | Trạng thái xác minh email và cấu hình gửi mã |
| `POST /auth/email-verification/send` | Có phiên và CSRF | Gửi mã email 6 chữ số theo hạn mức |
| `POST /auth/email-verification/confirm` | Có phiên và CSRF | Xác minh bằng trường code |
| `GET /admin/accounts` · `PATCH /admin/accounts/{accountId}` | Admin | Tìm tài khoản, khóa/mở bằng `{disabled}`; khóa thu hồi toàn bộ phiên |
| `GET /admin/posts` · `PATCH /admin/posts/{postId}` | Admin | Tìm bài và ẩn/hiện bằng `{hidden}`; không xóa nội dung khi ẩn |

Danh sách lịch sử và nhật ký dùng `cursor` và `limit`, sắp xếp ổn định từ mới đến cũ. Swagger UI tại `/docs` ở local/staging, bật kiểm soát truy cập ở staging. Kiểm thử bằng hai phiên User và một phiên Admin. [Kịch bản Swagger](../06-kiem-thu/swagger.md) · [Chi tiết cộng đồng, ảnh và consent](cong-dong.md)

Ở bản local, `GET /plants` trả `{ items, nextCursor }`, mặc định lấy cây đang theo dõi. `archived=true` lấy cây đã lưu trữ. Danh sách cây và nhật ký nhận `limit` từ 1 đến 100 và mặc định 20. Nhật ký trả `isJournalNote`, `photoUrls` theo thứ tự tải lên và `photoUrl` cho ảnh đầu tiên. API `/notes` hỗ trợ cả cây đang theo dõi và đã lưu trữ. API ghi hoạt động `/care-logs` dùng cho cây đang theo dõi, với `activity` là `watering`, `fertilizing` hoặc `observation`.

## Nhận ảnh và trả kết quả

Bản local dùng Python `visual-screening-1` để sàng lọc vùng vàng và đốm sẫm ở cà chua, dưa leo, ớt, húng quế và bạc hà. Kết quả hoàn tất có thêm `possibleCauses` và `careSteps` theo dấu hiệu và loài đã chọn. `healthy` ở bản này có nghĩa chưa thấy hai dấu hiệu trên đủ rõ trong vùng ảnh quan sát. Hồ sơ từng cây lấy lại lịch sử bằng `GET /diagnoses?plantId=...`, gồm lần kiểm tra cũ và ảnh riêng tư. Sàng lọc và nhật ký dùng chung giới hạn tải ảnh đồng thời là một lượt mỗi tài khoản và hai lượt toàn tiến trình. Hàng đợi sàng lọc có giới hạn ba công việc chưa kết thúc mỗi tài khoản và 30 toàn hệ thống.

1. `POST /diagnoses` nhận `multipart/form-data` với `image` và `speciesCode` bắt buộc, `plantId` tùy chọn và header `Idempotency-Key`. Khi gắn cây, kiểm tra quyền sở hữu và trả `422` nếu loài đã chọn khác loài của cây. Giới hạn đề xuất là 8 MiB cho phần ảnh, tối đa 16 megapixel sau giải mã. Chấp nhận JPEG, PNG, WebP hợp lệ. Server chuẩn hóa ảnh và bỏ metadata trước khi lưu.
2. `202` trả ID, `status` và header `Location` sau khi ảnh và công việc nền đã được ghi nhận. Gửi lại cùng khóa và cùng nội dung trả `200` với ID, trạng thái hiện tại và `Location` của bản ghi đã tạo. Cùng khóa khác nội dung trả `409`. Trong 24 giờ sau khi xóa chẩn đoán, gửi lại bằng khóa cũ trả `410`. Client tạo khóa mới cho mỗi lần gửi có chủ ý.
3. Client đọc `GET /diagnoses/{diagnosisId}` sau khoảng 2 giây, tăng dần thời gian chờ và dừng khi rời trang hoặc khi trạng thái là `completed` hay `failed`. Chẩn đoán `completed` có `outcome` là `disease`, `healthy` hoặc `uncertain`, cùng điểm tin cậy và phiên bản mô hình. `speciesCode` vẫn là loài đầu vào mà User đã chọn.
4. Kết quả `completed` lưu điểm và phiên bản mô hình. `disease` trả mã bệnh, phiên bản mô hình và hướng dẫn đã duyệt nếu có. `healthy` hiển thị rằng mô hình chưa thấy dấu hiệu thuộc các bệnh được hỗ trợ. `uncertain` đưa hướng dẫn chụp lại. `failed` trả mã lỗi chung, mã theo dõi `requestId` và `retryable` để giao diện hiển thị hành động phù hợp với lỗi và trạng thái ảnh.

## Thử lại chẩn đoán bị lỗi

`POST /diagnoses/{diagnosisId}/retry` yêu cầu phiên của chủ chẩn đoán và `X-CSRF-Token`. Chỉ nhận chẩn đoán `failed` có lỗi cho phép thử lại và bản ghi ảnh ở trạng thái sẵn sàng. API áp dụng hạn mức theo tài khoản và toàn hệ thống như khi tiếp nhận ảnh mới. Nếu phát hiện kho ảnh tạm thời gián đoạn, trả `503`.

Trong một giao dịch, API khóa job và chẩn đoán, kiểm tra lại trạng thái và sức chứa rồi đưa chẩn đoán về `queued`, xóa lỗi cũ, đặt số lần thử về 0, đặt thời điểm khả dụng về hiện tại và xóa lease cũ. ID chẩn đoán, ảnh đã lưu và job được dùng lại. Yêu cầu khác gặp trạng thái `queued`, `processing` hoặc `completed` sau khi khóa sẽ trả `409`. `202` trả ID, `status` và `Location` để client tiếp tục theo dõi. Nếu mất phản hồi, client gọi `GET /diagnoses/{diagnosisId}` để đồng bộ trước khi cho phép thao tác thử lại. Gửi lại yêu cầu tải ảnh bằng khóa cũ vẫn trả `200` với chẩn đoán hiện có.

## Lỗi và giới hạn tải

Trả lỗi JSON có `code`, `message` và `requestId`. Giá trị trả về giúp người dùng hoặc người kiểm thử xử lý lỗi mà không đưa dữ liệu riêng vào log.

| Mã | Khi dùng |
| --- | --- |
| `400`, `413`, `415`, `422` | Sai cấu trúc, ảnh quá giới hạn byte hoặc số điểm ảnh, định dạng không hỗ trợ, hoặc ảnh hỏng, loài không hợp lệ hay khác loài của cây được gắn |
| `409`, `410` | Khóa gửi lại xung đột hoặc chẩn đoán không đủ điều kiện thử lại (`409`), khóa cũ của chẩn đoán đã xóa còn trong thời hạn giữ dấu (`410`) |
| `429` | Vượt giới hạn theo tài khoản/IP hoặc ba chẩn đoán chưa kết thúc của tài khoản ở cấu hình local |
| `503` | Đạt 30 chẩn đoán chưa kết thúc toàn hệ thống ở cấu hình local, hoặc phụ thuộc thiết yếu tạm thời không sẵn sàng |

Kèm `Retry-After` khi giới hạn có thể thử lại. Kiểm tra sức tải theo [kế hoạch kiểm thử](../06-kiem-thu/README.md) trước khi chốt các ngưỡng.

## Quản trị đã triển khai

Nguồn: [router](../../backend/src/modules/admin/router.ts), [OpenAPI](../../backend/src/modules/admin/openapi.ts), [migration 0010](../../backend/migrations/0010_admin.sql).

- Cả bốn route `/admin/accounts` và `/admin/posts` yêu cầu phiên Admin. PATCH yêu cầu CSRF; quyền Admin và phiên còn hiệu lực được kiểm tra lại trong giao dịch.
- Danh sách nhận `search` tối đa 120 ký tự, `limit` 1–50 mặc định 20 và `cursor`. Tài khoản sắp UUID tăng dần, bài đăng sắp thứ tự tạo giảm dần. Trả `{items,nextCursor}`.
- Tài khoản trả `id,email,displayName,phone,role,disabled`. Tìm theo email/tên. PATCH chỉ nhận `{disabled:boolean}`. Khóa thu hồi phiên, làm nội dung công khai của tài khoản mất quyền đọc. Không cho Admin tự khóa hoặc khóa Admin hoạt động cuối cùng (`409`). Mở lại không khôi phục phiên đã thu hồi.
- Bài quản trị trả `id,plantId,title,note,author,email,createdAt,hidden`. Tìm theo tiêu đề/nội dung/tên/email. PATCH chỉ nhận `{hidden:boolean}`. Tác giả còn thấy trạng thái bị ẩn trong danh sách của mình; sửa bài không tự bỏ trạng thái kiểm duyệt.
- Email/số điện thoại chỉ có ở API quản trị được cấp quyền, không đưa sang phản hồi cộng đồng. Mọi thay đổi ghi audit cùng giao dịch; log không giữ nội dung riêng trước/sau.
- Admin ban đầu được cấp bằng [CLI bootstrap](../../backend/src/modules/admin/bootstrap.ts) cho tài khoản đã đăng ký, qua môi trường vận hành có `DATABASE_URL`. Không có tài khoản/mật khẩu quản trị mặc định hoặc API tự nâng quyền.

CRUD danh mục bệnh/hướng dẫn và dashboard vận hành vẫn là phạm vi sau; chưa có route `/admin/catalog`, `/admin/species` hoặc `/admin/operations` trong bản này.

## Lịch chăm sóc và thông báo trong app

Người dùng đã xác nhận triển khai lịch server. Nguồn: [router](../../backend/src/modules/schedules/router.ts), [recurrence](../../backend/src/modules/schedules/recurrence.ts), [worker](../../backend/src/modules/schedules/worker.ts), [OpenAPI](../../backend/src/modules/schedules/openapi.ts), [migration 0011](../../backend/migrations/0011_schedules.sql).

| Phương thức và đường dẫn | Hợp đồng |
| --- | --- |
| `GET /schedules` | Lịch của mình chưa xóa; `{items,nextCursor}`, UUID tăng dần, `limit` 1–100 mặc định 100 |
| `POST /schedules` | `201` tạo; `200` trả lại bản cũ khi cùng `clientId` của tài khoản; cây phải thuộc mình và đang theo dõi |
| `PATCH /schedules/{scheduleId}` | `200` cập nhật một hoặc nhiều trường; sai chủ trả `404` |
| `DELETE /schedules/{scheduleId}` | `204` xóa mềm, tắt lịch và bỏ lần chạy tiếp; giữ thông báo đã tạo |
| `GET /notifications` | `{items,nextCursor,unreadCount}` chỉ của mình; mới nhất trước, `limit` 1–50 mặc định 20 |
| `PATCH /notifications/{notificationId}/read` | Gửi `{}`, trả thông báo đã đọc; lặp lại giữ thời điểm đọc đầu tiên |
| `PATCH /notifications/read-all` | Gửi `{}`, trả `{updated}` số thông báo vừa đánh dấu đọc |

Các thao tác ghi yêu cầu phiên, Origin và CSRF. Tạo/sửa/xóa lịch giới hạn tần suất theo tài khoản. Không dùng các route đề xuất cũ `/care-schedules`, `/care-tasks`, `/notification-preferences` hoặc `/push-subscriptions`.

Request tạo lịch gồm `plantId`, `activity`, `title`, `startDate`, `time`, `recurrence`, `interval`, `active`, cùng `clientId` UUID tùy chọn. PATCH nhận các trường tương tự trừ `clientId`; không cho trường lạ. `activity`: `watering|fertilizing|observation|pruning|repotting|custom`. `title` dài 1–120 ký tự, `startDate` là ngày hợp lệ `20xx-MM-DD`, `time` dạng `HH:mm`, `recurrence`: `once|daily|weekly|monthly`, `interval` từ 1 đến 365. Tối đa 500 lịch chưa xóa/tài khoản.

Response lịch thêm `id,nextRunAt,timezone`. Bản này cố định `Asia/Ho_Chi_Minh` (UTC+7), không nhận timezone do client gửi. Lặp theo tháng giữ ngày gốc và dùng ngày cuối tháng ngắn. Worker chạy khoảng 10 giây/lượt, giữ PostgreSQL làm nguồn thật, khóa giao dịch chống xử lý trùng. Sau gián đoạn chỉ nhắc lần gần nhất đã đến hạn rồi tiến tới tương lai, không gửi toàn bộ các lần bỏ lỡ. Lịch một lần trong quá khứ tạo một lời nhắc rồi tắt.

Thông báo trả `id,title,body,plantId,createdAt,readAt`; `unreadCount` tính toàn tài khoản và không phụ thuộc trang hiện tại. Chuông giao diện đọc từ API bằng polling, không báo đã gửi Web Push. Cây lưu trữ hoặc tài khoản bị khóa không phát sinh lời nhắc trong thời gian đó. Nhập lịch cũ từ trình duyệt dùng `clientId` chống trùng theo tài khoản và chỉ xóa bản local sau khi mọi mục nhập thành công. `clientId` đã bị xóa mềm trả `410`, không tự tạo lại.

Chưa triển khai hoàn thành/bỏ qua task, `care_occurrences`, tự ghi nhật ký từ lịch, preferences, quiet hours, timezone tùy chọn hoặc Browser Push. Không coi thông báo đã đọc là hoàn thành chăm sóc.

**OTP đăng ký và đổi email**: POST /auth/register/send nhận email, trả challengeId. POST /auth/register yêu cầu cả challengeId và code. POST /profile/credentials/email/send cần phiên, CSRF, email mới và currentPassword. PATCH /profile/credentials cần thêm challengeId và code khi đổi email. POST /chat có thể nhận plantId của cây đang theo dõi thuộc tài khoản. Xem [pipeline và quyền](pipeline-chat-va-anh.md).

Các API gửi mã đăng ký, đổi email và xác minh email trong Hồ sơ trả `429 EMAIL_CODE_LIMIT` cùng header `Retry-After` tính bằng giây khi đang trong thời gian chờ hoặc vượt hạn mức. Nếu dịch vụ email báo lỗi, API trả `503 EMAIL_DELIVERY_UNAVAILABLE` và xóa yêu cầu gửi vừa thất bại.
