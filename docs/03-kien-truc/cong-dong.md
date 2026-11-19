# Cộng đồng nhiều bài · 0.5

Ngày 19/11/2026. Nguồn thực thi: [migration 0009](../../backend/migrations/0009_community_posts.sql), [router bài viết](../../backend/src/modules/community/posts.ts), [bình luận](../../backend/src/modules/community/comments.ts), [OpenAPI](../../backend/src/modules/community/social-openapi.ts). Đường dẫn dưới đây có tiền tố `/api/v1`. Tất cả yêu cầu có phiên; mọi thao tác ghi có Origin và CSRF.

## Bài viết và ảnh

`GET /community/posts?mine=true|false&cursor=&limit=` trả `{items,nextCursor}`. `mine` mặc định false; true chỉ lấy bài của mình, kể cả bài đang tắt chia sẻ hoặc bị quản trị viên ẩn. `limit` 1–50, mặc định 20; cursor là chuỗi thứ tự bigint. Các trang sắp từ mới tới cũ theo thứ tự tạo, không đổi vị trí chỉ vì sửa ngày hiển thị.

Một bài trả:

```text
id, plantId, title, note, happenedAt, createdAt, updatedAt,
author, isOwner, isPublished, moderationHidden, includeHistory,
plant: {speciesCode, speciesName, archived},
photos: [{id, url}], reactions: {heart, cry, laugh},
myReaction, commentCount
```

`author` là bí danh; phản hồi thành viên không chứa email, điện thoại, ID chủ tài khoản, ghi chú riêng của cây hoặc ảnh hồ sơ. `plantId` chỉ dùng trong phạm vi cây đã chia sẻ, không cấp quyền gọi API riêng của chủ cây.

| Route | Payload và hành vi |
| --- | --- |
| `POST /community/posts` | `plantId,title,note?,happenedAt,includeHistory?`; tạo trả `201` và `Location` |
| `GET /community/posts/{postId}` | Chi tiết khi bài công khai với thành viên hoặc người gọi là chủ |
| `PATCH /community/posts/{postId}` | Chính chủ sửa `title,note,happenedAt,includeHistory,retainedPhotoIds`; giữ nguyên cây đã gắn |
| `DELETE /community/posts/{postId}` | Chính chủ xóa, trả `204`; cảm xúc, bình luận và nhánh trả lời được xóa theo |
| `GET /community/posts/{postId}/photos/{photoId}` | Đọc JPEG theo đúng bài và quyền hiện tại |

Tiêu đề 1–120 ký tự sau trim, ghi chú 0–4000; ngoài tiêu đề phải có ghi chú hoặc ít nhất một ảnh. Ngày dùng ISO 8601, được kiểm tra như ngày nhật ký. Cây bắt buộc thuộc tài khoản, có thể đang theo dõi hoặc đã lưu trữ.

POST/PATCH nhận JSON hoặc multipart. Multipart lặp trường `images`, tối đa bốn ảnh và tổng ảnh mới tối đa 8 MiB; ảnh được chuẩn hóa và bỏ metadata. PATCH gửi `retainedPhotoIds` là mảng JSON trong JSON hoặc chuỗi JSON trong multipart: bỏ trường này giữ ảnh cũ, `[]` bỏ hết ảnh cũ, danh sách xác định thứ tự giữ; ảnh mới nối phía sau. Tổng ảnh sau sửa tối đa bốn. Ảnh bị bỏ chuyển qua quy trình `pending_delete` để worker dọn bền vững.

## Cảm xúc và thảo luận

`PUT /community/posts/{postId}/reaction` nhận `{reaction:'heart'|'cry'|'laugh'|null}`; mỗi thành viên có tối đa một cảm xúc/bài. Trả `{reactions,myReaction}`; null xóa cảm xúc. Giao diện hiển thị số thật từ API.

