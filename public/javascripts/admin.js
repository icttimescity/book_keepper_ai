let rows = [];
let currentPage = 1;
let total = 0;
let totalPages = 1;
let managerRows = [];
let pendingImportItems = null;
let pendingImportFileName = '';
let manualBookMode = 'add';
const pageSize = 100;
const EXPECTED_BOOK_HEADERS = ['No', 'Title', 'Author', 'Year', 'Publisher', 'Types', 'Shelf', 'Position'];

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

document.addEventListener('DOMContentLoaded', () => {
  $('adminSearchBtn').onclick = () => loadBooks(1);
  $('adminSearch').addEventListener('keydown', e => { if (e.key === 'Enter') loadBooks(1); });
  $('adminGotoBtn').onclick = goToTypedPage;
  $('adminGotoPage').addEventListener('keydown', e => { if (e.key === 'Enter') goToTypedPage(); });
  $('addBookBtn').onclick = () => openForm();
  $('manualAddMode').onclick = () => setManualBookMode('add');
  $('manualUpdateMode').onclick = () => setManualBookMode('update');
  $('closeDialog').onclick = closeForm;
  $('cancelDialog').onclick = closeForm;
  $('bookForm').onsubmit = saveBook;
  $('importFile').onchange = prepareImportFile;
  $('importAddBtn').onclick = () => runImport('add');
  $('importUpdateBtn').onclick = () => runImport('update');

  if (window.CAN_MANAGE_USERS) {
    $('addManagerBtn').onclick = () => openManagerForm();
    $('closeManagerDialog').onclick = closeManagerForm;
    $('cancelManagerDialog').onclick = closeManagerForm;
    $('managerForm').onsubmit = saveManager;
    loadManagers();
  }

  loadBooks(1);
});

