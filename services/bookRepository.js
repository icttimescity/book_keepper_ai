const fs = require('fs');
const path = require('path');
const { supabaseSelect } = require('./supabaseRest');

const LOCAL_DATA_PATH = path.join(__dirname, '..', 'public', 'data', 'databookT35.json');
const INDEX_CACHE_MS = 5 * 60 * 1000;
const MAX_BATCH = 1000;

let localCache = null;
let supabaseIndexCache = null;
let supabaseIndexCacheAt = 0;

function normalizeBook(book) {
  return {
    No: Number(book.No ?? book.no ?? 0),
    Title: String(book.Title ?? book.title ?? 'Đang cập nhật'),
    Author: String(book.Author ?? book.author ?? 'Đang cập nhật'),
    Year: Number(book.Year ?? book.year ?? 0),
    Publisher: String(book.Publisher ?? book.publisher ?? 'Đang cập nhật'),
    Types: String(book.Types ?? book.types ?? 'Đang cập nhật'),
    Shelf: String(book.Shelf ?? book.shelf ?? 'Đang cập nhật'),
    Position: Number(book.Position ?? book.position ?? 0)
  };
}

function loadLocalBooks() {
  if (localCache) return localCache;
  const raw = JSON.parse(fs.readFileSync(LOCAL_DATA_PATH, 'utf8'));
  const rows = Array.isArray(raw) ? raw : raw.data;
  if (!Array.isArray(rows)) throw new Error('File databookT35.json không hợp lệ');
  localCache = rows.map(normalizeBook);
  return localCache;
}

function hashSeed(seed) {
  const text = String(seed || 'default');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(values, seed) {
  const result = values.slice();
  const random = mulberry32(hashSeed(seed));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function loadSupabaseIndex() {
  if (supabaseIndexCache && (Date.now() - supabaseIndexCacheAt) < INDEX_CACHE_MS) {
    return supabaseIndexCache;
  }

  const nos = [];
  const typeSet = new Set();
  let offset = 0;

  while (true) {
    const { data } = await supabaseSelect({
      select: 'No,Types',
      order: 'No.asc',
      offset,
      limit: MAX_BATCH
    });

    data.forEach((row) => {
      const no = Number(row.No);
      if (Number.isFinite(no) && no > 0) nos.push(no);
      const type = String(row.Types || '').trim();
      if (type && type !== '#N/A') typeSet.add(type);
    });

    if (data.length < MAX_BATCH) break;
    offset += data.length;
  }

  if (!nos.length) throw new Error('Supabase không trả về dữ liệu sách');

  supabaseIndexCache = {
    nos,
    categories: Array.from(typeSet).sort((a, b) => a.localeCompare(b, 'vi'))
  };
  supabaseIndexCacheAt = Date.now();
  return supabaseIndexCache;
}


function invalidateBookIndexCache() {
  supabaseIndexCache = null;
  supabaseIndexCacheAt = 0;
  // Local fallback is bundled/static; it is intentionally not mutated by admin writes.
}

function getLocalCategories() {
  const set = new Set();
  loadLocalBooks().forEach((book) => {
    const type = String(book.Types || '').trim();
    if (type && type !== '#N/A') set.add(type);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

function parseLimit(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(num)));
}

function parseOffset(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
}

async function getRandomPageFromSupabase({ seed, offset, limit }) {
  const index = await loadSupabaseIndex();
  const order = seededShuffle(index.nos, seed);
  const selectedNos = order.slice(offset, offset + limit);
  if (!selectedNos.length) return { data: [], total: index.nos.length, source: 'supabase' };

  const { data } = await supabaseSelect({
    select: '*',
    No: `in.(${selectedNos.join(',')})`
  });

  const map = new Map(data.map((row) => [Number(row.No), normalizeBook(row)]));
  return {
    data: selectedNos.map((no) => map.get(no)).filter(Boolean),
    total: index.nos.length,
    source: 'supabase'
  };
}

function getRandomPageFromLocal({ seed, offset, limit }) {
  const books = loadLocalBooks();
  const order = seededShuffle(books.map((book) => book.No), seed);
  const selectedNos = order.slice(offset, offset + limit);
  const map = new Map(books.map((book) => [book.No, book]));
  return {
    data: selectedNos.map((no) => map.get(no)).filter(Boolean),
    total: books.length,
    source: 'offline'
  };
}

async function getSearchPageFromSupabase({ q, searchMode, type, offset, limit }) {
  const params = {
    select: '*',
    order: 'No.asc',
    offset,
    limit
  };

  const keyword = String(q || '').trim();
  const selectedType = String(type || '').trim();

  if (keyword) {
    const clean = keyword.replace(/\*/g, '');
    params[searchMode === 'author' ? 'Author' : 'Title'] = `ilike.*${clean}*`;
  }
  if (selectedType) params.Types = `eq.${selectedType}`;

  const { data, total } = await supabaseSelect(params, { count: true });
  return {
    data: data.map(normalizeBook),
    total,
    source: 'supabase'
  };
}

function getSearchPageFromLocal({ q, searchMode, type, offset, limit }) {
  const keyword = String(q || '').trim().toLocaleLowerCase('vi');
  const selectedType = String(type || '').trim();
  const field = searchMode === 'author' ? 'Author' : 'Title';

  const filtered = loadLocalBooks().filter((book) => {
    if (selectedType && String(book.Types || '').trim() !== selectedType) return false;
    if (!keyword) return true;
    return String(book[field] || '').toLocaleLowerCase('vi').includes(keyword);
  });

  return {
    data: filtered.slice(offset, offset + limit),
    total: filtered.length,
    source: 'offline'
  };
}

async function listBooks(query) {
  const mode = query.mode === 'search' ? 'search' : 'random';
  const limit = parseLimit(query.limit, mode === 'random' ? 100 : 100);
  const offset = parseOffset(query.offset);

  const args = {
    seed: query.seed || 'library',
    offset,
    limit,
    q: query.q || '',
    searchMode: query.searchMode === 'author' ? 'author' : 'title',
    type: query.type || ''
  };

  try {
    return mode === 'search'
      ? await getSearchPageFromSupabase(args)
      : await getRandomPageFromSupabase(args);
  } catch (error) {
    console.warn('[Books] Supabase unavailable, using local fallback:', error.message);
    const fallback = mode === 'search'
      ? getSearchPageFromLocal(args)
      : getRandomPageFromLocal(args);
    fallback.warning = error.message;
    return fallback;
  }
}

async function getCategories() {
  try {
    const index = await loadSupabaseIndex();
    return { data: index.categories, source: 'supabase' };
  } catch (error) {
    console.warn('[Categories] Supabase unavailable, using local fallback:', error.message);
    return { data: getLocalCategories(), source: 'offline', warning: error.message };
  }
}

async function getRandomBook() {
  const seed = `${Date.now()}-${Math.random()}`;
  const page = await listBooks({ mode: 'random', seed, offset: 0, limit: 1 });
  return {
    data: page.data[0] || null,
    source: page.source,
    warning: page.warning
  };
}

module.exports = {
  listBooks,
  getCategories,
  getRandomBook,
  loadLocalBooks,
  invalidateBookIndexCache
};