| Route | Hành vi |
| --- | --- |
| `GET /community/posts/{postId}/comments` | Bỏ `parentId` để lấy bình luận gốc; truyền `parentId` lấy con trực tiếp, mỗi tầng có `cursor,limit` riêng |
| `POST /community/posts/{postId}/comments` | JSON/multipart `{body?,parentId?}` và `images`; chữ tối đa 1000 ký tự, phải có chữ hoặc ảnh |
| `PUT /community/posts/{postId}/comments/{commentId}/like` | `{liked:boolean}`; trả `{liked,likeCount}` |
| `DELETE /community/posts/{postId}/comments/{commentId}` | Tác giả hoặc chủ bài; trả `204`, xóa cả cây trả lời và thu hồi ảnh |
| `GET /community/posts/{postId}/comments/{commentId}/photos/{photoId}` | Ảnh phải thuộc đúng bình luận và bài đang được phép đọc |

Bình luận trả `id,postId,parentId,author,body,createdAt,canDelete,moderationHidden,photos,likeCount,liked,replyCount`. `replyCount` là số con trực tiếp. `parentId` không được trỏ sang bài khác. Giới hạn ảnh bình luận giống bài viết: bốn ảnh, 8 MiB ảnh mới. Thích/cảm xúc, gửi và trả lời chỉ hoạt động khi bài đang hiển thị; chủ bài còn đọc được nội dung đã tắt chia sẻ.

## Quyền lịch sử và tương thích

- `/plants/{plantId}/share` là quyền chia sẻ tổng của cây; giữ GET/PUT cũ và kiểu `{shared,title,caption,includeHistory}`. Tắt quyền tổng ẩn mọi bài, nhật ký, kết quả và ảnh của cây với thành viên khác. Chủ còn xem nội dung của mình.
- Tạo bài mới tự bật quyền tổng; `includeHistory` mặc định false ở API và biểu mẫu. Chỉ khi chủ tích chọn rõ ràng, bài mới cho xem cả ghi chú/ảnh/kết quả hiện có cùng các mục gắn cây sau này. Tùy chọn này không công khai hồ sơ liên hệ hoặc ảnh của cây khác.
- Lịch sử được mở khi đồng thời: cây đang cho chia sẻ, cây đang cho chia sẻ lịch sử, bài đang hiển thị và chính bài đã chọn chia sẻ lịch sử. Bài cũ không tự nhận sự đồng ý mới chỉ vì nâng cấp.
- `GET /community/posts/{postId}/notes` và `/diagnoses` phân trang độc lập. Ảnh trả qua URL dưới chính bài: `/notes/{noteId}/photos/{photoId}` và `/diagnoses/{diagnosisId}/photo`. Từng tài nguyên phải gắn đúng cây của bài.
- Ảnh cộng đồng được kiểm tra quyền trước và sau khi lấy object từ kho; trả `Cache-Control: private, no-store`. URL đã biết không dùng được để bỏ qua việc thu hồi quyền.
- Migration chuyển bài chia sẻ theo cây và bình luận cũ sang mô hình mới; route `/community/plants` vẫn tương thích. `community_comments` cũ còn để chuyển tiếp, luồng đọc/ghi bình luận hiện tại dùng bảng mới để tránh hai bản dữ liệu lệch nhau.
- Lưu trữ cây tự tắt chia sẻ theo hành vi an toàn đã có. Chủ có thể chia sẻ lại cây lưu trữ bằng hành động có chủ ý. Sửa bài không tự bỏ trạng thái bị Admin ẩn.

Garden mở biểu mẫu viết bài kèm ảnh cho đúng cây đang xem và có nút quản lý quyền tổng. Góc xanh tách danh sách, chi tiết bài/thảo luận và tab lịch sử. Giới hạn ảnh, lỗi tải, phân trang và số đếm lấy từ dữ liệu thực.

## Kiểm tra nghiệm thu

Kiểm tra bằng hai tài khoản giả: bài chữ/ảnh, sửa giữ/bỏ ảnh và ngày, xóa bài; cảm xúc đổi/xóa; bình luận chữ/ảnh, trả lời nhiều tầng, thích; cây sai chủ; ảnh khác bài/bình luận; thu hồi quyền tổng/lịch sử khi URL ảnh đã mở; bài Admin ẩn; nâng cấp dữ liệu cũ không tự chia sẻ lịch sử. Ghi kết quả thực tại [biên bản](../06-kiem-thu/bien-ban.md). TypeScript đạt không thay cho kiểm thử HTTP, camera vật lý hoặc giao diện điện thoại.
