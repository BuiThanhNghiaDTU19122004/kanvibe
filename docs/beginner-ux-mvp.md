# KanVibe — MVP UX cho người mới, Windows

Ngày bàn giao: 06/10/2026. Phạm vi đã duyệt: developer biết Git nhưng mới dùng multi-agent; Windows native, terminal nhúng, ưu tiên Claude Code; giao diện English và tiếng Việt. Giữ Electron, React, TypeScript, Vite, Tailwind và SQLite hiện tại.

## Vấn đề đã xử lý

- Màn hình đầu tiên khó chỉ ra việc người dùng cần làm. Dashboard trở thành mặc định, đặt task cần nhập thông tin, cần duyệt hoặc có lỗi khởi chạy lên trước; Kanban vẫn là một tab.
- Tạo task yêu cầu quá nhiều thông tin kỹ thuật. Luồng chính chỉ cần project, yêu cầu và agent; tiêu đề/branch được gợi ý, cho sửa lại. Branch, base branch, priority, session và tùy chọn tự chạy nằm trong phần nâng cao.
- Tự chạy agent đọc sai query của HashRouter, có thể gửi lệnh khi terminal chưa sẵn sàng. Nay chờ terminal xác nhận kết nối, tiêu thụ `autostart` một lần, kiểm tra CLI/tiến trình trước khi gửi và chặn khởi chạy trùng.
- Theo dõi tiến trình còn phụ thuộc tmux. Windows theo dõi các tiến trình con của PTY; có cách đọc bằng Toolhelp nếu WMI bị chặn. Đang khởi chạy, đã thấy tiến trình, không xác nhận được và lỗi được phân biệt.
- Prompt qua shim npm/PowerShell có thể mất dấu nháy hoặc xuống dòng. Luồng mới truyền UTF-8, chạy executable trực tiếp với argv được quote, hỗ trợ shim npm chuẩn của các CLI đã cấu hình. Helper được chuẩn bị khi mở shell để không in mã khởi chạy dài vào terminal.
- Lỗi đọc dữ liệu có thể bị biến thành trang trống. Board, Settings, Task Detail và Accounts có thông báo lỗi/thử lại; dữ liệu đã đọc được giữ lại với trạng thái lỗi. Màn hình kết quả đọc diff ở chế độ báo lỗi thay vì biến lỗi thành “không có thay đổi”.
- Bỏ qua onboarding từng có thể được hiểu là đã sẵn sàng. Wizard chỉ ghi đã xem; checklist còn hiển thị cho đến khi công cụ, tài khoản Claude mặc định, project và một lần chạy được xác nhận.

## Thiết kế theo màn hình

| Màn hình | Hành vi mới |
| --- | --- |
| Dashboard | CTA tạo công việc; khu vực cần người dùng xử lý; CLI đang quan sát được; danh sách task cập nhật gần nhất; bộ lọc hiện có. Lỗi monitor hiển thị trạng thái không xác định, không báo giả là 0 agent. |
| Kanban | Giữ thao tác và bộ lọc hiện có. Ghi nhớ tab đã chọn trong phiên ứng dụng. |
| Tạo task | Chọn project → mô tả → kiểm tra tiêu đề → chọn agent → tạo và bắt đầu. Mặc định Claude Code và tự chạy; Enter trong mô tả là xuống dòng. Có thể bỏ tự chạy hoặc chọn chỉ dùng terminal. |
| Task / Hoạt động | Yêu cầu ban đầu; hội thoại theo thứ tự thời gian; cây agent và dòng thời gian mở rộng; nút sang terminal khi cần đăng nhập, xác nhận trust hoặc trả lời. |
| Task / Kết quả | Phản hồi assistant mới nhất, file thay đổi, liên kết diff/PR, trạng thái kiểm thử chưa xác minh, tiếp tục qua terminal và đánh dấu hoàn tất thủ công. Hoàn tất giữ branch/worktree/terminal. |
| Task / Terminal | Terminal giữ kết nối và scrollback khi chuyển tab nội dung. Khởi chạy được main process kiểm tra, không tự lặp lại lệnh khi gặp lỗi. |
| Onboarding | Chuẩn bị Git/Git Bash/Claude và đăng nhập → chọn/quét project → tạo task đầu tiên. Có bỏ qua từng bước, quay lại, kiểm tra lại và checklist trên dashboard. |
| Settings / Accounts | Chọn English/tiếng Việt; ghi nhớ ngôn ngữ và giữ task/query khi đổi. Thao tác tài khoản có phản hồi lỗi, tải lại và trạng thái chờ khi thêm. |

