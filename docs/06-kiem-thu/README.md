# Kế hoạch kiểm thử PlantCare AI

Trang này là kế hoạch; kết quả từng lượt ở [biên bản](bien-ban.md). Các smoke script local 0.5 đã có kết quả riêng, không có nghĩa toàn bộ ca tải/VPS/AI dưới đây đã chạy. Xem [kịch bản Swagger](swagger.md).

## Trình tự kiểm thử

| Bước | Phạm vi | Điều kiện qua bước |
| --- | --- | --- |
| 1. Kiểm thử trong CI | Hàm kiểm tra dữ liệu, phân quyền, chuyển trạng thái chẩn đoán, ánh xạ nhãn mô hình, tạo và thu hồi phiên | Bộ kiểm thử tự động và bước kiểm tra OpenAPI chạy đạt trên PR |
| 2. Tích hợp Docker Compose | API Node.js với PostgreSQL, MinIO và Python. Tạo schema từ cơ sở dữ liệu trống, thử nâng cấp từ bản trước khi đã có migration | Luồng tài khoản, cây, nhật ký, ảnh và chẩn đoán chạy với dữ liệu thử. Dùng bộ suy luận giả lập để tái hiện lỗi, sau đó chạy smoke test với mô hình thật |
| 3. Nghiệm thu staging | Swagger qua HTTPS, trình duyệt máy tính và điện thoại, Cloudflare và bucket R2 riêng của staging | Luồng chính qua Swagger và giao diện chạy đạt. Phân quyền, bí mật, xử lý ảnh và hành vi khi có lỗi được xác minh |
| 4. Tải, phục hồi và triển khai | Tải trên VPS staging, khởi động lại dịch vụ, phục hồi từ backup, kiểm tra sau khi triển khai | Đạt ngưỡng nhóm đã duyệt hoặc ghi rõ mục chưa đạt và gắn issue. Lưu mã commit, phiên bản mô hình và cấu hình máy đo |

## Kịch bản ngoài Swagger

