# KanVibe hiện chạy trực tiếp trên Windows

Mở `Mo-KanVibe - Shortcut.lnk` trong `D:\kanvibe`. Hướng dẫn hiện hành nằm ở [WINDOWS.md](WINDOWS.md): scan ổ C/D, terminal PowerShell và quản lý quota Antigravity qua `agy` bản Windows.

Database WSL cũ đã được sao lưu vào `.tooling/wsl-kanvibe-backup.db`; bản gốc giữ nguyên. Không chạy lại launcher WSL trên cùng `node_modules` đã cài cho Windows.

---

# Hướng dẫn thiết lập WSL trước đây (lưu để tham khảo)

Cập nhật: 29/09/2026. Workspace: `D:\kanvibe` trên Windows, `/mnt/d/kanvibe` trong Ubuntu.

## 1. Trạng thái hiện tại và việc cần làm ngay

Node 24, pnpm 10.34.5, Git, tmux và các thư viện Electron đã được cài theo log thiết lập. Electron đã chạy và hook server đã mở cổng 9736. Tuy nhiên log còn lỗi `no such table: task_diff_stats`, nên chưa thể coi toàn bộ thiết lập đã hoàn tất.

Nguyên nhân trong mã nguồn: bước bootstrap SQLite thiếu bảng `task_diff_stats`, trong khi bước baseline ghi nhận migration tạo bảng là đã chạy. Đã bổ sung bảng vào `src/lib/sqliteSchema.ts`. Bản sửa sẽ tạo bảng còn thiếu khi mở database hiện có, không cần xóa database.

Đóng KanVibe, chờ terminal trở lại dấu nhắc (dùng Ctrl+C nếu tiến trình vẫn chạy), rồi chạy trong **Ubuntu**:

```bash
cd /mnt/d/kanvibe
source ~/.nvm/nvm.sh
nvm use 24
pnpm check && pnpm build && pnpm start
```

Phải build lại vì `pnpm start` sử dụng bản đã biên dịch nếu nó tồn tại. Chỉ tạo lại seed bằng `db:prepare` không sửa database đang dùng.

Đã kiểm tra SQL của bản sửa: khớp migration, khôi phục bảng thiếu, giữ task và dữ liệu cache khi chạy lặp lại, xóa cache theo task qua khóa ngoại. Chưa chạy được test tích hợp trong WSL từ phiên trợ lý do `E_ACCESSDENIED`. Bạn có thể chạy kiểm tra bổ sung khi đã đóng ứng dụng:

```bash
pnpm test src/lib/__tests__/sqliteSchema.test.ts src/lib/__tests__/databaseMigrations.test.ts
```

Sau test, `pnpm start` có thể tự rebuild SQLite từ runtime Node sang Electron; dòng `Rebuild Complete` là bình thường.

## 2. Mỗi lần dùng cần chạy gì?

**Cách mở nhanh từ Windows:** bấm đúp `D:\kanvibe\Mo-KanVibe.cmd`. File tự khởi động Ubuntu, nạp nvm, chọn Node 24 và chạy `pnpm start`. Giữ cửa sổ terminal mở trong khi dùng; nếu có lỗi, cửa sổ sẽ dừng để bạn đọc log.

Bạn có thể nhấp phải file → **Send to → Desktop (create shortcut)** (Windows 11 có thể cần **Show more options**) để tạo biểu tượng ngoài Desktop. File hiện dùng đường dẫn `/mnt/d/kanvibe` và bản phân phối `Ubuntu` đúng với máy này.

Trước lần mở nhanh đầu tiên, hoàn tất bước build áp dụng bản sửa database ở mục 1 nếu chưa làm. File mở nhanh không tự build lại bản đã có.

Nếu muốn chạy thủ công:

Trong **PowerShell**:

```powershell
wsl -d Ubuntu
```

Trong **Ubuntu**:

```bash
cd /mnt/d/kanvibe
source ~/.nvm/nvm.sh
nvm use 24
pnpm start
```

KanVibe mở dưới dạng cửa sổ Electron. Giữ terminal khởi chạy mở trong khi sử dụng. Không cần mở Docker, chạy server database riêng hay khởi động tmux thủ công; KanVibe quản lý các phiên terminal của task.

