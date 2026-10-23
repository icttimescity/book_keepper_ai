const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { supabaseWrite, supabaseTableRequest, testSupabaseConnection } = require('../services/supabaseRest');
const { invalidateBookIndexCache } = require('../services/bookRepository');
const {
  authenticateManager,
  listManagers,
  createManager,
  updateManager,
  deleteManager,
  isMissingManagerTableError
} = require('../services/managerUsers');
const {
  getSession,
  isAdmin,
  requireAdmin,
  requireSuperAdmin,
  setAdminCookie,
  clearAdminCookie
} = require('../services/adminAuth');

const BOOK_HEADERS = ['No', 'Title', 'Author', 'Year', 'Publisher', 'Types', 'Shelf', 'Position'];

function normalizeText(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || 'Đang cập nhật';
}

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function normalizeBook(input) {
  const no = normalizeNumber(input.No ?? input.no);
  if (no <= 0) throw new Error('No phải là số nguyên lớn hơn 0.');
  return {
    No: no,
    Title: normalizeText(input.Title ?? input.title),
    Author: normalizeText(input.Author ?? input.author),
    Year: normalizeNumber(input.Year ?? input.year),
    Publisher: normalizeText(input.Publisher ?? input.publisher),
    Types: normalizeText(input.Types ?? input.types),
    Shelf: normalizeText(input.Shelf ?? input.shelf),
    Position: normalizeNumber(input.Position ?? input.position)
  };
}

function adminUserFromEnv() {
  return {
    role: 'admin',
    username: process.env.ADMIN_USERNAME || 'admin',
    displayName: 'Admin'
  };
}

router.get('/', (req, res) => {
  if (!isAdmin(req)) return res.render('admin-login', { error: null });
  const sessionUser = getSession(req);
  res.render('admin', {
    secretConfigured: Boolean(process.env.SUPABASE_SECRET_KEY),
    sessionUser,
    canManageUsers: sessionUser?.role === 'admin'
  });
});

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const validUser = String(process.env.ADMIN_USERNAME || 'admin').trim();
  const validPass = String(process.env.ADMIN_PASSWORD || 'admin').trim();

  // Admin chính luôn được xác thực cục bộ từ .env và KHÔNG gọi Supabase.
  // Username không phân biệt hoa/thường để tránh vô tình rơi sang nhánh manager.
  if (username.toLowerCase() === validUser.toLowerCase() && password === validPass) {
    setAdminCookie(res, adminUserFromEnv());
    return res.redirect('/admin');
  }

  try {
    const manager = await authenticateManager(username, password);
    if (!manager) {
      return res.status(401).render('admin-login', { error: 'Sai tài khoản hoặc mật khẩu.' });
    }
    setAdminCookie(res, {
      role: 'manager',
      username: manager.username,
      displayName: manager.display_name,
      userId: manager.id
    });
    return res.redirect('/admin');
  } catch (error) {
    if (isMissingManagerTableError(error)) {
      return res.status(503).render('admin-login', {
        error: 'Chưa khởi tạo bảng manager_users. Tài khoản admin mặc định vẫn đăng nhập được; hãy chạy file supabase/manager_users.sql để bật tài khoản quản lý.'
      });
    }
    console.error('[Admin login manager]', error);
    return res.status(503).render('admin-login', { error: 'Không thể kiểm tra tài khoản quản lý: ' + error.message });
  }
});

router.post('/logout', (req, res) => {
  clearAdminCookie(res);
  res.redirect('/admin');
});

router.get('/template/books.csv', requireAdmin, (_req, res) => {
  const csv = '\uFEFF' + BOOK_HEADERS.join(',') + '\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mau_import_sach.csv"');
  res.send(csv);
});

router.get('/template/manager-users.sql', requireSuperAdmin, (_req, res) => {
  const filePath = path.join(__dirname, '..', 'supabase', 'manager_users.sql');
  const sql = fs.readFileSync(filePath, 'utf8');
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="manager_users.sql"');
  res.send(sql);
});

