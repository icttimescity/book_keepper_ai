// ==========================================
// 1. CẤU HÌNH DỮ LIỆU CỤC BỘ
// ==========================================
const LOCAL_DATA_URL = "/data/databookT35.json";

// State quản lý dữ liệu
let allBooksData = [];
let randomBooks = [];
let currentBooks = [];
let visibleCount = 100;
let activeSearchKeyword = '';
let activeSearchMode = 'title';
const INITIAL_BOOK_COUNT = 100;
const LOAD_MORE_COUNT = 50;

// ==========================================
// 2. KHỞI TẠO & ĐỌC DỮ LIỆU TỪ FILE JSON
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadBooksData();

    const input = document.getElementById('manualSearchInput');
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') manualSearch();
        });
    }

    const searchMode = document.getElementById('searchMode');
    if (searchMode) {
        searchMode.addEventListener('change', updateSearchPlaceholder);
    }

    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', applyTypeFilterImmediately);
    }
});

async function loadBooksData() {
    // Setup UI states
    document.getElementById('initialLoading').style.display = 'flex';
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('bookGrid').classList.add('hidden');
    document.getElementById('resultStats').classList.add('hidden');
    document.getElementById('noResult').classList.add('hidden');

    try {
        const response = await fetch(LOCAL_DATA_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error("HTTP Status " + response.status);

        const responseData = await response.json();

        // Hỗ trợ cả dạng mảng trực tiếp và dạng { success, total, data }
        let rawData = [];
        if (Array.isArray(responseData)) {
            rawData = responseData; // Dạng mảng trực tiếp
        } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
            rawData = responseData.data; // Dạng { status: 'success', data: [...] }
        } else {
            throw new Error("Cấu trúc JSON không hợp lệ.");
        }

        if (rawData.length === 0) {
            throw new Error("Không có dữ liệu trong file databookT35.json.");
        }

        // Chuẩn hóa dữ liệu thư viện từ file JSON
        allBooksData = rawData.map(book => ({
            No: book.No ?? book.no ?? book.NO ?? "",
            Title: book.Title ?? book.title ?? book["Tên sách"] ?? book["Title"] ?? "",
            Author: book.Author ?? book.author ?? book["Tác giả"] ?? "",
            Year: book.Year ?? book.year ?? book["Năm"] ?? "",
            Publisher: book.Publisher ?? book.publisher ?? book["Nhà xuất bản"] ?? "",
            Types: book.Types ?? book.types ?? book["Thể loại"] ?? "",
            Shelf: book.Shelf ?? book.shelf ?? book["Tủ"] ?? "",
            Position: book.Position ?? book.position ?? book["Vị trí"] ?? ""
        }));

        console.log("Dữ liệu sách sau chuẩn hóa:", allBooksData[0]);

        populateTypeFilter();
        randomBooks = shuffleBooks(allBooksData);
        currentBooks = randomBooks;
        visibleCount = Math.min(INITIAL_BOOK_COUNT, currentBooks.length);
        renderCurrentBooks();

    } catch (error) {
        console.error("Lỗi tải dữ liệu cục bộ:", error);
        document.getElementById('errorText').innerText = "Chi tiết lỗi: " + error.message;
        document.getElementById('errorState').classList.remove('hidden');
        document.getElementById('errorState').classList.add('flex');
    } finally {
        document.getElementById('initialLoading').style.display = 'none';
    }
}

// ==========================================
// 3. XỬ LÝ DỮ LIỆU & BỘ LỌC
// ==========================================

// Hàm chuyển đổi chuỗi tag thành mảng một cách an toàn
function parseTags(tagData) {
    if (!tagData) return [];
    if (Array.isArray(tagData)) return tagData.map(t => t.trim()).filter(t => t);
    if (typeof tagData === 'string') {
        return tagData.split(/[,\/]/).map(t => t.trim()).filter(t => t);
    }
    return [];
}

function populateTypeFilter() {
    const select = document.getElementById('typeFilter');
    if (!select) return;

    const typeSet = new Set();
    allBooksData.forEach(book => {
        parseTags(book.Types).forEach(type => {
            const cleanType = type.trim();
            if (cleanType && cleanType !== '#N/A') typeSet.add(cleanType);
        });
    });

    const types = Array.from(typeSet).sort((a, b) => a.localeCompare(b, 'vi'));
    select.innerHTML = '<option value="">Tất cả thể loại</option>';

    types.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        select.appendChild(option);
    });
}