async function loadBooks(page = 1) {
  const requestedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const requestedOffset = (requestedPage - 1) * pageSize;
  const params = new URLSearchParams({
    mode: 'search',
    offset: String(requestedOffset),
    limit: String(pageSize),
    searchMode: $('adminSearchMode').value
  });
  const q = $('adminSearch').value.trim();
  if (q) params.set('q', q);

  const res = await fetch('/api/books?' + params.toString(), { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data.success) return alert(data.error || 'Không tải được dữ liệu');

  total = Number(data.total || 0);
  totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Nếu vừa xóa bản ghi cuối cùng của trang cuối, tự lùi về trang hợp lệ gần nhất.
  if (requestedPage > totalPages && total > 0) {
    return loadBooks(totalPages);
  }

  currentPage = total === 0 ? 1 : requestedPage;
  rows = data.data || [];
  renderTable();
}

function getPaginationItems(current, pages) {
  if (pages <= 9) return Array.from({ length: pages }, (_, i) => i + 1);

  // Ở đầu danh sách luôn hiện 1–6 để có thể nhảy trực tiếp 1 → 4, 5, 6.
  if (current <= 5) return [1, 2, 3, 4, 5, 6, 'ellipsis', pages];

  // Ở cuối danh sách ưu tiên các trang cuối.
  if (current >= pages - 4) {
    return [1, 'ellipsis', pages - 5, pages - 4, pages - 3, pages - 2, pages - 1, pages];
  }

  return [1, 'ellipsis', current - 2, current - 1, current, current + 1, current + 2, 'ellipsis', pages];
}

function pageButton(label, page, options = {}) {
  const { active = false, disabled = false, title = '' } = options;
  const classes = active
    ? 'bg-blue-600 text-white border-blue-600'
    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100';
  return `<button type="button" ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}
    class="min-w-9 h-9 px-2 rounded-lg border text-sm font-semibold ${classes} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}"
    onclick="changeAdminPage(${Number(page)})">${esc(label)}</button>`;
}

function renderPagination() {
  const container = $('adminPagination');
  if (!container) return;

  if (total === 0) {
    container.innerHTML = '';
    $('adminGotoPage').value = '';
    $('adminGotoPage').max = '1';
    return;
  }

  const items = getPaginationItems(currentPage, totalPages);
  const html = [
    pageButton('‹', currentPage - 1, { disabled: currentPage <= 1, title: 'Trang trước' })
  ];

  for (const item of items) {
    if (item === 'ellipsis') {
      html.push('<span class="px-1 text-slate-400 select-none">…</span>');
    } else {
      html.push(pageButton(String(item), item, { active: item === currentPage, title: `Trang ${item}` }));
    }
  }

  html.push(pageButton('›', currentPage + 1, { disabled: currentPage >= totalPages, title: 'Trang sau' }));
  container.innerHTML = html.join('');
  $('adminGotoPage').max = String(totalPages);
  $('adminGotoPage').value = String(currentPage);
}

window.changeAdminPage = (page) => {
  const target = Math.max(1, Math.min(totalPages, Math.trunc(Number(page) || 1)));
  if (target === currentPage) return;
  loadBooks(target);
};

function goToTypedPage() {
  const raw = Number($('adminGotoPage').value);
  if (!Number.isFinite(raw)) return;
  const target = Math.trunc(raw);
  if (target < 1 || target > totalPages) {
    alert(`Vui lòng nhập số trang từ 1 đến ${totalPages}.`);
    $('adminGotoPage').value = String(currentPage);
    return;
  }
  loadBooks(target);
}

function renderTable() {
  const startNo = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endNo = total === 0 ? 0 : Math.min((currentPage - 1) * pageSize + rows.length, total);
  $('adminCount').textContent = `${total.toLocaleString('vi-VN')} cuốn sách`;
  $('adminPageInfo').textContent = total === 0
    ? 'Không có sách phù hợp.'
    : `Hiển thị ${startNo.toLocaleString('vi-VN')}–${endNo.toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')} · Trang ${currentPage}/${totalPages}`;

  $('adminTable').innerHTML = rows.length ? rows.map(book => `
    <tr class="border-t">
      <td class="p-3">${esc(book.No)}</td><td class="p-3 min-w-64">${esc(book.Title)}</td><td class="p-3">${esc(book.Author)}</td>
      <td class="p-3">${esc(book.Types)}</td><td class="p-3">${esc(book.Shelf)}</td><td class="p-3">${esc(book.Position)}</td>
      <td class="p-3 whitespace-nowrap"><button class="text-blue-600 font-semibold mr-3" onclick='editBook(${JSON.stringify(book).replace(/'/g,"&#39;")})'>Sửa</button><button class="text-red-600 font-semibold" onclick="deleteBook(${Number(book.No)})">Xóa</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="p-8 text-center text-slate-500">Không có sách phù hợp.</td></tr>';

  renderPagination();
}

function setManualBookMode(mode) {
  manualBookMode = mode === 'update' ? 'update' : 'add';
  const addBtn = $('manualAddMode');
  const updateBtn = $('manualUpdateMode');
  const hint = $('manualModeHint');
  const noInput = $('fNo');

  if (manualBookMode === 'add') {
    addBtn.className = 'text-left border-2 border-emerald-300 bg-emerald-50 rounded-xl p-3 transition';
    updateBtn.className = 'text-left border-2 border-slate-200 bg-white hover:border-amber-300 rounded-xl p-3 transition';
    hint.className = 'text-xs rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 mb-3';
    hint.textContent = 'Chế độ Thêm mới: No trong form chỉ để tham khảo; hệ thống sẽ tự cấp No tiếp theo để không ghi đè sách cũ.';
    noInput.required = false;
    $('saveBookBtn').textContent = 'Thêm mới';
    $('saveBookBtn').className = 'px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold';
  } else {
    addBtn.className = 'text-left border-2 border-slate-200 bg-white hover:border-emerald-300 rounded-xl p-3 transition';
    updateBtn.className = 'text-left border-2 border-amber-300 bg-amber-50 rounded-xl p-3 transition';
    hint.className = 'text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 mb-3';
    hint.textContent = 'Chế độ Sửa / cập nhật: No là khóa đối chiếu. No đã có sẽ được sửa; No chưa có sẽ được thêm mới.';
    noInput.required = true;
    $('saveBookBtn').textContent = 'Sửa / cập nhật';
    $('saveBookBtn').className = 'px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold';
  }
}

function openForm(book) {
  const editingExisting = Boolean(book);
  $('formTitle').textContent = editingExisting ? 'Sửa sách' : 'Thêm / sửa sách thủ công';
  $('originalNo').value = book?.No ?? '';
  $('fNo').value = book?.No ?? '';
  $('fTitle').value = book?.Title ?? '';
  $('fAuthor').value = book?.Author ?? '';
  $('fYear').value = book?.Year ?? '';
  $('fPublisher').value = book?.Publisher ?? '';
  $('fTypes').value = book?.Types ?? '';
  $('fShelf').value = book?.Shelf ?? '';
  $('fPosition').value = book?.Position ?? '';
  $('formError').textContent = '';

  if (editingExisting) {
    manualBookMode = 'update';
    $('manualModePanel').classList.add('hidden');
    $('manualModeHint').className = 'text-xs rounded-lg bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 mb-3';
    $('manualModeHint').textContent = `Đang sửa sách No ${book.No}. Thao tác này chỉ cập nhật cuốn sách đang chọn.`;
    $('fNo').required = true;
    $('saveBookBtn').textContent = 'Lưu thay đổi';
    $('saveBookBtn').className = 'px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold';
  } else {
    $('manualModePanel').classList.remove('hidden');
    setManualBookMode('add');
  }

  $('bookDialog').classList.remove('hidden');
  $('bookDialog').classList.add('flex');
}
function closeForm(){ $('bookDialog').classList.add('hidden'); $('bookDialog').classList.remove('flex'); }
window.editBook = (book) => openForm(book);

function formBook(){
  return {
    No:Number($('fNo').value),
    Title:$('fTitle').value,
    Author:$('fAuthor').value,
    Year:Number($('fYear').value),
    Publisher:$('fPublisher').value,
    Types:$('fTypes').value,
    Shelf:$('fShelf').value,
    Position:Number($('fPosition').value)
  };
}

async function saveBook(e) {
  e.preventDefault();
  $('formError').textContent = '';
  const original = $('originalNo').value;
  const book = formBook();

  // Nút Sửa ở từng dòng luôn sửa đúng bản ghi đã chọn như trước.
  if (original) {
    const res = await fetch(`/admin/api/books/${encodeURIComponent(original)}`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(book)
    });
    const data = await res.json();
    if (!res.ok || !data.success) { $('formError').textContent = data.error || 'Không lưu được'; return; }
    closeForm();
    await loadBooks(currentPage);
    return;
  }

  if (manualBookMode === 'update') {
    const no = Number(book.No);
    if (!Number.isInteger(no) || no <= 0) {
      $('formError').textContent = 'Chế độ Sửa / cập nhật yêu cầu No là số nguyên lớn hơn 0.';
      return;
    }
    if (!confirm(`Sửa / cập nhật theo No ${no}?\n\n- Nếu No ${no} đã tồn tại: dữ liệu cũ sẽ được thay bằng thông tin trong form.\n- Nếu No ${no} chưa tồn tại: hệ thống sẽ thêm mới.`)) return;
  } else {
    if (!confirm('Thêm mới cuốn sách này?\n\nHệ thống sẽ tự cấp No tiếp theo và không ghi đè bất kỳ sách cũ nào.')) return;
  }

  const res = await fetch('/admin/api/books/manual', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ mode: manualBookMode, book })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    $('formError').textContent = data.error || 'Không lưu được';
    return;
  }

  closeForm();
  if (manualBookMode === 'add') {
    alert(`Đã thêm mới sách với No ${data.assignedNo}.`);
    // Sách thêm mới nằm ở cuối danh sách No tăng dần.
    await loadBooks(Math.max(1, Math.ceil((total + 1) / pageSize)));
  } else {
    alert(data.action === 'updated'
      ? `Đã cập nhật sách No ${data.assignedNo}.`
      : `No ${data.assignedNo} chưa tồn tại nên hệ thống đã thêm mới.`);
    await loadBooks(currentPage);
  }
}

window.deleteBook = async (no) => {
  if (!confirm(`Xóa sách No ${no}?`)) return;
  const res = await fetch(`/admin/api/books/${no}`,{method:'DELETE'});
  const data = await res.json();
  if (!res.ok || !data.success) return alert(data.error || 'Không xóa được');
  await loadBooks(currentPage);
};

function parseCsv(text) {
  const cleanText = String(text || '').replace(/^\uFEFF/, '');
  const records=[]; let row=[]; let field=''; let quoted=false;
  for(let i=0;i<cleanText.length;i++){
    const c=cleanText[i];
    if(quoted){
      if(c==='"' && cleanText[i+1]==='"'){field+='"';i++;}
      else if(c==='"'){quoted=false;}
      else field+=c;
    } else {
      if(c==='"') quoted=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\n'){row.push(field.replace(/\r$/,''));records.push(row);row=[];field='';}
      else field+=c;
    }
  }
  if (quoted) throw new Error('CSV có dấu ngoặc kép chưa đóng.');
  if(field.length || row.length){row.push(field);records.push(row);}
  const header=(records.shift()||[]).map(x=>x.trim());
  const dataRows = records.filter(r=>r.some(v=>String(v).trim()!==''));
  return {
    header,
    rows: dataRows.map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])))
  };
}

function validateCsvHeaders(header) {
  const missing = EXPECTED_BOOK_HEADERS.filter(h => !header.includes(h));
  const extra = header.filter(h => !EXPECTED_BOOK_HEADERS.includes(h));
  if (missing.length || extra.length || header.length !== EXPECTED_BOOK_HEADERS.length) {
    const parts = [];
    if (missing.length) parts.push(`thiếu cột: ${missing.join(', ')}`);
    if (extra.length) parts.push(`thừa/sai tên cột: ${extra.join(', ')}`);
    throw new Error(`Cấu trúc CSV không đúng (${parts.join('; ')}). Hãy tải file CSV mẫu và giữ nguyên 8 tên cột.`);
  }
}

function validateImportRowsForUpdate(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Không tìm thấy dữ liệu hợp lệ.');
  const seen = new Set();
  for (let i = 0; i < items.length; i++) {
    const no = Number(items[i]?.No ?? items[i]?.no);
    if (!Number.isInteger(no) || no <= 0) throw new Error(`Dòng dữ liệu ${i + 1}: No không hợp lệ để Sửa / cập nhật.`);
    if (seen.has(no)) throw new Error(`File có No bị trùng: ${no}. Chế độ Sửa / cập nhật yêu cầu mỗi No chỉ xuất hiện một lần.`);
    seen.add(no);
  }
}

function validateImportRowsForAdd(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Không tìm thấy dữ liệu hợp lệ.');
  // Ở chế độ Thêm mới, No trong file chỉ để tham khảo và sẽ bị bỏ qua.
  // Vì vậy không chặn No trùng, No trống hoặc No đã tồn tại trong database.
}

async function prepareImportFile(e) {
  const file = e.target.files?.[0];
  const status = $('importStatus');
  pendingImportItems = null;
  pendingImportFileName = '';
  $('importModePanel').classList.add('hidden');
  $('importFileInfo').classList.add('hidden');
  if (!file) return;

  status.textContent = 'Đang đọc và kiểm tra cấu trúc file...';
  try {
    const text = await file.text();
    let items;
    if (file.name.toLowerCase().endsWith('.json')) {
      const obj = JSON.parse(text);
      items = Array.isArray(obj) ? obj : obj.data;
      if (!Array.isArray(items)) throw new Error('JSON phải là một mảng sách hoặc có thuộc tính data là mảng sách.');
    } else {
      const parsed = parseCsv(text);
      validateCsvHeaders(parsed.header);
      items = parsed.rows;
    }
    if (!items.length) throw new Error('File không có bản ghi nào.');

    pendingImportItems = items;
    pendingImportFileName = file.name;
    $('importFileInfo').innerHTML = `<b>${esc(file.name)}</b> · ${items.length} bản ghi. Hãy chọn một chế độ import bên dưới.`;
    $('importFileInfo').classList.remove('hidden');
    $('importModePanel').classList.remove('hidden');
    status.textContent = 'File hợp lệ. Chưa có dữ liệu nào được ghi vào Supabase.';
  } catch (err) {
    status.textContent = 'Lỗi: ' + err.message;
    e.target.value = '';
  }
}

async function runImport(mode) {
  const items = pendingImportItems;
  const status = $('importStatus');
  let done = 0;
  if (!Array.isArray(items) || !items.length) {
    status.textContent = 'Hãy chọn file CSV hoặc JSON trước.';
    return;
  }

  try {
    if (mode === 'update') validateImportRowsForUpdate(items);
    else validateImportRowsForAdd(items);

    const isAdd = mode === 'add';
    const message = isAdd
      ? `THÊM MỚI ${items.length} bản ghi từ file "${pendingImportFileName}"?

- Không bản ghi cũ nào bị sửa.
- No trong file sẽ bị bỏ qua.
- Hệ thống tự đánh No mới liên tiếp từ số lớn nhất hiện có + 1.`
      : `SỬA / CẬP NHẬT ${items.length} bản ghi từ file "${pendingImportFileName}"?

- No đã tồn tại sẽ bị cập nhật bằng dữ liệu trong file.
- No chưa tồn tại sẽ được thêm mới.

Hãy chắc chắn đây đúng là thao tác bạn muốn.`;
    if (!confirm(message)) {
      status.textContent = 'Đã hủy. Chưa có dữ liệu nào được thay đổi.';
      return;
    }

    $('importAddBtn').disabled = true;
    $('importUpdateBtn').disabled = true;
    let firstAssigned = null;
    let lastAssigned = null;

    for (let i = 0; i < items.length; i += 500) {
      const batch = items.slice(i, i + 500);
      status.textContent = `${isAdd ? 'Đang thêm mới' : 'Đang sửa / cập nhật'} ${done}/${items.length}...`;
      const res = await fetch('/admin/api/import', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ rows: batch, mode })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Lỗi batch ${Math.floor(i / 500) + 1}`);
      if (isAdd) {
        if (firstAssigned === null) firstAssigned = data.assignedFrom;
        lastAssigned = data.assignedTo;
      }
      done += batch.length;
    }

    status.textContent = isAdd
      ? `Hoàn tất: đã thêm mới ${done} bản ghi. No mới: ${firstAssigned} → ${lastAssigned}. Không ghi đè sách cũ.`
      : `Hoàn tất: đã xử lý ${done} bản ghi theo chế độ Sửa / cập nhật.`;
    pendingImportItems = null;
    pendingImportFileName = '';
    $('importFile').value = '';
    $('importModePanel').classList.add('hidden');
    $('importFileInfo').classList.add('hidden');
    await loadBooks(isAdd ? Math.max(1, Math.ceil((total + done) / pageSize)) : currentPage);
  } catch (err) {
    // Đặc biệt với Thêm mới: nếu các batch trước đã thành công, chỉ giữ lại phần chưa xử lý.
    // Nhờ đó người quản lý bấm lại sẽ không thêm trùng các batch đã hoàn tất.
    if (mode === 'add' && done > 0 && done < items.length) {
      pendingImportItems = items.slice(done);
      $('importFileInfo').innerHTML = `<b>${esc(pendingImportFileName)}</b> · đã thêm ${done} bản ghi, còn ${pendingImportItems.length} bản ghi chưa xử lý. Bấm <b>Thêm mới</b> để tiếp tục phần còn lại.`;
      status.textContent = `Lỗi sau khi đã thêm ${done}/${items.length} bản ghi: ${err.message}. Các bản ghi đã thêm được giữ nguyên; hệ thống sẽ chỉ tiếp tục phần còn lại khi bấm lại.`;
    } else {
      status.textContent = 'Lỗi: ' + err.message;
    }
  } finally {
    $('importAddBtn').disabled = false;
    $('importUpdateBtn').disabled = false;
  }
}