Không cần chạy `pnpm install`, `pnpm db:prepare` hay `pnpm build` mỗi lần mở. Cài lại thư viện khi dependency thay đổi; build lại khi mã nguồn thay đổi. Dùng `pnpm dev` chỉ khi phát triển giao diện/mã nguồn KanVibe.

`http://localhost:9736` là hook server của chế độ `start`, không phải địa chỉ giao diện web. Chế độ `dev` dùng hook server cổng 19736. Không chạy đồng thời hai phiên cùng chế độ.

## 3. Cài và đăng nhập agent — làm một lần

KanVibe quản lý task và terminal. Bạn cần cài CLI của agent muốn dùng trong **Ubuntu**, rồi đăng nhập tài khoản tương ứng. Chỉ cần chọn một agent để bắt đầu; không bắt buộc cài cả ba. Đăng nhập trên Windows không đồng nghĩa đã đăng nhập trong Ubuntu.

Trước khi cài, chạy `source ~/.nvm/nvm.sh && nvm use 24`. Dùng `command -v node npm pnpm` để xác nhận các công cụ ở đường dẫn Linux, không phải `/mnt/c/...`.

### Codex

Cài theo [tài liệu Codex CLI chính thức](https://learn.chatgpt.com/docs/codex/cli):

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Làm theo hướng dẫn PATH của trình cài, mở lại Ubuntu nếu cần, rồi:

```bash
codex --version
codex login
codex login status
```

Hoàn tất đăng nhập qua trình duyệt theo [hướng dẫn xác thực](https://learn.chatgpt.com/docs/auth). Nếu callback trình duyệt không hoạt động trong WSL, có thể thử `codex login --device-auth` khi tài khoản/workspace cho phép đăng nhập bằng mã thiết bị.

Trong terminal của task, chạy `codex` rồi nhập yêu cầu. Nếu Codex hỏi độ tin cậy của thư mục, kiểm tra đúng repo/worktree của mình trước khi xác nhận. README KanVibe lưu ý hook cục bộ cần đường dẫn project/worktree được Codex tin cậy.

### Claude Code

Cài theo [tài liệu Claude Code](https://code.claude.com/docs/en/setup):

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Làm theo hướng dẫn PATH của trình cài, mở lại Ubuntu nếu cần, rồi:

```bash
claude --version
claude
```

Hoàn tất luồng đăng nhập mà CLI hiển thị. Sau đó có thể chạy `claude` ngay trong terminal của task.

### Gemini CLI

Cài theo [tài liệu Gemini CLI](https://geminicli.com/docs/get-started/installation/):

```bash
npm install -g @google/gemini-cli
gemini --version
gemini
```

Chọn cách xác thực theo hướng dẫn CLI. Chạy `gemini` trong terminal của task để bắt đầu.

### Tài khoản trong KanVibe

Mở **Settings → AI accounts** để xem tài khoản được phát hiện, thêm tài khoản hoặc đăng nhập lại. KanVibe dùng lệnh đăng nhập của từng CLI; vẫn phải cài CLI trước. Nếu vừa cài agent mà ứng dụng chưa nhận, đóng và mở lại KanVibe từ Ubuntu đã có PATH đúng.

Quyền sử dụng model phụ thuộc tài khoản và phương thức xác thực của nhà cung cấp. Không cần điền API key vào `.env` của KanVibe chỉ để quản lý task hoặc dùng CLI đã đăng nhập.

## 4. Đưa dự án vào KanVibe

1. Chuẩn bị một repository Git có commit và nhánh cơ sở, ví dụ `main`.
2. Trên bảng Kanban, bấm biểu tượng **kính lúp quét thư mục** cạnh bộ lọc project và **+ New Task**.
3. Chọn đường dẫn repo theo Linux, ví dụ `/mnt/d/my-project` tương ứng `D:\my-project`.
4. Bấm **Scan & Register**. KanVibe đăng ký project, phát hiện worktree và cài hook agent được hỗ trợ.
5. Chọn project vừa đăng ký trên board.

Repo công việc là dự án bạn muốn agent sửa; không nhất thiết là thư mục cài KanVibe. Cài dependency của repo công việc theo README riêng của repo đó, trong Ubuntu.

Nếu Git chưa có danh tính commit, kiểm tra `git config --global user.name` và `git config --global user.email`, rồi cấu hình tên/email thực của bạn nếu đang trống.

Nếu dùng tính năng GitHub/PR, cài và đăng nhập GitHub CLI trong Ubuntu:

```bash
sudo apt install -y gh
gh auth login
gh auth status
```

## 5. Tạo task và làm việc với agent

1. Bấm **+ New Task**, chọn project và mô tả công việc.
2. Khi cần môi trường riêng, đặt nhánh mới, ví dụ `feat/login-form`, và chọn nhánh cơ sở phù hợp.
3. KanVibe tạo worktree và phiên tmux/zellij cho task có nhánh theo luồng tạo task.
4. Mở task. Trong terminal, chạy `pwd` và `git branch --show-current` để kiểm tra đúng worktree/nhánh.
5. Chạy agent đã cài: `codex`, `claude` hoặc `gemini`.
6. Nhập yêu cầu cụ thể, chẳng hạn: “Đọc cấu trúc repo, thêm kiểm tra email cho form đăng nhập, chạy test liên quan và tóm tắt các file đã sửa.”
7. Xem diff, chạy test của dự án và kiểm tra kết quả trước khi commit/merge.

Muốn chạy nhiều công việc song song, tạo các task/worktree riêng rồi chạy agent ở từng terminal. KanVibe không tự chia yêu cầu thành nhiều agent chỉ vì bạn cài nhiều CLI.

## 6. Hook và trạng thái task

Hook thông báo hoạt động của agent về KanVibe. Theo README, hook được cài khi scan/register project hoặc tạo worktree; có thể cài riêng trong trang chi tiết task.

| Trạng thái | Ý nghĩa |
|---|---|
| TODO | Công việc chưa bắt đầu |
| PROGRESS | Đang xử lý |
| PENDING | Chờ tương tác/phê duyệt; tùy agent |
| REVIEW | Chờ bạn xem kết quả |
| DONE | Hoàn tất và đi vào luồng dọn dẹp |

Theo cấu hình của repo, Claude dùng `.claude/settings.json`, Gemini dùng `.gemini/settings.json`, Codex dùng `.codex/hooks.json` và `.codex/config.toml`. Hãy để KanVibe sinh hook, tránh tự ghi đè các cấu hình đang có.

Nếu trạng thái không tự đổi: kiểm tra KanVibe còn chạy, agent đang ở đúng worktree, phần hook trong chi tiết task đã được cài, và Codex đã tin cậy worktree nếu dùng Codex. Phiên agent đang mở có thể cần khởi động lại để đọc hook mới. Bạn vẫn có thể đổi trạng thái thủ công.

**Lưu ý trước khi chuyển DONE:** README cho biết thao tác này tự dọn nhánh, worktree và phiên terminal. Hãy kiểm tra, commit và merge/lưu công việc cần giữ trước khi chuyển DONE. Đừng dùng DONE chỉ để tạm dừng agent.

## 7. Dữ liệu và xử lý lỗi

### Chữ thành ô vuông trong giao diện

Bản gốc mặc định tiếng Hàn; Ubuntu tối giản có thể thiếu font hiển thị Hàn/Trung. Bản cài này đã đổi ngôn ngữ mặc định sang tiếng Anh và thêm Noto vào chuỗi font dự phòng. Có thể chọn lại ngôn ngữ trong Settings; chưa có bản dịch tiếng Việt.

Đóng KanVibe và dừng terminal cũ bằng Ctrl+C, rồi bấm đúp `D:\kanvibe\Sua-Giao-Dien-KanVibe.cmd` **một lần**. File cài font Noto trong Ubuntu, làm mới font cache, kiểm tra TypeScript, build lại và mở ứng dụng. Khi sudo yêu cầu, nhập mật khẩu Ubuntu. Các bước dừng ngay nếu có lỗi.

Gói [fonts-noto-cjk của Ubuntu](https://packages.ubuntu.com/search?keywords=fonts-noto-cjk) cung cấp font cho các chữ Hàn/Trung/Nhật. Việc thêm tên font trong CSS không tự cài font; cần chạy bước cài bên trên. Những lần sau dùng `Mo-KanVibe.cmd` như bình thường.

Có thể chạy thủ công trong Ubuntu thay cho file sửa:

```bash
sudo apt-get update &&
sudo apt-get install -y fontconfig fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji &&
fc-cache -f &&
cd /mnt/d/kanvibe &&
pnpm check && pnpm build && pnpm start
```

### Cửa sổ không phóng to hoặc mất phản hồi

Bản cài này dùng thanh tiêu đề hệ thống khi phát hiện WSL, thay cho Window Controls Overlay. Thay đổi nằm trong `electron/main.js`: đóng hẳn ứng dụng và mở lại bằng `Mo-KanVibe.cmd` để áp dụng, không cần build lại riêng cho thay đổi này.

Chưa xác nhận nguyên nhân treo trên máy thực tế. Nếu vẫn xảy ra, mở một cửa sổ Ubuntu khác và lấy log:

```bash
tail -n 100 ~/.config/kanvibe/logs/kanvibe-desktop.log
```

Log mới ghi các sự kiện `window:maximize`, `window:unmaximize`, `window:unresponsive`, `window:responsive` cùng kích thước cửa sổ. Gửi đoạn log ngay sau lúc lỗi xảy ra và cho biết đang ở board hay terminal của task.

### Vị trí dữ liệu

Với cấu hình mặc định của phiên desktop hiện tại:

- Database: `/home/lenovo/.config/kanvibe/kanvibe.db`.
- Log: `/home/lenovo/.config/kanvibe/logs/kanvibe-desktop.log`.
- Source app: `/mnt/d/kanvibe`.
- Các biến `KANVIBE_APP_DATA_DIR`/`KANVIBE_DB_PATH` có thể thay đổi vị trí dữ liệu.

Muốn sao lưu dữ liệu mặc định, đóng ứng dụng hoàn toàn rồi chạy trong Ubuntu:

```bash
cp -a ~/.config/kanvibe "$HOME/kanvibe-backup-$(date +%Y%m%d-%H%M%S)"
```

Không xóa database để chữa lỗi thiếu bảng. Áp dụng bản sửa và build lại như mục 1.

| Hiện tượng | Cách xử lý |
|---|---|
| `node: command not found` hoặc pnpm trỏ `/mnt/c` | `source ~/.nvm/nvm.sh && nvm use 24` |
| Thiếu `libnspr4.so` | `sudo apt install -y libnspr4 libnss3` |
| Thiếu `libasound.so.2` trên Ubuntu hiện tại | `sudo apt install -y libasound2t64` |
| Electron ABI mismatch, sau đó `Rebuild Complete` | Đã tự rebuild; kiểm tra các dòng tiếp theo |
| `no such table: task_diff_stats` | Đóng app, chạy lại `pnpm build`, rồi `pnpm start` với bản sửa hiện tại |
| Tải tarball chậm | Chờ `Done in ...`; cảnh báo tốc độ riêng lẻ không phải lỗi cài đặt |
| Agent `command not found` | Cài CLI trong Ubuntu, kiểm tra PATH, mở lại KanVibe |
| Không mở cửa sổ | Kiểm tra `echo "$DISPLAY"` và đọc log; chưa đủ dữ liệu để kết luận chỉ từ biến DISPLAY |

Kiểm tra thư viện còn thiếu:

```bash
ldd node_modules/electron/dist/electron | grep 'not found'
```

Xem log gần nhất:

```bash
tail -n 80 ~/.config/kanvibe/logs/kanvibe-desktop.log
```

## 8. Khi nào coi là thiết lập xong?

- Cửa sổ KanVibe mở được, không lặp lỗi database.
- Đăng ký được repo và tạo task có terminal.
- Agent đã đăng nhập và chạy được trong terminal của task.
- Xem được diff, hook cập nhật trạng thái khi agent hoạt động.

Hướng dẫn workflow và hook dựa trên [README của checkout này](README.md). Lệnh cài và đăng nhập agent đã đối chiếu tài liệu chính thức được liên kết ở từng mục.
