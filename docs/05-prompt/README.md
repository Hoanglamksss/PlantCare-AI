# Prompt làm việc với AI agent

Dùng một prompt theo công việc. Mỗi phiên chỉ cần đọc trạng thái và tài liệu của phần đang làm. Ghi quyết định bền vững vào tài liệu dự án để các phiên sau có thể tiếp tục.

## Bắt đầu một tác vụ

```text
Bạn đang làm việc trong PlantCare AI. Đọc AGENTS.md và docs/02-phat-trien/trang-thai.md.
Tác vụ: <mô tả cụ thể>.
Tiêu chí hoàn thành: <hành vi cần có và cách xác minh>.
Mở đúng tài liệu và mã liên quan. Kiểm tra các quyết định đã duyệt trước khi sửa API, dữ liệu hoặc quyền.
Dùng dữ liệu giả trong ví dụ, fixture và log. Kiểm tra hành vi ở luồng chạy thật của phần thay đổi.
Cập nhật trạng thái bàn giao ngắn gọn và liên kết tới bằng chứng kiểm tra.
```

## Chọn tài liệu theo tác vụ

| Tác vụ | Điểm bắt đầu |
| --- | --- |
| Tính năng hoặc giao diện | [Phạm vi và tác nhân](../01-gioi-thieu/README.md), [API](../03-kien-truc/api.md) |
| API và migration | [API](../03-kien-truc/api.md), [ERD](../04-du-lieu/README.md) |
| AI và pipeline ảnh | [Phạm vi nhãn](../01-gioi-thieu/README.md), [kiến trúc](../03-kien-truc/README.md), [kiểm thử](../06-kiem-thu/README.md) |
| Vận hành và test | [Triển khai](../03-kien-truc/trien-khai.md), [kiểm thử](../06-kiem-thu/README.md) |

## Bàn giao

```text
Cập nhật docs/02-phat-trien/trang-thai.md với mốc hiện tại, phần đã làm, bằng chứng kiểm tra,
phần còn mở và bước tiếp theo. Ghi quyết định mới vào quyet-dinh.md nếu có.
```