function shuffleBooks(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function updateSearchPlaceholder() {
    const mode = document.getElementById('searchMode')?.value || 'title';
    const input = document.getElementById('manualSearchInput');
    if (!input) return;
    input.placeholder = mode === 'author'
        ? 'Nhập tên tác giả cần tìm...'
        : 'Nhập tên sách cần tìm...';
}

function getFilteredBooks(keyword, mode, selectedType) {
    return allBooksData.filter(book => {
        const bookTypes = parseTags(book.Types);
        const typeMatches = !selectedType || bookTypes.includes(selectedType);

        if (!typeMatches) return false;
        if (!keyword) return true;

        const fieldValue = mode === 'author'
            ? (book.Author || '').toString().toLowerCase()
            : (book.Title || '').toString().toLowerCase();

        return fieldValue.includes(keyword);
    });
}

function manualSearch() {
    const input = document.getElementById('manualSearchInput');
    const mode = document.getElementById('searchMode')?.value || 'title';
    const selectedType = document.getElementById('typeFilter')?.value || '';
    const keyword = (input?.value || '').toLowerCase().trim();

    // Tìm kiếm từ khóa chỉ chạy khi người dùng bấm nút hoặc nhấn Enter.
    activeSearchKeyword = keyword;
    activeSearchMode = mode;

    if (!keyword && !selectedType) {
        currentBooks = randomBooks;
    } else {
        currentBooks = getFilteredBooks(keyword, mode, selectedType);
    }

    visibleCount = Math.min(INITIAL_BOOK_COUNT, currentBooks.length);
    renderCurrentBooks();
}

function applyTypeFilterImmediately() {
    const selectedType = document.getElementById('typeFilter')?.value || '';

    // Đổi thể loại sẽ lọc ngay lập tức. Từ khóa chỉ được áp dụng nếu trước đó
    // người dùng đã chủ động bấm Tìm kiếm/Enter.
    if (!selectedType && !activeSearchKeyword) {
        currentBooks = randomBooks;
    } else {
        currentBooks = getFilteredBooks(activeSearchKeyword, activeSearchMode, selectedType);
    }

    visibleCount = Math.min(INITIAL_BOOK_COUNT, currentBooks.length);
    renderCurrentBooks();
}

function showRandomBook() {
    if (!allBooksData.length) return;

    const randomIndex = Math.floor(Math.random() * allBooksData.length);
    currentBooks = [allBooksData[randomIndex]];
    visibleCount = 1;
    renderCurrentBooks();
}

function renderCurrentBooks() {
    const visibleBooks = currentBooks.slice(0, visibleCount);
    renderGrid(visibleBooks);

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.style.display = visibleCount < currentBooks.length ? 'inline-flex' : 'none';
    }
}

// ==========================================
// 4. HIỂN THỊ GIAO DIỆN SÁCH
// ==========================================
function renderGrid(books) {
    const grid = document.getElementById('bookGrid');
    const noResult = document.getElementById('noResult');
    const stats = document.getElementById('resultStats');

    grid.innerHTML = '';

    if (books.length === 0) {
        grid.classList.add('hidden');
        stats.classList.add('hidden');
        noResult.classList.remove('hidden');
        noResult.classList.add('flex');
        return;
    }

    noResult.classList.add('hidden');
    noResult.classList.remove('flex');
    document.getElementById('countDisplay').innerText = books.length;
    const totalCountDisplay = document.getElementById('totalCountDisplay');
    if (totalCountDisplay) totalCountDisplay.innerText = currentBooks.length;
    stats.classList.remove('hidden');
    grid.classList.remove('hidden');

    books.forEach((book) => {
        const title = book.Title || "Chưa có tên";
        const author = book.Author || "Đang cập nhật";
        const age = book.Year || "";
        const tags = parseTags(book.Types);
    const shelf = book.Shelf || "Chưa cập nhật";
    const position = book.Position || "Chưa cập nhật";

        let tagsHtml = '';
        tags.slice(0, 2).forEach(t => {
            tagsHtml += `<span class="inline-block bg-slate-100 text-slate-600 text-[11px] font-medium px-2 py-1 rounded-md mr-1.5 mb-1.5 border border-slate-200">${t}</span>`;
        });
        if (tags.length > 2) {
            tagsHtml += `<span class="inline-block bg-slate-50 text-slate-400 text-[11px] px-1.5 py-1 rounded-md mb-1.5 border border-transparent">+${tags.length - 2}</span>`;
        }

        const encodedData = encodeURIComponent(JSON.stringify(book));

        const card = document.createElement('div');
        card.className = "book-card bg-white rounded-2xl border border-slate-200 p-5 flex flex-col h-full cursor-pointer relative overflow-hidden group";
        card.onclick = () => openModal(encodedData);

        card.innerHTML = `
                    <div class="flex-grow flex flex-col">
                        <div class="flex justify-between items-start mb-3 h-6">
                            ${age ? `<span class="inline-flex items-center gap-1 bg-green-50/80 text-green-700 font-semibold text-[10px] uppercase tracking-wider px-2 py-1 rounded-md"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${age}</span>` : ''}
                        </div>
                        <h3 class="font-bold text-slate-800 text-base leading-snug mb-2 line-clamp-2" title="${title}">${title}</h3>
                        <p class="text-sm text-slate-500 mb-4 flex items-center gap-1.5 font-medium">
                            <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            ${author}
                        </p>
                        <div class="flex flex-wrap mt-auto pt-2">${tagsHtml}<div class="mt-3 text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2 font-semibold">📚 Vị trí: Tủ ${book.Shelf || "-"} - Ngăn ${book.Position || "-"}</div></div>
                    </div>
                    <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-blue-600 group-hover:text-blue-700 transition-colors">
                        <span class="text-xs font-bold uppercase tracking-wide">Tóm tắt sách</span>
                        <div class="bg-blue-50 p-1 rounded-full group-hover:bg-blue-100 transition-colors">
                            <svg class="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                        </div>
                    </div>
                `;
        grid.appendChild(card);
    });
}

