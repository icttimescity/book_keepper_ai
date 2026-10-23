const crypto = require('crypto');

const COOKIE_NAME = 'tuvansach_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || 'change-me';
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function createToken(user = {}) {
  const payload = Buffer.from(JSON.stringify({
    role: user.role === 'manager' ? 'manager' : 'admin',
    username: String(user.username || process.env.ADMIN_USERNAME || 'admin'),
    displayName: String(user.displayName || user.display_name || user.username || 'Admin'),
    userId: user.userId || user.id || null,
    exp: Date.now() + SESSION_TTL_MS
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  try {
    if (!token || !token.includes('.')) return null;
    const [payload, signature] = token.split('.');
    const expected = sign(payload);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!['admin', 'manager'].includes(data.role) || Number(data.exp) <= Date.now()) return null;
    if (data.role === 'admin') {
      if (!data.username) data.username = process.env.ADMIN_USERNAME || 'admin';
      if (!data.displayName) data.displayName = 'Admin';
    }
    return data;
  } catch (_) {
    return null;
  }
}

function getSession(req) {
  return readToken(req.cookies?.[COOKIE_NAME]);
}

function isAdmin(req) {
  return Boolean(getSession(req));
}

function isSuperAdmin(req) {
  return getSession(req)?.role === 'admin';
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Phiên đăng nhập quản trị không hợp lệ.' });
  req.adminUser = session;
  next();
}

function requireSuperAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Phiên đăng nhập quản trị không hợp lệ.' });
  if (session.role !== 'admin') return res.status(403).json({ success: false, error: 'Chỉ tài khoản admin chính mới được quản lý tài khoản.' });
  req.adminUser = session;
  next();
}

function setAdminCookie(res, user) {
  res.cookie(COOKIE_NAME, createToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS
  });
}

function clearAdminCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
}

module.exports = {
  getSession,
  isAdmin,
  isSuperAdmin,
  requireAdmin,
  requireSuperAdmin,
  setAdminCookie,
  clearAdminCookie
};