| ID | Tình huống | Kỳ vọng |
| --- | --- | --- |
| UI-01 | Điện thoại cấp hoặc từ chối quyền camera, chọn ảnh thư viện, gửi ảnh khi mạng chậm | Có ảnh xem trước và lựa chọn thay ảnh. Có thể chuyển sang tải tệp khi camera bị từ chối. Trạng thái tải và xử lý hiển thị rõ, nút gửi không tạo bản ghi trùng |
| UI-02 | Đóng rồi mở lại trang khi AI đang chạy, thử tải lại sau lỗi mạng, bấm thử lại khi chẩn đoán báo lỗi tạm thời | Lấy trạng thái chẩn đoán đã tạo. Nút thử lại tiếp tục trên cùng ID và lịch sử chỉ có một mục cho lần chẩn đoán đó. Cây và lịch sử vẫn xem được khi AI chậm |
| SEC-01 | Hai User thử đọc/sửa cây, đọc/thêm nhật ký, đọc ảnh và đọc/xóa chẩn đoán của nhau bằng ID lấy từ tài khoản thử | API từ chối truy cập, kể cả khi thay ID trong payload. Kiểm tra cả danh sách và chi tiết. User tự đăng ký chỉ nhận quyền User |
| SEC-02 | Đăng nhập sai liên tiếp, sử dụng cookie đã thu hồi, gửi yêu cầu thay đổi từ origin khác và gửi yêu cầu có phiên nhưng thiếu `X-CSRF-Token` | Có giới hạn đăng nhập, phiên hết hiệu lực sau đăng xuất, yêu cầu giả mạo bị từ chối. Cookie phiên trên HTTPS có `HttpOnly`, `Secure` và cấu hình `SameSite` theo thiết kế |
| SEC-03 | Tải ảnh giả mạo JPEG/PNG/WebP, ảnh hỏng, ảnh vượt 8 MiB hoặc vượt 16 MP sau giải mã, ảnh chứa EXIF có tọa độ thử | API từ chối ảnh không hợp lệ với lỗi rõ ràng. Ảnh lưu lại sau khi xử lý không còn metadata vị trí. Bucket không cấp truy cập ẩn danh |
| SEC-04 | Gửi dữ liệu thử có giá trị đánh dấu riêng qua đăng nhập và tải ảnh, đối chiếu phản hồi, log, cấu hình công khai và dữ liệu lưu | Mật khẩu được băm. Mật khẩu, token, cookie, khóa, ảnh và dữ liệu cá nhân không xuất hiện trong log hoặc hiện vật CI. Giao diện và lỗi API chỉ trả thông tin cần thiết |
| DB-01 | Ghi trực tiếp chẩn đoán với ảnh sai chủ, cây sai chủ, cây đúng chủ nhưng sai loài, loài đã chọn bị thiếu hoặc ID loài không tồn tại. Thử trường hợp hợp lệ với cây và chẩn đoán độc lập | PostgreSQL từ chối từng trường hợp sai. Chẩn đoán độc lập hợp lệ khi có ảnh của chính tài khoản, loài đã chọn và `cay_nguoi_dung_id` để trống |
| DB-02 | Thử tạo hai chẩn đoán từ cùng ID ảnh, hai job cho cùng chẩn đoán và job tham chiếu ID chẩn đoán không tồn tại. Mô phỏng lỗi tạo job trong giao dịch tiếp nhận | PostgreSQL từ chối bản ghi trùng hoặc job mồ côi. Giao dịch tạo chẩn đoán được hoàn tác nếu tạo job thất bại |
| DB-03 | Ghi trạng thái hoặc kết quả ngoài danh sách, `completed` thiếu kết quả/điểm tin cậy/phiên bản mô hình, điểm ngoài 0–1, kết quả ở trạng thái chưa hoàn tất, và `failed` thiếu mã lỗi. Thử thêm mã lỗi ở trạng thái khác hoặc thời điểm hoàn tất sai trạng thái | Ràng buộc PostgreSQL từ chối từng bản ghi sai. `completed` và `failed` có thời điểm kết thúc, mã lỗi chỉ có ở `failed` |
| DB-04 | Ghi kết quả `disease` thiếu bệnh, `healthy` hoặc `uncertain` kèm bệnh, bệnh thuộc loài khác hoặc hướng dẫn thuộc bệnh khác | Ràng buộc PostgreSQL từ chối từng bản ghi sai. `disease` hợp lệ có thể lưu phiên bản hướng dẫn đúng bệnh nếu có. `uncertain` hợp lệ có điểm tin cậy và phiên bản mô hình sau khi suy luận |
| AUD-01 | Thử thao tác quản trị hợp lệ và ghi một mã hành động ngoài danh sách cho phép. Đối chiếu bản ghi được tạo | Ràng buộc từ chối mã hành động lạ. Nhật ký có người thực hiện, hành động, loại và mã đối tượng, thời điểm. Payload trước/sau và dữ liệu riêng nằm ngoài bản ghi |
| AI-01 | Tập ảnh có nhãn của từng lớp được duyệt, có cây khỏe, điều kiện chụp khác nhau và ảnh ngoài phạm vi | Báo cáo số ảnh theo lớp, precision, recall, macro-F1, ma trận nhầm lẫn và tỷ lệ từ chối. Giữ tập đánh giá độc lập theo cây hoặc nguồn ảnh để hạn chế ảnh trùng với tập huấn luyện |
| AI-02 | Ảnh mờ, không có lá, loài ngoài phạm vi hoặc điểm dự đoán thấp | Hiển thị trạng thái chưa xác định và hướng dẫn chụp lại hoặc kiểm tra thêm. Không suy diễn trạng thái cây khỏe từ độ tin cậy thấp |
| AI-03 | Có kết quả bệnh phù hợp, thử với hướng dẫn đã duyệt và tình huống thiếu hướng dẫn | Hiển thị đề xuất dựa trên hướng dẫn đã duyệt và lưu được phiên bản nguồn. Khi thiếu căn cứ, giao diện báo thiếu hướng dẫn. Không sinh tên thuốc hay liều lượng ngoài nguồn duyệt |
| JOB-01 | Gửi lặp cùng yêu cầu, chạy hai worker, ngắt worker giữa chừng, mô phỏng Python timeout hoặc kho ảnh gián đoạn | Khóa chống trùng giữ nguyên ID. Worker tự thử lại cùng job với bộ đếm tiếp tục tăng và thời gian chờ giãn dần. Hết lượt thử chuyển sang `failed`. Kết quả từ lượt giữ việc cũ bị từ chối |
| JOB-02 | Tạm dừng worker, tạo một chẩn đoán `failed` với lỗi có thể thử lại và ảnh hợp lệ, rồi gửi hai yêu cầu thử lại đồng thời. Kiểm tra PostgreSQL và kho ảnh trước khi cho worker chạy tiếp | Một yêu cầu trả `202`, yêu cầu còn lại trả `409`. Giữ nguyên ID chẩn đoán, ảnh và job. Bản ghi trở lại `queued`, bộ đếm về `0`, job có thể chạy ngay, thông tin giữ việc và lỗi/kết quả cũ được xóa. Sau khi chạy lại, worker ghi tối đa một kết quả cho lượt giữ việc hiện tại |
| JOB-03 | Thử lại khi vượt hạn mức tài khoản hoặc hàng đợi chung, khi lỗi đã được xác định là cố định, hoặc khi bản ghi ảnh chưa sẵn sàng | Trả mã theo hợp đồng API và giữ nguyên bản ghi `failed`. Khi lỗi chỉ do quá tải, chủ sở hữu có thể thử lại sau khi hệ thống còn sức chứa |
| OPS-01 | Truy cập domain staging, kiểm tra chứng chỉ và tắt/khởi động lại các container trong lúc xử lý | HTTPS tại Cloudflare và kết nối tới VPS ở chế độ `Full (strict)` hoạt động. Cổng PostgreSQL và Python chỉ mở nội bộ. Dữ liệu đã ghi tồn tại sau khi khởi động lại, job dang dở được thu hồi để xử lý tiếp |
| OPS-02 | Khôi phục PostgreSQL từ bản sao trước khi xóa dữ liệu, đối chiếu ảnh và sổ xóa, mô phỏng triển khai lỗi | Đo thời gian phục hồi và lượng dữ liệu mất theo thực tế. Dữ liệu đã xóa vẫn không thể truy cập sau khôi phục. Khi quay lại bản triển khai tương thích schema, luồng chính chạy đạt |