async function loadManagers() {
  if (!window.CAN_MANAGE_USERS) return;
  const status = $('managerStatus');
  status.textContent = 'Đang tải tài khoản quản lý...';
  try {
    const res = await fetch('/admin/api/managers', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (data.setupRequired) $('managerSetupNotice').classList.remove('hidden');
      throw new Error(data.error || 'Không tải được tài khoản quản lý.');
    }
    $('managerSetupNotice').classList.add('hidden');
    managerRows = data.data || [];
    status.textContent = `${managerRows.length} tài khoản quản lý`;
    renderManagers();
  } catch (error) {
    managerRows = [];
    renderManagers();
    status.textContent = error.message;
  }
}

function renderManagers() {
  if (!$('managerTable')) return;
  $('managerTable').innerHTML = managerRows.length ? managerRows.map(user => `
    <tr class="border-t">
      <td class="p-3 font-semibold">${esc(user.username)}</td>
      <td class="p-3">${esc(user.display_name)}</td>
      <td class="p-3"><span class="px-2 py-1 rounded-full text-xs font-semibold ${user.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${user.active ? 'Đang hoạt động' : 'Đã khóa'}</span></td>
      <td class="p-3 whitespace-nowrap">
        <button class="text-indigo-600 font-semibold mr-3" onclick="editManagerById(${Number(user.id)})">Sửa</button>
        <button class="text-red-600 font-semibold" onclick="deleteManagerById(${Number(user.id)})">Xóa</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="4" class="p-4 text-center text-slate-500">Chưa có tài khoản quản lý.</td></tr>';
}

function openManagerForm(user) {
  $('managerFormTitle').textContent = user ? 'Sửa tài khoản quản lý' : 'Thêm tài khoản quản lý';
  $('managerId').value = user?.id ?? '';
  $('managerUsername').value = user?.username ?? '';
  $('managerDisplayName').value = user?.display_name ?? '';
  $('managerPassword').value = '';
  $('managerPassword').required = !user;
  $('managerActive').checked = user ? Boolean(user.active) : true;
  $('managerFormError').textContent = '';
  $('managerDialog').classList.remove('hidden');
  $('managerDialog').classList.add('flex');
}

function closeManagerForm() {
  $('managerDialog').classList.add('hidden');
  $('managerDialog').classList.remove('flex');
}

window.editManagerById = (id) => {
  const user = managerRows.find(item => Number(item.id) === Number(id));
  if (user) openManagerForm(user);
};

async function saveManager(e) {
  e.preventDefault();
  const id = $('managerId').value;
  const payload = {
    username: $('managerUsername').value,
    display_name: $('managerDisplayName').value,
    active: $('managerActive').checked
  };
  const password = $('managerPassword').value;
  if (password) payload.password = password;
  if (!id && !password) {
    $('managerFormError').textContent = 'Hãy nhập mật khẩu cho tài khoản mới.';
    return;
  }

  const res = await fetch(id ? `/admin/api/managers/${encodeURIComponent(id)}` : '/admin/api/managers', {
    method: id ? 'PUT' : 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    $('managerFormError').textContent = data.error || 'Không lưu được tài khoản quản lý.';
    return;
  }
  closeManagerForm();
  await loadManagers();
}

window.deleteManagerById = async (id) => {
  const user = managerRows.find(item => Number(item.id) === Number(id));
  if (!user) return;
  if (!confirm(`Xóa tài khoản quản lý "${user.username}"?`)) return;
  const res = await fetch(`/admin/api/managers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok || !data.success) return alert(data.error || 'Không xóa được tài khoản.');
  await loadManagers();
};
