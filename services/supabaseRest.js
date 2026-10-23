const DEFAULT_TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS || 6000);

function getConfig(keyMode = 'public') {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const publicKey = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
  const key = keyMode === 'admin' ? secretKey : publicKey;

  if (!url) throw new Error('Chưa cấu hình SUPABASE_URL');
  if (!key) {
    throw new Error(keyMode === 'admin'
      ? 'Chưa cấu hình SUPABASE_SECRET_KEY'
      : 'Chưa cấu hình SUPABASE_PUBLISHABLE_KEY');
  }

  return { url, key, keyMode };
}

function parseTotal(contentRange, fallbackLength) {
  if (!contentRange || !contentRange.includes('/')) return fallbackLength;
  const totalPart = contentRange.split('/')[1];
  const total = Number(totalPart);
  return Number.isFinite(total) ? total : fallbackLength;
}

async function supabaseTableRequest(table, method = 'GET', params = {}, body, options = {}) {
  const {
    keyMode = 'public',
    count = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    prefer = ''
  } = options;
  const { url, key } = getConfig(keyMode);
  const endpoint = new URL(`${url}/rest/v1/${encodeURIComponent(table)}`);

  Object.keys(params).forEach((name) => {
    const value = params[name];
    if (value !== undefined && value !== null && value !== '') {
      endpoint.searchParams.set(name, String(value));
    }
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      // New sb_publishable_/sb_secret_ keys must be sent in the apikey header.
      apikey: key,
      Accept: 'application/json'
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const preferences = [];
    if (count) preferences.push('count=exact');
    if (prefer) preferences.push(prefer);
    if (preferences.length) headers.Prefer = preferences.join(',');

    const response = await fetch(endpoint, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

    if (!response.ok) {
      const message = data?.message || data?.error || data?.hint || text || `HTTP ${response.status}`;
      const unregistered = response.status === 401 && /unregistered api key/i.test(String(message));
      const projectRef = new URL(url).hostname.split('.')[0];
      const error = new Error(unregistered
        ? `Supabase: API key ${keyMode === 'admin' ? 'Secret' : 'Publishable'} không được project hiện tại chấp nhận (Unregistered API key). Hãy copy lại đúng ${keyMode === 'admin' ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_PUBLISHABLE_KEY'} của project ${projectRef} trong Settings > API Keys rồi khởi động lại ứng dụng.`
        : `Supabase: ${message}`);
      error.status = response.status;
      error.code = unregistered ? 'SUPABASE_UNREGISTERED_API_KEY' : (data?.code || '');
      throw error;
    }

    return {
      data,
      total: count ? parseTotal(response.headers.get('content-range'), Array.isArray(data) ? data.length : 0) : undefined
    };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`Supabase quá thời gian phản hồi (${timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function supabaseSelect(params = {}, options = {}) {
  const result = await supabaseTableRequest('books', 'GET', params, undefined, options);
  return {
    data: Array.isArray(result.data) ? result.data : [],
    total: result.total
  };
}

async function supabaseWrite(method, params = {}, body, options = {}) {
  const result = await supabaseTableRequest('books', method, params, body, {
    ...options,
    keyMode: options.keyMode || 'admin'
  });
  return result.data;
}

async function testSupabaseConnection(keyMode = 'public') {
  const table = keyMode === 'admin' ? 'manager_users' : 'books';
  try {
    await supabaseTableRequest(
      table,
      'GET',
      { select: keyMode === 'admin' ? 'id' : 'No', limit: 1 },
      undefined,
      { keyMode, timeoutMs: 8000 }
    );
    return { ok: true, keyMode };
  } catch (error) {
    return {
      ok: false,
      keyMode,
      code: error.code || '',
      status: error.status || 0,
      error: error.message
    };
  }
}

module.exports = {
  getConfig,
  supabaseTableRequest,
  supabaseSelect,
  supabaseWrite,
  testSupabaseConnection
};