## Kiểm thử lịch và thông báo

Phạm vi 0.5: CRUD `/schedules`, nhập local bằng `clientId`, UTC+7, worker tạo lời nhắc và `/notifications`. `scripts/smoke-admin-schedules.mjs` kiểm tra tích hợp với PostgreSQL thật. Các ca trong bảng dùng occurrence, complete/skip, preferences hoặc Web Push là kế hoạch mở rộng, chưa phải tiêu chí cho route không tồn tại.

| ID | Tình huống | Kỳ vọng |
| --- | --- | --- |
| CS-01 | Tạo schedule once/daily/weekly/monthly cho cây thuộc User | Rule và occurrence đầu tiên hợp lệ; activity/tz/interval/status được validate; cây của account khác trả 404/422 theo hợp đồng. |
| CS-02 | Tạo schedule mỗi N ngày/tuần/tháng | Next due bám anchor và interval; tháng 31 clamp đúng policy; không sinh occurrence trùng. |
| CS-03 | DST spring-forward/fall-back và timezone thay đổi | Spring gap/fall overlap theo policy đã duyệt; care log cũ không đổi; next due tuyệt đối đúng. |
| CS-04 | Sửa schedule/occurrence, pause, delete, archive cây | Future occurrence áp dụng thay đổi; occurrence đã tạo giữ lịch sử; archive không sinh thêm; delete không xóa care log. |
| CS-05 | Server offline nhiều ngày rồi restart | Worker phục hồi, không phát sinh backlog trùng; overdue được đánh dấu và next due tiến tới tương lai. |
| CS-06 | Complete sớm, muộn, skip và complete lặp lại | Complete tạo tối đa một care log, skip kết thúc đúng occurrence, complete muộn giữ scheduled time. |
| CS-07 | Hai worker claim cùng schedule đồng thời | Một occurrence và một notification cho mỗi unique key; row lock/unique chống trùng. |
| CS-08 | Crash sau khi tạo DB notification nhưng trước push | Notification DB còn, delivery worker retry; polling/push không tạo notification trùng. |
| CS-09 | Đánh dấu read/all-read | Chỉ account sở hữu có thay đổi; repeat request không làm tăng count sai. |
| CS-10 | PostgreSQL, push provider hoặc MinIO tạm gián đoạn | API DB trả 503/Retry-After; notification DB vẫn nhất quán; push retry và subscription expiry được xử lý. |
| CS-11 | Push bị từ chối/không hỗ trợ/endpoint 404-410 | Không xin quyền ngoài hành động chủ động; UI ghi rõ chưa đăng ký; subscription vô hiệu được dọn. |
| CS-12 | Migration trên DB có care_logs hiện có | Dữ liệu cũ không mất; activity hiện tại vẫn dùng watering/fertilizing/observation; migration mới chỉ mở rộng theo thiết kế đã duyệt. |

