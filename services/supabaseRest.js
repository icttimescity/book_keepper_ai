const DEFAULT_TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS || 6000);

function getConfig(keyMode = 'public') {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY || '';
  const key = keyMode === 'admin' ? secretKey : publicKey;

  if (!url) throw new Error('Chưa cấu hình SUPABASE_URL');
  if (!key) {
    throw new Error(keyMode === 'admin'
      ? 'Chưa cấu hình SUPABASE_SECRET_KEY'
      : 'Chưa cấu hình SUPABASE_PUBLISHABLE_KEY');
  }

  return { url, key };
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
      const error = new Error(`Supabase: ${message}`);
      error.status = response.status;
      error.code = data?.code || '';
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

module.exports = {
  getConfig,
  supabaseTableRequest,
  supabaseSelect,
  supabaseWrite
};
