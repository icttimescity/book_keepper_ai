// ==========================================
// 1. CẤU HÌNH & STATE
// ==========================================
const BOOKS_API = '/api/books';
const INITIAL_BOOK_COUNT = 100;
const LOAD_MORE_COUNT = 50;

let currentBooks = [];
let currentTotal = 0;
let currentMode = 'random';
let currentOffset = 0;
let currentSeed = `${Date.now()}-${Math.random()}`;
let activeSearchKeyword = '';
let activeSearchMode = 'title';
let activeType = '';
let isLoadingMore = false;

// ==========================================
// 2. KHỞI TẠO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setupEvents();
    loadBooksData();
});

function setupEvents() {
    const input = document.getElementById('manualSearchInput');
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') manualSearch();
        });
    }

    const searchMode = document.getElementById('searchMode');
    if (searchMode) searchMode.addEventListener('change', updateSearchPlaceholder);

    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) typeFilter.addEventListener('change', applyTypeFilterImmediately);

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreBooks);

    const modal = document.getElementById('aiModal');
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === this) closeModal();
        });
    }
}

async function loadBooksData() {
    showInitialLoading(true);
    hideError();
    try {
        await loadCategories();
        currentMode = 'random';
        currentSeed = `${Date.now()}-${Math.random()}`;
        currentOffset = 0;
        currentBooks = [];
        currentTotal = 0;
        await fetchCurrentBooks(INITIAL_BOOK_COUNT, false);
    } catch (error) {
        showError(error.message || String(error));
    } finally {
        showInitialLoading(false);
    }
}

async function loadCategories() {
    const response = await fetch(`${BOOKS_API}/categories`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Không tải được thể loại');

    const select = document.getElementById('typeFilter');
    if (!select) return;
    select.innerHTML = '<option value="">Tất cả thể loại</option>';
    (result.data || []).forEach((type) => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        select.appendChild(option);
    });
}

function buildBooksUrl(limit) {
    const params = new URLSearchParams();
    params.set('mode', currentMode);
    params.set('offset', String(currentOffset));
    params.set('limit', String(limit));

    if (currentMode === 'random') {
        params.set('seed', currentSeed);
    } else {
        if (activeSearchKeyword) params.set('q', activeSearchKeyword);
        params.set('searchMode', activeSearchMode);
        if (activeType) params.set('type', activeType);
    }

    return `${BOOKS_API}?${params.toString()}`;
}

