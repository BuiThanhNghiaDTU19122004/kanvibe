# KanVibe trên Windows

Mở `Mo-KanVibe - Shortcut.lnk` hoặc chạy trong PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-KanVibe.ps1
```

Ứng dụng chạy bằng Electron Windows, dùng Git for Windows và PowerShell. Launcher dùng pnpm 10.34.5 riêng trong `.tooling`, không đổi pnpm toàn máy. Cần Node 24 và Git for Windows.

- **Scan project:** chọn ổ C/D trong ô chọn thư mục, hoặc nhập `D:\projects\` rồi chọn thư mục cần scan. Scan sâu tối đa bốn cấp tới `.git`, bỏ qua `node_modules` và liên kết thư mục.
- **Antigravity:** cài `agy` trên Windows. KanVibe nhận phiên đăng nhập từ CLI và đọc `/usage` dạng JSON để hiển thị quota 5 giờ/hàng tuần theo nhóm model. Không sao chép token từ CLI khác. Tên nhóm “Gemini Models” là tên model do Antigravity trả về.
- **Đăng nhập:** tài khoản đã kết nối chỉ cần làm mới. Nếu chưa đăng nhập, CLI chạy bên trong KanVibe để người dùng tự xử lý lựa chọn điều khoản/đăng nhập. Phiên CLI tự đóng khi xác nhận kết nối thành công; đóng cửa sổ cũng dọn tiến trình. Antigravity hiện dùng một tài khoản keyring; nhập lịch sử hội thoại chưa được hỗ trợ.
- **SQLite:** bản 13.0.3 dùng N-API, đã kiểm tra trên Node 24 và Electron 43 Windows. Không cần rebuild SQLite mỗi lần đổi runtime.

Build sau khi sửa code:

```powershell
node .tooling/pnpm/node_modules/pnpm/bin/pnpm.cjs build
```

Log khởi động: `logs/windows-launcher.log`. Database Windows: `%APPDATA%\kanvibe\kanvibe.db`. Bản WSL dùng database riêng; lần chuyển này đã sao lưu nhất quán vào `.tooling/wsl-kanvibe-backup.db`, giữ nguyên database gốc. Project nằm trong Ubuntu cần được đăng ký lại bằng đường dẫn Windows khi có bản tương ứng trên C/D.

Kiểm tra tích hợp Windows bằng `node qa/electron/windows-native-smoke.cjs`; test dùng database và repo thử riêng trong `.tooling/windows-smoke`.