// ==========================================
// 5. TÍCH HỢP AGNES AI QUA SERVER API
// ==========================================

async function openModal(encodedData) {
    const book = JSON.parse(decodeURIComponent(encodedData));
    const title = book.Title || "Chưa có tên";
    const author = book.Author || "Đang cập nhật";
    const tags = parseTags(book.Types);
    const shelf = book.Shelf || "Chưa cập nhật";
    const position = book.Position || "Chưa cập nhật";
    const tagsString = tags.length > 0 ? tags.join(', ') : "Không có";

    const modal = document.getElementById('aiModal');
    const modalContent = document.getElementById('aiModalContent');

    // Render UI Headers
    document.getElementById('modalBookTitle').innerText = title;
    document.getElementById('modalBookAuthor').innerText = `Tác giả: ${author} | Tủ ${book.Shelf || "-"} - Vị trí ${book.Position || "-"}`;

    const tagsContainer = document.getElementById('modalTagsInfo');
    tagsContainer.innerHTML = '';
    tags.forEach(t => {
        tagsContainer.innerHTML += `<span class="px-2.5 py-1 bg-white/20 backdrop-blur-sm text-white rounded-md text-xs font-semibold border border-white/10 shadow-sm">${t}</span>`;
    });

    // Show Loading state
    document.getElementById('aiLoading').style.display = 'flex';
    document.getElementById('aiResultText').style.display = 'none';
    document.getElementById('aiError').style.display = 'none';

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modalContent.classList.remove('scale-95');

    // --- Gọi AI thông qua Agnes AI Server API ---
    try {
        const promptString = `Bạn là một chuyên gia tư vấn sách giáo dục chuyên nghiệp.
            Nhiệm vụ của bạn là viết một đoạn giới thiệu ngắn gọn (khoảng 3-4 câu), khách quan và hấp dẫn về cuốn sách được cung cấp.
            Yêu cầu bắt buộc:
            - Sử dụng ngôn từ chuẩn mực, truyền cảm hứng.
            - Tuyệt đối không dùng văn phong quá trẻ con hoặc nhí nhảnh.
            - Khi đưa ra lời khuyên hoặc tương tác với người đọc (trong độ tuổi học sinh), hãy sử dụng đại từ nhân xưng là "con" (ví dụ: "Cuốn sách này sẽ giúp con hiểu rõ hơn...").
Hãy tư vấn cuốn sách này:\n- Tên sách: "${title}"\n- Tác giả: "${author}"\n- Chủ đề/Thể loại: "${tagsString}"`;

        const response = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptString })
        });

        const aiData = await response.json();
        if (!response.ok) throw new Error(aiData.error || 'AI request failed');

        const rawText = aiData.text;

        // Format Markdown nhẹ nhàng sang HTML
        const formattedHtml = rawText.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                let clean = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                return `<p class="mb-3">${clean}</p>`;
            })
            .join('');

        // Cập nhật kết quả lên UI
        document.getElementById('aiResultText').innerHTML = formattedHtml;
        document.getElementById('aiLoading').style.display = 'none';
        document.getElementById('aiResultText').style.display = 'block';

    } catch (error) {
        console.error("Lỗi Agnes AI:", error);
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

document.getElementById('aiModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
});

// ==========================================
// 6. XEM THÊM SÁCH
// ==========================================
function setupLoadMore() {
    const btn = document.getElementById('loadMoreBtn');
    if (!btn) return;

    btn.onclick = function () {
        visibleCount = Math.min(visibleCount + LOAD_MORE_COUNT, currentBooks.length);
        renderCurrentBooks();
    };
}

// Gắn sự kiện một lần sau khi DOM đã sẵn sàng.
document.addEventListener('DOMContentLoaded', setupLoadMore);