async function fetchCurrentBooks(limit, append) {
    const response = await fetch(buildBooksUrl(limit), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Không tải được dữ liệu sách');

    const rows = Array.isArray(result.data) ? result.data : [];
    currentBooks = append ? currentBooks.concat(rows) : rows;
    currentOffset = currentBooks.length;
    currentTotal = Number(result.total || currentBooks.length);
    renderGrid(currentBooks);
    updateLoadMoreButton();
}

// ==========================================
// 3. TÌM KIẾM / LỌC / NGẪU NHIÊN
// ==========================================
function updateSearchPlaceholder() {
    const mode = document.getElementById('searchMode')?.value || 'title';
    const input = document.getElementById('manualSearchInput');
    if (!input) return;
    input.placeholder = mode === 'author'
        ? 'Nhập tên tác giả cần tìm...'
        : 'Nhập tên sách cần tìm...';
}

async function manualSearch() {
    const input = document.getElementById('manualSearchInput');
    activeSearchMode = document.getElementById('searchMode')?.value || 'title';
    activeType = document.getElementById('typeFilter')?.value || '';
    activeSearchKeyword = (input?.value || '').trim();

    if (!activeSearchKeyword && !activeType) {
        currentMode = 'random';
        currentSeed = `${Date.now()}-${Math.random()}`;
    } else {
        currentMode = 'search';
    }

    await resetAndFetch();
}

async function applyTypeFilterImmediately() {
    activeType = document.getElementById('typeFilter')?.value || '';
    currentMode = (!activeType && !activeSearchKeyword) ? 'random' : 'search';
    if (currentMode === 'random') currentSeed = `${Date.now()}-${Math.random()}`;
    await resetAndFetch();
}

async function resetAndFetch() {
    hideError();
    showInitialLoading(true);
    try {
        currentOffset = 0;
        currentBooks = [];
        currentTotal = 0;
        await fetchCurrentBooks(INITIAL_BOOK_COUNT, false);
    } catch (error) {
        showError(error.message || String(error));
    } finally {
        showInitialLoading(false);
    }
}

async function showRandomBook() {
    hideError();
    showInitialLoading(true);
    try {
        const response = await fetch(`${BOOKS_API}/random`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Không chọn được sách ngẫu nhiên');
        currentMode = 'single';
        currentBooks = result.data ? [result.data] : [];
        currentTotal = currentBooks.length;
        currentOffset = currentBooks.length;
        renderGrid(currentBooks);
        updateLoadMoreButton();
    } catch (error) {
        showError(error.message || String(error));
    } finally {
        showInitialLoading(false);
    }
}

async function loadMoreBooks() {
    if (isLoadingMore || currentBooks.length >= currentTotal || currentMode === 'single') return;
    isLoadingMore = true;
    updateLoadMoreButton();
    try {
        await fetchCurrentBooks(LOAD_MORE_COUNT, true);
    } catch (error) {
        showError(error.message || String(error));
    } finally {
        isLoadingMore = false;
        updateLoadMoreButton();
    }
}

// ==========================================
// 4. HIỂN THỊ GIAO DIỆN
// ==========================================
function parseTags(tagData) {
    if (!tagData) return [];
    if (Array.isArray(tagData)) return tagData.map(t => String(t).trim()).filter(Boolean);
    if (typeof tagData === 'string') {
        return tagData.split(/[,\/]/).map(t => t.trim()).filter(Boolean);
    }
    return [];
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function displayNumberOrUpdating(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? String(num) : 'Đang cập nhật';
}

function renderGrid(books) {
    const grid = document.getElementById('bookGrid');
    const noResult = document.getElementById('noResult');
    const stats = document.getElementById('resultStats');
    if (!grid || !noResult || !stats) return;

    grid.innerHTML = '';

    if (!books.length) {
        grid.classList.add('hidden');
        stats.classList.add('hidden');
        noResult.classList.remove('hidden');
        noResult.classList.add('flex');
        updateLoadMoreButton();
        return;
    }

    noResult.classList.add('hidden');
    noResult.classList.remove('flex');
    document.getElementById('countDisplay').innerText = books.length;
    document.getElementById('totalCountDisplay').innerText = currentTotal;
    stats.classList.remove('hidden');
    grid.classList.remove('hidden');

    books.forEach((book) => {
        const title = book.Title || 'Đang cập nhật';
        const author = book.Author || 'Đang cập nhật';
        const year = displayNumberOrUpdating(book.Year);
        const shelf = book.Shelf || 'Đang cập nhật';
        const position = displayNumberOrUpdating(book.Position);
        const tags = parseTags(book.Types);

        let tagsHtml = '';
        tags.slice(0, 2).forEach((tag) => {
            tagsHtml += `<span class="inline-block bg-slate-100 text-slate-600 text-[11px] font-medium px-2 py-1 rounded-md mr-1.5 mb-1.5 border border-slate-200">${escapeHtml(tag)}</span>`;
        });

        const encodedData = encodeURIComponent(JSON.stringify(book));
        const card = document.createElement('div');
        card.className = 'book-card bg-white rounded-2xl border border-slate-200 p-5 flex flex-col h-full cursor-pointer relative overflow-hidden group';
        card.onclick = () => openModal(encodedData);

        card.innerHTML = `
            <div class="flex-grow flex flex-col">
                <div class="flex justify-between items-start mb-3 h-6">
                    <span class="inline-flex items-center gap-1 bg-green-50/80 text-green-700 font-semibold text-[10px] uppercase tracking-wider px-2 py-1 rounded-md">${escapeHtml(year)}</span>
                </div>
                <h3 class="font-bold text-slate-800 text-base leading-snug mb-2 line-clamp-2" title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
                <p class="text-sm text-slate-500 mb-4 flex items-center gap-1.5 font-medium">
                    <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    ${escapeHtml(author)}
                </p>
                <div class="flex flex-wrap mt-auto pt-2">${tagsHtml}</div>
                <div class="mt-3 text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2 font-semibold">📚 Vị trí: Tủ ${escapeHtml(shelf)} - Ngăn ${escapeHtml(position)}</div>
            </div>
            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-blue-600 group-hover:text-blue-700 transition-colors">
                <span class="text-xs font-bold uppercase tracking-wide">Tóm tắt sách</span>
                <div class="bg-blue-50 p-1 rounded-full group-hover:bg-blue-100 transition-colors">
                    <svg class="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

function updateLoadMoreButton() {
    const btn = document.getElementById('loadMoreBtn');
    if (!btn) return;
    const canLoad = currentMode !== 'single' && currentBooks.length < currentTotal;
    btn.style.display = canLoad ? 'inline-flex' : 'none';
    btn.disabled = isLoadingMore;
    btn.textContent = isLoadingMore ? 'Đang tải...' : 'Xem thêm 50 cuốn sách';
}

function showInitialLoading(show) {
    const el = document.getElementById('initialLoading');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function hideError() {
    const el = document.getElementById('errorState');
    if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
}

function showError(message) {
    const text = document.getElementById('errorText');
    if (text) text.innerText = 'Chi tiết lỗi: ' + message;
    const el = document.getElementById('errorState');
    if (el) {
        el.classList.remove('hidden');
        el.classList.add('flex');
    }
}

// ==========================================
// 5. AGNES AI QUA SERVER API
// ==========================================
async function openModal(encodedData) {
    const book = JSON.parse(decodeURIComponent(encodedData));
    const title = book.Title || 'Đang cập nhật';
    const author = book.Author || 'Đang cập nhật';
    const tags = parseTags(book.Types);
    const tagsString = tags.length ? tags.join(', ') : 'Không có';

    const modal = document.getElementById('aiModal');
    const modalContent = document.getElementById('aiModalContent');
    document.getElementById('modalBookTitle').innerText = title;
    document.getElementById('modalBookAuthor').innerText = `Tác giả: ${author} | Tủ ${book.Shelf || 'Đang cập nhật'} - Vị trí ${displayNumberOrUpdating(book.Position)}`;

    const tagsContainer = document.getElementById('modalTagsInfo');
    tagsContainer.innerHTML = '';
    tags.forEach((tag) => {
        const span = document.createElement('span');
        span.className = 'px-2.5 py-1 bg-white/20 backdrop-blur-sm text-white rounded-md text-xs font-semibold border border-white/10 shadow-sm';
        span.textContent = tag;
        tagsContainer.appendChild(span);
    });

    document.getElementById('aiLoading').style.display = 'flex';
    document.getElementById('aiResultText').style.display = 'none';
    document.getElementById('aiError').style.display = 'none';
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modalContent.classList.remove('scale-95');

    try {
        const promptString = `Bạn là một chuyên gia tư vấn sách giáo dục chuyên nghiệp.
Nhiệm vụ của bạn là viết một đoạn giới thiệu ngắn gọn (khoảng 3-4 câu), khách quan và hấp dẫn về cuốn sách được cung cấp.
Yêu cầu bắt buộc:
- Sử dụng ngôn từ chuẩn mực, truyền cảm hứng.
- Tuyệt đối không dùng văn phong quá trẻ con hoặc nhí nhảnh.
- Khi đưa ra lời khuyên hoặc tương tác với người đọc (trong độ tuổi học sinh), hãy sử dụng đại từ nhân xưng là "con".
Hãy tư vấn cuốn sách này:
- Tên sách: "${title}"
- Tác giả: "${author}"
- Chủ đề/Thể loại: "${tagsString}"`;

        const response = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptString })
        });
        const aiData = await response.json();
        if (!response.ok) throw new Error(aiData.error || 'AI request failed');

        const rawText = String(aiData.text || 'Không có nội dung trả về.');
        const formattedHtml = rawText.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => `<p class="mb-3">${escapeHtml(line)}</p>`)
            .join('');

        document.getElementById('aiResultText').innerHTML = formattedHtml;
        document.getElementById('aiLoading').style.display = 'none';
        document.getElementById('aiResultText').style.display = 'block';
    } catch (error) {
        console.error('Lỗi Agnes AI:', error);
        document.getElementById('aiLoading').style.display = 'none';
        document.getElementById('aiErrorText').innerText = `Lỗi từ Agnes AI: ${error.message || error}. Vui lòng thử lại.`;
        document.getElementById('aiError').style.display = 'flex';
    }
}

function closeModal() {
    const modal = document.getElementById('aiModal');
    const modalContent = document.getElementById('aiModalContent');
    modal.classList.add('opacity-0', 'pointer-events-none');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
        document.getElementById('aiResultText').innerHTML = '';
    }, 300);
}
