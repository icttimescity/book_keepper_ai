# Tư vấn sách - Supabase + Offline fallback

## Chạy local

```bash
npm install
npm start
```

Mở:
- Học sinh: http://localhost:3000
- Admin: http://localhost:3000/admin

Tài khoản admin mặc định trong `.env`: `admin` / `admin`.

## Dữ liệu học sinh

- Nguồn chính: Supabase `public.books`
- Nguồn dự phòng: `public/data/databookT35.json` (8.335 bản ghi đã chuẩn hóa)
- Frontend không tải toàn bộ dữ liệu; nó gọi API theo trang.
- Ban đầu 100 sách ngẫu nhiên; Xem thêm 50/lần.
- Tìm kiếm thủ công theo tên/tác giả.
- Lọc thể loại chạy ngay khi đổi dropdown.
- Chọn ngẫu nhiên trả về 1 cuốn.

## API học sinh

- `GET /api/books?mode=random&seed=abc&offset=0&limit=100`
- `GET /api/books?mode=search&searchMode=title&q=doraemon&type=Truyện%20tranh&offset=0&limit=100`
- `GET /api/books/categories`
- `GET /api/books/random`
- `GET /api/books/health`

Nếu Supabase lỗi/timeout, server tự dùng JSON offline.

## Admin

Nhánh `/admin` đã có:
- Login mặc định `admin/admin`
- Xem/tìm danh sách
- Thêm sách
- Sửa sách
- Xóa sách
- Import `.json` hoặc `.csv`
- Import tự chia batch 500 và upsert theo `No`

**Quan trọng:** các thao tác ghi cần điền `SUPABASE_SECRET_KEY` trong `.env`. Publishable key chỉ dành cho đọc vì RLS đang chặn ghi từ học sinh.

## Environment

`.env` đã chứa Supabase URL, Publishable key và Agnes AI key theo yêu cầu. Khi lấy được Secret key từ Supabase Dashboard > Settings > API Keys, chỉ cần điền:

```env
SUPABASE_SECRET_KEY=sb_secret_xxx
```

Không cần sửa mã nguồn.

## Cập nhật: tài khoản quản lý

- Tài khoản `admin/admin` vẫn là Admin chính và lấy từ `.env`.
- Các tài khoản quản lý bổ sung được lưu trong bảng Supabase `public.manager_users`.
- Admin chính có thể thêm, sửa, khóa hoặc xóa tài khoản quản lý ngay tại `/admin`.
- Tài khoản quản lý có thể đăng nhập `/admin` và thêm/sửa/xóa/import sách, nhưng không được quản lý tài khoản khác.
- Mật khẩu tài khoản quản lý được lưu dạng hash `scrypt`, không lưu plaintext.

### Khởi tạo bảng manager_users (chỉ làm một lần)

1. Mở Supabase Dashboard.
2. Chọn **SQL Editor** -> **New query**.
3. Mở file `supabase/manager_users.sql` trong project (hoặc đăng nhập `/admin` và bấm **Tải file SQL khởi tạo**).
4. Dán toàn bộ SQL và bấm **Run**.
5. Quay lại `/admin`, phần **Tài khoản quản lý** sẽ hoạt động.

Secret key của project chỉ cho phép backend CRUD dữ liệu qua REST; việc tạo bảng (DDL) vẫn cần chạy SQL một lần trong SQL Editor.

## Cập nhật: CSV mẫu import sách

Trong `/admin`, mục **Cập nhật sách bằng file** có nút **Tải CSV mẫu**.
File mẫu giữ đúng 8 header:

`No,Title,Author,Year,Publisher,Types,Shelf,Position`

Trang admin sẽ kiểm tra header, No không hợp lệ và No trùng trong file trước khi gửi batch lên Supabase.

## Tài khoản quản lý nhập trực tiếp trong Supabase

- Nếu tạo user bằng giao diện `/admin`, mật khẩu được lưu dạng `scrypt$...`.
- Nếu nhập user thủ công trực tiếp vào bảng `manager_users`, có thể nhập mật khẩu thường vào cột `password_hash`; lần đăng nhập đầu tiên thành công hệ thống sẽ tự chuyển sang hash scrypt.
- Username được kiểm tra không phân biệt chữ hoa/chữ thường.
- Form `/admin` không còn điền sẵn `admin/admin`.


## Hai chế độ import sách

- **Thêm mới**: hệ thống bỏ qua `No` trong file, lấy `No` lớn nhất đang có và tự gán số mới liên tiếp. Không sửa hoặc ghi đè bất kỳ sách cũ nào.
- **Sửa / cập nhật**: hệ thống dùng `No` trong file làm khóa. `No` đã tồn tại sẽ được cập nhật; `No` chưa tồn tại sẽ được thêm mới.
- File chỉ được đọc và kiểm tra khi vừa chọn. Dữ liệu chỉ được ghi sau khi người quản lý bấm một trong hai nút và xác nhận cảnh báo.

## Quy tắc an toàn import

Ví dụ database hiện có No 1 -> 8385:
- Thêm mới file có No 1 -> 100: hệ thống bỏ qua các No đó và tạo No 8386 -> 8485.
- Sửa file có No 1 và 9000: No 1 được cập nhật; No 9000 được thêm mới.

Nếu chế độ Thêm mới bị lỗi giữa các batch, giao diện giữ lại phần chưa xử lý để tiếp tục, tránh thêm lại các batch đã hoàn tất.

## Phân trang danh sách sách trong Admin

- Danh sách `/admin` hiển thị tối đa 100 cuốn mỗi trang.
- Tổng số trang được tính tự động từ tổng số kết quả hiện tại.
- Có thể bấm trực tiếp số trang, dùng nút trang trước/trang sau hoặc nhập số vào ô `Đi đến trang`.
- Ví dụ với 8.335 cuốn: 84 trang; trang 4 hiển thị bản ghi thứ 301-400; trang cuối hiển thị phần còn lại.
- Khi tìm kiếm, phân trang được tính lại theo tổng số kết quả tìm kiếm.