router.get('/api/status', requireAdmin, (req, res) => {
  res.json({
    success: true,
    secretConfigured: Boolean(process.env.SUPABASE_SECRET_KEY),
    user: {
      role: req.adminUser.role,
      username: req.adminUser.username,
      displayName: req.adminUser.displayName
    }
  });
});

router.get('/api/supabase-status', requireAdmin, async (_req, res) => {
  const [publicResult, adminResult] = await Promise.all([
    testSupabaseConnection('public'),
    testSupabaseConnection('admin')
  ]);
  res.json({
    success: publicResult.ok && adminResult.ok,
    public: publicResult,
    admin: adminResult,
    projectRef: String(process.env.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0] || ''
  });
});

router.get('/api/managers', requireSuperAdmin, async (_req, res) => {
  try {
    const data = await listManagers();
    res.json({ success: true, data });
  } catch (error) {
    if (isMissingManagerTableError(error)) {
      return res.status(503).json({
        success: false,
        setupRequired: true,
        error: 'Chưa có bảng manager_users. Hãy chạy file supabase/manager_users.sql trong SQL Editor của Supabase một lần.'
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/managers', requireSuperAdmin, async (req, res) => {
  try {
    const data = await createManager(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    if (isMissingManagerTableError(error)) {
      return res.status(503).json({ success: false, setupRequired: true, error: 'Chưa có bảng manager_users. Hãy chạy file supabase/manager_users.sql.' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/api/managers/:id', requireSuperAdmin, async (req, res) => {
  try {
    const data = await updateManager(req.params.id, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/api/managers/:id', requireSuperAdmin, async (req, res) => {
  try {
    await deleteManager(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/api/books/manual', requireAdmin, async (req, res) => {
  try {
    const mode = String(req.body?.mode || '').trim().toLowerCase();
    const input = req.body?.book || {};
    if (!['add', 'update'].includes(mode)) throw new Error('Chế độ lưu sách không hợp lệ.');

    if (mode === 'add') {
      // THÊM MỚI: tuyệt đối không ghi đè No cũ. No người dùng nhập chỉ mang tính tham khảo.
      // Server luôn cấp No tiếp theo từ số lớn nhất hiện có + 1 và retry nếu có xung đột đồng thời.
      let createdBook = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const maxNo = await getMaxBookNo();
        createdBook = normalizeBookForAppend(input, maxNo + 1);
        try {
          const data = await supabaseWrite('POST', {}, createdBook, {
            prefer: 'return=representation'
          });
          invalidateBookIndexCache();
          return res.json({
            success: true,
            mode,
            action: 'inserted',
            assignedNo: createdBook.No,
            data
          });
        } catch (error) {
          if (!(error?.status === 409 || error?.code === '23505') || attempt === 3) throw error;
        }
      }
    }

    // SỬA / CẬP NHẬT: No là khóa đối chiếu.
    // No đã tồn tại -> cập nhật; No chưa tồn tại -> thêm mới.
    const book = normalizeBook(input);
    const existing = await supabaseTableRequest('books', 'GET', {
      select: 'No',
      No: `eq.${book.No}`,
      limit: 1
    }, undefined, { keyMode: 'admin' });
    const existed = Array.isArray(existing.data) && existing.data.length > 0;

    const data = await supabaseWrite('POST', { on_conflict: 'No' }, book, {
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    invalidateBookIndexCache();
    return res.json({
      success: true,
      mode,
      action: existed ? 'updated' : 'inserted',
      assignedNo: book.No,
      data
    });
  } catch (error) {
    res.status(error.message.includes('SUPABASE_SECRET_KEY') ? 503 : 400).json({ success: false, error: error.message });
  }
});

router.post('/api/books', requireAdmin, async (req, res) => {
  try {
    const book = normalizeBook(req.body || {});
    const data = await supabaseWrite('POST', {}, book, {
      prefer: 'return=representation'
    });
    invalidateBookIndexCache();
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.message.includes('SUPABASE_SECRET_KEY') ? 503 : 400).json({ success: false, error: error.message });
  }
});

router.put('/api/books/:no', requireAdmin, async (req, res) => {
  try {
    const originalNo = normalizeNumber(req.params.no);
    if (originalNo <= 0) throw new Error('No không hợp lệ.');
    const book = normalizeBook(req.body || {});
    const data = await supabaseWrite('PATCH', { No: `eq.${originalNo}` }, book, {
      prefer: 'return=representation'
    });
    invalidateBookIndexCache();
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.message.includes('SUPABASE_SECRET_KEY') ? 503 : 400).json({ success: false, error: error.message });
  }
});

router.delete('/api/books/:no', requireAdmin, async (req, res) => {
  try {
    const no = normalizeNumber(req.params.no);
    if (no <= 0) throw new Error('No không hợp lệ.');
    await supabaseWrite('DELETE', { No: `eq.${no}` }, undefined, {
      prefer: 'return=minimal'
    });
    invalidateBookIndexCache();
    res.json({ success: true });
  } catch (error) {
    res.status(error.message.includes('SUPABASE_SECRET_KEY') ? 503 : 400).json({ success: false, error: error.message });
  }
});

async function getMaxBookNo() {
  const result = await supabaseTableRequest('books', 'GET', {
    select: 'No',
    order: 'No.desc',
    limit: 1
  }, undefined, { keyMode: 'admin' });
  const row = Array.isArray(result.data) ? result.data[0] : null;
  const maxNo = Number(row?.No || 0);
  return Number.isInteger(maxNo) && maxNo > 0 ? maxNo : 0;
}

function normalizeBookForAppend(input, assignedNo) {
  return {
    No: assignedNo,
    Title: normalizeText(input.Title ?? input.title),
    Author: normalizeText(input.Author ?? input.author),
    Year: normalizeNumber(input.Year ?? input.year),
    Publisher: normalizeText(input.Publisher ?? input.publisher),
    Types: normalizeText(input.Types ?? input.types),
    Shelf: normalizeText(input.Shelf ?? input.shelf),
    Position: normalizeNumber(input.Position ?? input.position)
  };
}

router.post('/api/import', requireAdmin, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const mode = String(req.body?.mode || '').trim().toLowerCase();
    if (!rows.length) throw new Error('Không có dữ liệu để import.');
    if (rows.length > 500) throw new Error('Mỗi batch tối đa 500 bản ghi.');
    if (!['add', 'update'].includes(mode)) throw new Error('Chế độ import không hợp lệ.');

    if (mode === 'add') {
      // Chế độ THÊM MỚI tuyệt đối không dùng No trong file để ghi đè.
      // Hệ thống lấy No lớn nhất hiện tại và tự cấp số liên tiếp cho toàn bộ batch.
      const maxNo = await getMaxBookNo();
      let books = null;
      let lastError = null;
      // Nếu có hai quản lý cùng thêm sách, No có thể thay đổi giữa lúc đọc max và INSERT.
      // Retry tối đa 3 lần vẫn luôn dùng INSERT thuần, tuyệt đối không ghi đè dữ liệu cũ.
      for (let attempt = 1; attempt <= 3; attempt++) {
        const freshMaxNo = attempt === 1 ? maxNo : await getMaxBookNo();
        books = rows.map((row, index) => normalizeBookForAppend(row, freshMaxNo + index + 1));
        try {
          await supabaseWrite('POST', {}, books, { prefer: 'return=minimal' });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (!(error?.status === 409 || error?.code === '23505') || attempt === 3) throw error;
        }
      }
      if (lastError) throw lastError;
      invalidateBookIndexCache();
      return res.json({
        success: true,
        mode,
        processed: books.length,
        assignedFrom: books[0].No,
        assignedTo: books[books.length - 1].No
      });
    }

    // Chế độ SỬA / CẬP NHẬT: No là khóa đối chiếu.
    // No đã tồn tại -> UPDATE, No chưa tồn tại -> INSERT.
    const books = rows.map(normalizeBook);
    await supabaseWrite('POST', { on_conflict: 'No' }, books, {
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    invalidateBookIndexCache();
    return res.json({ success: true, mode, processed: books.length });
  } catch (error) {
    res.status(error.message.includes('SUPABASE_SECRET_KEY') ? 503 : 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
