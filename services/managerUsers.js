const crypto = require('crypto');
const { supabaseTableRequest } = require('./supabaseRest');

const TABLE = 'manager_users';

function cleanText(value, fallback = '') {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || fallback;
}

function validateUsername(value) {
  const username = cleanText(value).toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error('Tài khoản phải dài 3-50 ký tự và chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  }
  if (username === String(process.env.ADMIN_USERNAME || 'admin').toLowerCase()) {
    throw new Error('Tài khoản này trùng với tài khoản admin mặc định.');
  }
  return username;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 4 || password.length > 128) {
    throw new Error('Mật khẩu phải có từ 4 đến 128 ký tự.');
  }
  return password;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(validatePassword(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const supplied = String(password || '');
    const saved = String(stored || '');
    if (!saved) return false;

    // Tài khoản tạo từ giao diện admin được lưu dưới dạng scrypt$<salt>$<hash>.
    if (saved.startsWith('scrypt$')) {
      const [algorithm, salt, expectedHex] = saved.split('$');
      if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
      const actual = crypto.scryptSync(supplied, salt, 64);
      const expected = Buffer.from(expectedHex, 'hex');
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    }

    // Tương thích với user được nhập trực tiếp trong Supabase: nếu cột
    // password_hash đang chứa mật khẩu thường thì vẫn cho đăng nhập.
    // Sau lần đăng nhập thành công authenticateManager() sẽ tự nâng cấp sang scrypt.
    const actual = Buffer.from(supplied, 'utf8');
    const expected = Buffer.from(saved, 'utf8');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function isHashedPassword(stored) {
  return String(stored || '').startsWith('scrypt$');
}

function safeManager(row) {
  return {
    id: Number(row.id),
    username: String(row.username || ''),
    display_name: String(row.display_name || ''),
    active: Boolean(row.active),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

async function findManagerByUsername(username) {
  const normalized = cleanText(username).toLowerCase();
  if (!normalized) return null;

  // Đọc danh sách nhỏ tài khoản quản lý và so sánh username không phân biệt hoa/thường.
  // Cách này cũng hỗ trợ các tài khoản đã được nhập thủ công trực tiếp trên Supabase
  // trước khi hệ thống tự chuẩn hóa username về chữ thường.
  const { data } = await supabaseTableRequest(TABLE, 'GET', {
    select: 'id,username,display_name,password_hash,active,created_at,updated_at',
    order: 'id.asc'
  }, undefined, { keyMode: 'admin' });

  if (!Array.isArray(data)) return null;
  return data.find(row => cleanText(row.username).toLowerCase() === normalized) || null;
}

async function authenticateManager(username, password) {
  const manager = await findManagerByUsername(username);
  if (!manager || !manager.active || !verifyPassword(password, manager.password_hash)) return null;

  // Nếu user được tạo thủ công trong Supabase với mật khẩu thường nằm trong
  // password_hash, tự chuyển sang hash scrypt sau lần đăng nhập thành công.
  if (!isHashedPassword(manager.password_hash)) {
    try {
      await supabaseTableRequest(TABLE, 'PATCH', { id: `eq.${Number(manager.id)}` }, {
        password_hash: hashPassword(password),
        updated_at: new Date().toISOString()
      }, {
        keyMode: 'admin',
        prefer: 'return=minimal'
      });
    } catch (error) {
      // Không chặn đăng nhập nếu việc nâng cấp hash tạm thời thất bại.
      console.warn('[Manager password upgrade]', error.message);
    }
  }

  return safeManager(manager);
}

async function listManagers() {
  const { data } = await supabaseTableRequest(TABLE, 'GET', {
    select: 'id,username,display_name,active,created_at,updated_at',
    order: 'username.asc'
  }, undefined, { keyMode: 'admin' });
  return Array.isArray(data) ? data.map(safeManager) : [];
}

async function createManager(input) {
  const username = validateUsername(input.username);
  const displayName = cleanText(input.display_name || input.displayName, username);
  if (displayName.length > 100) throw new Error('Tên hiển thị tối đa 100 ký tự.');

  const payload = {
    username,
    display_name: displayName,
    password_hash: hashPassword(input.password),
    active: input.active !== false,
    updated_at: new Date().toISOString()
  };

  const { data } = await supabaseTableRequest(TABLE, 'POST', {}, payload, {
    keyMode: 'admin',
    prefer: 'return=representation'
  });
  return safeManager(Array.isArray(data) ? data[0] : data);
}

async function updateManager(id, input) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('ID người quản lý không hợp lệ.');

  const payload = { updated_at: new Date().toISOString() };
  if (input.username !== undefined) payload.username = validateUsername(input.username);
  if (input.display_name !== undefined || input.displayName !== undefined) {
    const displayName = cleanText(input.display_name || input.displayName);
    if (!displayName) throw new Error('Tên hiển thị không được để trống.');
    if (displayName.length > 100) throw new Error('Tên hiển thị tối đa 100 ký tự.');
    payload.display_name = displayName;
  }
  if (input.active !== undefined) payload.active = Boolean(input.active);
  if (String(input.password || '')) payload.password_hash = hashPassword(input.password);

  const { data } = await supabaseTableRequest(TABLE, 'PATCH', { id: `eq.${numericId}` }, payload, {
    keyMode: 'admin',
    prefer: 'return=representation'
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Không tìm thấy người quản lý.');
  return safeManager(row);
}

async function deleteManager(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('ID người quản lý không hợp lệ.');
  await supabaseTableRequest(TABLE, 'DELETE', { id: `eq.${numericId}` }, undefined, {
    keyMode: 'admin',
    prefer: 'return=minimal'
  });
}

function isMissingManagerTableError(error) {
  const text = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
  return text.includes('manager_users') && (
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('does not exist') ||
    text.includes('pgrst205')
  );
}

module.exports = {
  authenticateManager,
  listManagers,
  createManager,
  updateManager,
  deleteManager,
  hashPassword,
  verifyPassword,
  isMissingManagerTableError
};
