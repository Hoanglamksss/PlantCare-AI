# Vòng đời dữ liệu

## Thực thi local và quyền chia sẻ 0.5

- Node ghi bản ghi ảnh `pending_delete` trước khi ghi JPEG đã bỏ metadata vào MinIO. Giao dịch tiếp nhận đổi ảnh sang `ready` và tạo kết quả cùng job. Nếu việc ghi ảnh hoặc giao dịch không hoàn tất, worker dọn theo bản ghi đã đánh dấu.
- Các thao tác nhận, thử lại, ghi kết quả và xóa dùng cùng khóa giao dịch PostgreSQL. Worker lưu lease khi nhận job và xác minh token khi hoàn tất. Giới hạn thực tế của bản local là ba ảnh chưa kết thúc mỗi tài khoản và 30 ảnh toàn hệ thống. Phần dưới ghi thiết kế vòng đời tổng thể.
- Cộng đồng đọc bài/ảnh đã đăng, danh mục loài và bí danh. Nhật ký/ảnh/kết quả của cây chỉ đọc khi đồng thời được cây và bài cho chia sẻ lịch sử; email, số điện thoại, avatar và ghi chú riêng của hồ sơ cây không có trong phản hồi thành viên. Tắt quyền tổng thu hồi mọi bài/ảnh/lịch sử với người khác; chủ vẫn xem được dữ liệu mình. [Quyền chi tiết](../03-kien-truc/cong-dong.md)

## Tiếp nhận và lưu ảnh

1. Node.js xác thực phiên, kiểm tra khóa gửi lại theo tài khoản và đối chiếu `speciesCode` với loài của cây thuộc User nếu có `plantId`. Giới hạn kích thước tệp, số pixel sau giải mã và số ảnh đang được xử lý đồng thời. Giải mã rồi xuất lại ảnh để bỏ EXIF/GPS và kiểm tra định dạng thực.
2. Lưu ảnh vào bucket riêng tư dưới `khoa_doi_tuong` ngẫu nhiên cho mỗi lần tải lên. Đặt thời hạn toàn luồng từ khi bắt đầu ghi ảnh đến khi phải hoàn tất đăng ký ảnh trong PostgreSQL.
3. Sau khi lưu ảnh, mở giao dịch ngắn để kiểm tra lại trạng thái tài khoản, khóa gửi lại, kể cả khóa của chẩn đoán đã xóa, và số công việc đang chờ hoặc xử lý. Tuần tự hóa đoạn kiểm tra giới hạn và thêm công việc bằng khóa giao dịch dùng chung. Tạo `images`, `diagnoses` ở `queued` và `diagnosis_jobs` trong cùng giao dịch. Trả `202` cho yêu cầu mới khi giao dịch đã ghi thành công.
4. Nếu lưu ảnh thành công nhưng giao dịch thất bại, hoặc một lần gửi đồng thời đã tạo chẩn đoán, tiến trình đối soát dọn object mồ côi. Chỉ xét object đã qua khoảng đệm dài hơn thời hạn đăng ký ảnh. Dùng khóa giao dịch theo `khoa_doi_tuong` cho cả lúc đăng ký và đối soát. Sau khi lấy khóa, bên đăng ký kiểm tra lại hạn và bên đối soát xác minh object chưa có bản ghi trước khi xóa. Hủy đăng ký sau khi hết hạn, kể cả khi tác vụ tải lên trả kết quả muộn. Tạm dừng dọn khi PostgreSQL không truy cập được.
5. Node.js kiểm tra quyền chủ sở hữu và trạng thái ảnh `ready` trước khi truyền ảnh từ bucket qua API có xác thực. Dùng `Cache-Control: private, no-store`. Admin quản lý danh mục và xem số liệu vận hành tổng hợp. Nhật ký chăm sóc và ảnh thuộc phạm vi tài khoản sở hữu.

## Nhận việc, thử lại và ghi kết quả