Các test recurrence cần unit test timezone/DST và tháng ngắn, integration test transaction/worker/owner, E2E test thêm-sửa-pause-hoàn thành và notification center. Không ghi fake success nếu Compose/DB chưa chạy.

## Tải và phục hồi đề xuất

- Đo mốc ban đầu bằng k6 trên staging với VPS 2 vCPU, 4 GB RAM, 30 phiên đồng thời trong 15 phút. Kết hợp xem cây, mở lịch sử, kiểm tra trạng thái và gửi tổng cộng 2 yêu cầu chẩn đoán mỗi phút. Ghi kích thước ảnh, số worker và phiên bản mô hình để có thể lặp lại.
- Mục tiêu ban đầu cho tải trên là p95 của API đọc dưới 500 ms, lỗi 5xx dưới 1% và p95 từ khi nhận `202` đến khi trả kết quả cho ảnh hợp lệ dưới 30 giây. Báo cáo riêng tỷ lệ chẩn đoán thất bại và số lượt bị giới hạn. Chốt ngưỡng chất lượng AI khi thống nhất bộ ảnh và phạm vi bệnh.
- Tăng đột biến lượt gửi ảnh để chạm ngưỡng dự kiến 5 job chờ hoặc đang xử lý trên mỗi tài khoản (`429`) và 100 job toàn hệ thống (`503`). Theo dõi độ sâu và thời gian chờ hàng đợi, CPU, RAM, pool PostgreSQL và thời gian hàng đợi trở về bình thường. Khi chạm ngưỡng, API vẫn phục vụ tra cứu cây và phản hồi có thể thử lại cho yêu cầu mới.
- Mục tiêu phục hồi ban đầu là RPO tối đa 24 giờ và RTO tối đa 2 giờ. Đo trên staging từ thời điểm bắt đầu sự cố giả lập đến khi kiểm tra khôi phục thành công. VPS đơn vẫn cần diễn tập khôi phục từ bản sao nằm ngoài VPS.

Tài liệu tham khảo cho ngưỡng đo và cấu hình staging. [Grafana k6](https://grafana.com/docs/k6/latest/using-k6/thresholds/) · [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

[Kịch bản nghiệm thu chat, OTP và ảnh bài viết](../03-kien-truc/nang-cap-chat-otp.md#nghiệm-thu-staging).