## Ưu tiên và bước triển khai

P0 đã làm: dashboard mặc định, form đơn giản, khởi chạy native có kiểm tra, trạng thái/lỗi trung thực, onboarding có checklist, EN/VI.

P1 đã làm trong phạm vi frontend hiện có: trang Hoạt động/Kết quả, tích hợp cây agent/dòng thời gian, diff và hoàn tất thủ công. Các reader/hook/lifecycle hiện có vẫn là nguồn dữ liệu; không tạo hệ thống orchestration mới.

Các bước nhỏ đã thực hiện:

1. Nối monitor và launch API giữa Electron main, preload và renderer.
2. Sửa form tạo task và luồng tự chạy sau khi terminal sẵn sàng.
3. Ghép dashboard, trạng thái đọc dữ liệu và hành động xử lý.
4. Ghép workspace Hoạt động/Kết quả trên dữ liệu phiên hiện có.
5. Làm wizard/checklist và ngôn ngữ EN/VI.
6. Kiểm tra hành vi bằng unit/component test, build và Electron trên Windows với dữ liệu riêng.

## Kiểm chứng và giới hạn

- TypeScript `tsc --noEmit` đạt; build renderer và main đạt. Vite vẫn cảnh báo một số bundle lớn.
- 201 bài kiểm tra trong 16 file liên quan đến MVP đạt. Lint phần thay đổi không có lỗi; có một cảnh báo biến `error` không dùng ở nhánh đọc file cũ của `diffService`.
- Smoke Electron dùng một Git repo, thư mục dữ liệu ứng dụng, home và CLI giả lập riêng: tạo task tiếng Việt; giữ prompt Unicode nhiều dòng có dấu nháy/ký tự shell; tự chạy một lần; chặn chạy trùng; xác nhận tiến trình; đọc log; thấy diff; nhận input terminal; hoàn tất thủ công giữ worktree; khôi phục ngôn ngữ; light/dark và cửa sổ nhỏ hơn. Không phát sinh page error.
- Chưa gọi model thật hoặc tiêu quota Claude. Cần người dùng thử một task thực để xác nhận đăng nhập/trust và trải nghiệm CLI trên tài khoản của mình.
- Đã thử mở rộng kiểm tra: còn 9 lỗi trong suite projectService với fixture đường dẫn Linux và 14 lỗi terminal/lifecycle cần `sh` hoặc giả định môi trường Unix. Các suite này chưa đạt trên Windows; không coi kết quả MVP là toàn bộ repository đã xanh.
- Process “running” chỉ có nghĩa CLI đang mở, có thể đang chờ input. Hook/log mới mô tả trạng thái công việc; CLI đóng không đồng nghĩa công việc thành công.
- Cây agent/hội thoại hiển thị những gì reader hiện có ghi nhận. Không hứa có mọi trao đổi giữa agent. Antigravity giữ cảnh báo về giới hạn theo dõi.
- Với shim CLI tùy biến không khớp đường dẫn package hỗ trợ, dùng terminal hoặc native CLI; ứng dụng không đoán hoặc gửi prompt qua một wrapper không kiểm soát.

Script chạy lại smoke: `node qa/electron/beginner-mvp-smoke.cjs` sau khi build. Ảnh kiểm tra nằm trong `.tooling/beginner-mvp-smoke/<timestamp>/`.

## Các quyết định kiến trúc vẫn hoãn

Xem [architecture-followups.md](architecture-followups.md). Team role/workflow, cơ chế trao đổi agent mới, retry/checkpoint và báo cáo nâng cao chưa được triển khai. Tài liệu kiến trúc này giữ riêng để người dùng xem và chốt sau; không commit hoặc đưa vào PR.

Bản triển khai hiện ở workspace, chưa tạo commit, push hoặc PR. Khởi động lại KanVibe để tải bản build mới.