1. Worker Node.js chọn job đến hạn của chẩn đoán `queued`, bỏ qua job đang khóa bằng `FOR UPDATE SKIP LOCKED`. Sau khi khóa job rồi chẩn đoán và kiểm tra lại điều kiện, tăng `so_lan_thu`, cấp `token_nhan` mới và đặt `het_han_thue_luc`. Commit trạng thái `processing` trước khi gửi ảnh và loài đã chọn cho Python. [Khóa bản ghi khi truy vấn PostgreSQL](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
2. Python trả nhãn, điểm và phiên bản mô hình. Suy luận hợp lệ có điểm thấp hoặc ảnh ngoài phạm vi đi theo nhánh `uncertain`. Với nhãn bệnh đã xác định, Node.js chọn phiên bản hướng dẫn đã xuất bản của đúng bệnh. `huong_dan_id` giữ phiên bản dùng cho đề xuất và lịch sử. Khi bệnh chưa có hướng dẫn, giao diện báo hướng dẫn chưa khả dụng.
3. Worker chỉ ghi kết quả khi chẩn đoán còn `processing`, lease chưa hết hạn và `token_nhan` vẫn trùng. Ghi kết quả, `hoan_tat_luc` và xóa lease trong cùng giao dịch. Khi gặp lỗi tạm thời hoặc khi tiến trình thu hồi phát hiện lease đã hết hạn, xóa lease cũ, đưa chẩn đoán về `queued` và dời `kha_dung_luc` theo thời gian chờ tăng dần, giữ `so_lan_thu`. Với lỗi cố định hoặc khi hết số lượt tự động, ghi `failed`, `ma_loi` và `hoan_tat_luc`. Giữ dòng job ở cả hai trạng thái kết thúc.

### User thử lại sau `failed`

1. `POST /api/v1/diagnoses/{diagnosisId}/retry` lấy chủ sở hữu từ phiên và áp dụng cùng hạn mức tiếp nhận như gửi ảnh mới. Trong một giao dịch, khóa theo thứ tự tiếp nhận, job, chẩn đoán. Kiểm tra lại quyền, trạng thái `failed`, mã lỗi cho phép thử lại, ảnh `ready` và sức chứa trước khi cập nhật.
2. Đổi `trang_thai` về `queued` và xóa `ma_loi`, `hoan_tat_luc` cùng dữ liệu kết quả. Trên dòng job hiện có, đặt `so_lan_thu = 0`, `kha_dung_luc = now()`, xóa `token_nhan` và `het_han_thue_luc`. Giữ ID chẩn đoán, ảnh, job và khóa gửi lại ban đầu.
3. Commit rồi trả `202`. Yêu cầu đến sau thấy `queued`, `processing` hoặc `completed` thì trả `409` và giữ nguyên bộ đếm. Nếu phản hồi bị gián đoạn, giao diện đọc lại trạng thái trước khi cho User thử tiếp. Kết quả từ worker cũ bị loại qua kiểm tra token và hạn lease.

Mô hình đi kèm phiên bản và ánh xạ mã loài/nhãn. Danh sách hỗ trợ chẩn đoán là giao giữa danh mục đang bật và ánh xạ của mô hình. Việc thêm nhãn trong Admin cần bản mô hình có nhãn đó trước khi có thể dự đoán. Mã loài và mã bệnh đã dùng trong lịch sử được giữ ổn định.

## Xóa và sao lưu

- Khi xóa chẩn đoán, xóa công việc nền cùng bản ghi chẩn đoán, chuyển ảnh sang `pending_delete` và ghi khóa gửi lại đã băm với hạn 24 giờ trong một giao dịch. Dùng cùng khóa tiếp nhận với lúc tạo và thử lại chẩn đoán. Khóa job trước chẩn đoán theo cùng thứ tự với worker. Kết quả về muộn bị loại qua kiểm tra job và `token_nhan`.
- Tiến trình dọn ảnh thử lại khi lưu trữ lỗi. Nếu object đã vắng mặt, xem việc xóa thành công và dọn bản ghi ảnh. Tiến trình định kỳ xóa các khóa gửi lại đã hết hạn.
- Yêu cầu xóa tài khoản được tiếp nhận qua quy trình vận hành có xác minh danh tính của nhóm. Đánh dấu tài khoản cần xóa và thu hồi phiên trước. Dọn nhật ký, cây, chẩn đoán, khóa gửi lại và ảnh qua các bước có thể thử lại. Giữ thông tin cần thiết để dọn object, rồi xóa tài khoản khi hoàn tất. Lưu trữ cây chỉ ẩn khỏi danh sách cây đang theo dõi và giữ lịch sử cho User.
- Ghi bền vững yêu cầu xóa trước khi xác nhận với User. Dùng sổ xóa mã hóa ngoài VPS, chứa loại yêu cầu, ID nội bộ và thời điểm, có quyền truy cập riêng và giữ ít nhất đến khi bản sao cuối cùng có dữ liệu đó hết hạn. Ghi theo ID để thử lại an toàn. Khi VPS gián đoạn giữa hai bước, tiến trình vận hành tiếp tục xóa từ sổ.
- Giữ bản sao lưu mã hóa ngoài VPS và xác định thời hạn lưu trước triển khai. Khi diễn tập khôi phục PostgreSQL và ảnh, tạm dừng đối soát mồ côi, đối chiếu ảnh với bản ghi và thực hiện lại các yêu cầu xóa phát sinh sau thời điểm sao lưu. Mở truy cập sau khi kiểm tra xong.
- Ghi nhật ký vận hành bằng mã yêu cầu, mã lỗi và thời gian xử lý. Loại bỏ email, token, tên tệp gốc, nội dung nhật ký và ảnh khỏi log, báo cáo lỗi và mẫu kiểm thử.

## Vòng đời lịch và thông báo 0.5

1. POST ghi rule, ngày/giờ Việt Nam và `den_han_luc` vào PostgreSQL. Khi nhập lịch trình duyệt, `clientId` duy nhất theo tài khoản trả lại bản đã nhập; bản xóa mềm trả 410 để tránh phục hồi ngoài ý muốn.
2. Worker khoảng 10 giây tìm tối đa 50 lịch đến hạn đang bật, cây chưa lưu trữ và tài khoản còn hoạt động. PostgreSQL advisory lock và row lock ngăn hai lượt xử lý cùng lúc. Kiểm tra lại cây/tài khoản trong giao dịch.
3. Ghi thông báo cho lần gần nhất đã đến hạn bằng unique `(lich_id,hen_luc)` rồi tiến `den_han_luc` sang tương lai cùng giao dịch. Lịch một lần được tắt. Sau mất điện không phát sinh toàn bộ backlog; rule vẫn nằm trong database để xử lý khi chạy lại.
4. PATCH thời gian/chu kỳ hoặc bật lại tính lần tiếp theo. Tạm dừng đặt `den_han_luc` null. DELETE xóa mềm và tắt, giữ thông báo đã có. Cây lưu trữ và tài khoản bị khóa bị worker bỏ qua; phục hồi không tự tạo hàng loạt nhắc đã bỏ lỡ.
5. Giao diện polling `/notifications`, chỉ đọc dữ liệu của tài khoản. Đánh dấu đọc một mục giữ thời gian đầu tiên; đọc tất cả chỉ ảnh hưởng tài khoản hiện tại. Thông báo đã đọc không tạo nhật ký chăm sóc.
6. DB lỗi làm giao dịch rollback, worker tăng thời gian chờ rồi thử lại. Không có gửi Web Push, lease delivery, quiet hours hay khóa subscription trong bản này.

Nguồn: [worker](../../backend/src/modules/schedules/worker.ts), [router](../../backend/src/modules/schedules/router.ts), [migration](../../backend/migrations/0011_schedules.sql). [API thực tế](../03-kien-truc/api.md)
