console.log('KL\'s Watch Cabinet PWA loaded');

let watches = [];
let sortedWatches = [];
let currentImageIndex = 0;
let currentImages = [];
let editingWatchId = null;
let currentWatchId = null;
let sortField = 'brandModel'; 
let sortOrder = 'asc';
let activeFilters = {
    brand: '',
    battery: '',
    module: '',
    material: '',
    movement: '',
    location: ''
};

const DB_NAME = 'KLWatchCabinetDB';
const DB_VERSION = 1;
const STORE_NAME = 'watches';

let db = null;

// --- EXCHANGE RATE LOGIC ---
let rateCache = { data: null, timestamp: 0 };
const CACHE_DURATION = 3600000; // 1 hour

async function getExchangeRate(currency) {
    if (currency === 'HKD') return 1;
    
    const now = Date.now();
    if (rateCache.data && rateCache[currency] && (now - rateCache.timestamp) < CACHE_DURATION) {
        return rateCache[currency];
    }

    try {
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`);
        const data = await response.json();
        
        rateCache.timestamp = now;
        rateCache.data = data.rates;
        
        return data.rates['HKD'] || null;
    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        return null;
    }
}

async function calculateFinalPrice() {
    const priceInput = document.getElementById('price').value;
    const currency = document.getElementById('currency').value;
    const finalPriceField = document.getElementById('finalPriceHKD');
    const rateInfo = document.getElementById('rateInfo');

    if (!finalPriceField) return; // Safety check

    const cleanPrice = parseFloat(priceInput.replace(/[^0-9.-]+/g, ""));
    
    if (isNaN(cleanPrice) || !currency) {
        finalPriceField.value = '';
        if(rateInfo) rateInfo.textContent = '';
        return;
    }

    if (currency === 'HKD') {
        finalPriceField.value = cleanPrice.toLocaleString();
        if(rateInfo) rateInfo.textContent = 'No conversion needed';
        return;
    }

    if(rateInfo) rateInfo.textContent = 'Fetching rate...';
    const rate = await getExchangeRate(currency);

    if (rate) {
        const finalPrice = cleanPrice * rate;
        finalPriceField.value = finalPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        if(rateInfo) rateInfo.textContent = `Rate: 1 ${currency} = ${rate.toFixed(4)} HKD`;
    } else {
        finalPriceField.value = 'Error';
        if(rateInfo) rateInfo.textContent = 'Could not fetch rate';
    }
}
// ---------------------------

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            console.log('Database opened');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                console.log('Database created');
            }
        };
    });
}

// Load all watches
async function loadWatches() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            watches = request.result || [];
            console.log('Loaded', watches.length, 'watches');
            resolve(watches);
        };
        request.onerror = () => reject(request.error);
    });
}

// Save watch
async function saveWatch(watch) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        let request;
        if (watch.id) {
            request = store.put(watch);
        } else {
            watch.savedDate = new Date().toLocaleDateString();
            request = store.add(watch);
        }

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Delete watch
async function deleteWatch(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Get watch by ID
async function getWatch(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Sort watches
function sortWatches() {
    sortedWatches = [...watches];
    
    sortedWatches.sort((a, b) => {
        let valA, valB;
        let result = 0;
        
        if (sortField === 'brandModel') {
            // LEVEL 1: Brand
            const brandA = (a.brand || '').toLowerCase();
            const brandB = (b.brand || '').toLowerCase();
            
            if (brandA < brandB) result = -1;
            else if (brandA > brandB) result = 1;
            else {
                // LEVEL 2: Model
                const modelA = (a.modelName || '').toLowerCase();
                const modelB = (b.modelName || '').toLowerCase();
                if (modelA < modelB) result = -1;
                else if (modelA > modelB) result = 1;
                else result = 0;
            }
        } 
        else if (sortField === 'finalPriceHKD') {
            const parsePrice = (p) => {
                if (!p) return 0;
                return parseFloat(p.toString().replace(/[^0-9.-]+/g, "")) || 0;
            };
            valA = parsePrice(a.finalPriceHKD);
            valB = parsePrice(b.finalPriceHKD);
            
            if (valA < valB) result = -1;
            else if (valA > valB) result = 1;
            else result = 0;
        } 
        else if (sortField === 'purchasedDate') {
            // Convert both to timestamps (numbers) for reliable comparison
            const dateA = parseDate(a.purchasedDate);
            const dateB = parseDate(b.purchasedDate);
            
            valA = dateA.getTime(); 
            valB = dateB.getTime();
            
            if (valA < valB) result = -1;
            else if (valA > valB) result = 1;
            else result = 0;
        } 
        else if (sortField === 'year') {
            valA = parseInt(a.year) || 0;
            valB = parseInt(b.year) || 0;
            
            if (valA < valB) result = -1;
            else if (valA > valB) result = 1;
            else result = 0;
        } 
        else {
            // Fallback to savedDate
            const dateA = parseDate(a.savedDate);
            const dateB = parseDate(b.savedDate);
            valA = dateA.getTime();
            valB = dateB.getTime();
            if (valA < valB) result = -1;
            else if (valA > valB) result = 1;
            else result = 0;
        }
        
        // Apply Direction
        return sortOrder === 'asc' ? result : -result;
    });
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(0); // Returns Jan 1, 1970 for empty dates
    
    // Handle YYYY-MM-DD (from <input type="date">)
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        // Ensure we treat it as local time, not UTC, to avoid timezone shifts
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    
    // Handle MM/DD/YYYY (legacy format)
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
        }
    }
    
    // Fallback: Try native parsing (less reliable but safe fallback)
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
}

// --- NEW: POPULATE FILTER DROPDOWNS ---
function populateFilterDropdowns() {
    const fields = [
        { key: 'brand', id: 'filterBrand' },
        { key: 'battery', id: 'filterBattery' },
        { key: 'moduleNumber', id: 'filterModule' },
        { key: 'caseMaterial', id: 'filterMaterial' },
        { key: 'movement', id: 'filterMovement' },
        { key: 'location', id: 'filterLocation' }
    ];

    fields.forEach(field => {
        const select = document.getElementById(field.id);
        if (!select) return;
        
        const values = new Set();
        watches.forEach(w => {
            const val = w[field.key];
            if (val && val.trim() !== '') {
                values.add(val.trim());
            }
        });

        const currentVal = select.value;
        select.innerHTML = '<option value="">All</option>';
        Array.from(values).sort().forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            select.appendChild(opt);
        });

        if (Array.from(values).includes(currentVal)) {
            select.value = currentVal;
        } else {
            select.value = '';
            activeFilters[field.key === 'moduleNumber' ? 'module' : field.key] = '';
        }
    });
}

// --- NEW: APPLY FILTERS ---
function applyFilters() {
    let filtered = watches.filter(w => {
        if (activeFilters.brand && w.brand !== activeFilters.brand) return false;
        if (activeFilters.battery && w.battery !== activeFilters.battery) return false;
        if (activeFilters.module && w.moduleNumber !== activeFilters.module) return false;
        if (activeFilters.material && w.caseMaterial !== activeFilters.material) return false;
        if (activeFilters.movement && w.movement !== activeFilters.movement) return false;
        if (activeFilters.location && w.location !== activeFilters.location) return false;
        return true;
    });
    return filtered;
}

// --- MODIFIED: SORT WATCHES (Now accepts a list) ---
function sortWatches(listToSort) {
    const list = [...listToSort];
    list.sort((a, b) => {
        let valA, valB;
        let result = 0;
        
        if (sortField === 'brandModel') {
            const brandA = (a.brand || '').toLowerCase();
            const brandB = (b.brand || '').toLowerCase();
            if (brandA < brandB) result = -1;
            else if (brandA > brandB) result = 1;
            else {
                const modelA = (a.modelName || '').toLowerCase();
                const modelB = (b.modelName || '').toLowerCase();
                if (modelA < modelB) result = -1;
                else if (modelA > modelB) result = 1;
                else result = 0;
            }
        } 
        else if (sortField === 'finalPriceHKD') {
            const parsePrice = (p) => {
                if (!p) return 0;
                return parseFloat(p.toString().replace(/[^0-9.-]+/g, "")) || 0;
            };
            valA = parsePrice(a.finalPriceHKD);
            valB = parsePrice(b.finalPriceHKD);
            if (valA < valB) result = -1;
            else if (valA > valB) result = 1;
            else result = 0;
        } 
        else if (sortField === 'purchasedDate') {
            const dateA = parseDate(a.purchasedDate);
            const dateB = parseDate(b.purchasedDate);
            valA = dateA.getTime(); 
            valB = dateB.getTime();
            if (valA < valB) result = -1;
            else if (valA > valB) result = 1;
            else result = 0;
        } 
        else if (sortField === 'year') {
            valA = parseInt(a.year) || 0;
            valB = parseInt(b.year) || 0;
            if (valA < valB) result = -1;
            else if (valA > valB) result = 1;
            else result = 0;
        } 
        else {
            const dateA = parseDate(a.savedDate);
            const dateB = parseDate(b.savedDate);
            valA = dateA.getTime();
            valB = dateB.getTime();
            if (valA < valB) result = -1;
            else if (valA > valB) result = 1;
            else result = 0;
        }
        return sortOrder === 'asc' ? result : -result;
    });
    return list;
}

// DOM Elements
const watchGrid = document.getElementById('watchGrid');
const emptyState = document.getElementById('emptyState');
const statsBar = document.getElementById('statsBar');
const watchCount = document.getElementById('watchCount');
const filterActiveCount = document.getElementById('filterActiveCount');
const noResultsState = document.getElementById('noResultsState');
const addWatchBtn = document.getElementById('addWatchBtn');
const emptyAddBtn = document.getElementById('emptyAddBtn');
const watchModal = document.getElementById('watchModal');
const detailModal = document.getElementById('detailModal');
const watchForm = document.getElementById('watchForm');
const imagePreview = document.getElementById('imagePreview');
const imagesInput = document.getElementById('images');
const sortFieldSelect = document.getElementById('sortField');
const sortOrderBtn = document.getElementById('sortOrderBtn');
const filterModal = document.getElementById('filterModal');

// Initialize App
async function init() {
    try {
        await initDB();
        await loadWatches();
        
        // ✅ FIX: Migration code MOVED INSIDE init()
        const conditionMap = {
            'New': 'Brand New',
            'Like New': 'NOS',
            'Excellent': 'Used-Excellent',
            'Very Good': 'Used-Very Good',
            'Good': 'Used-Good',
            'Pre-owned': 'Used-Fair' 
        };
        
        let needsUpdate = false;
        for (let watch of watches) {
            if (conditionMap[watch.condition]) {
                watch.condition = conditionMap[watch.condition];
                needsUpdate = true;
            }
        }
        
        if (needsUpdate) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            for (let watch of watches) {
                store.put(watch);
            }
            console.log('Condition values migrated');
            // Reload to ensure UI has updated data
            await loadWatches(); 
        }
        // ---------------------------------------------

        refreshView(); 
        setupEventListeners();

        const sortSelect = document.getElementById('sortField');
        if (sortSelect) {
            sortSelect.value = sortField; 
        }
        
        console.log('App initialized successfully'); // Debug log
    } catch (error) {
        console.error('Init error:', error);
        alert('Error starting app: ' + error.message);
    }
}

// NEW: Unified Refresh Function
function refreshView() {
    populateFilterDropdowns();
    const filteredList = applyFilters();
    sortedWatches = sortWatches(filteredList);
    render();
    updateFilterUI();
}

// NEW: Update Filter UI State
function updateFilterUI() {
    const hasFilters = Object.values(activeFilters).some(v => v !== '');
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) clearBtn.style.display = hasFilters ? 'block' : 'none';
}

// MODIFIED: Render Function
function render() {
    if (sortedWatches.length === 0) {
        watchGrid.style.display = 'none';
        statsBar.style.display = 'none';
        
        if (watches.length === 0) {
            emptyState.style.display = 'block';
            noResultsState.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            noResultsState.style.display = 'block';
        }
    } else {
        watchGrid.style.display = 'grid';
        emptyState.style.display = 'none';
        noResultsState.style.display = 'none';
        statsBar.style.display = 'block';
        
        const total = watches.length;
        const shown = sortedWatches.length;
        watchCount.textContent = shown + ' watch' + (shown !== 1 ? 'es' : '');
        
        if (shown < total) {
            filterActiveCount.style.display = 'inline';
            filterActiveCount.textContent = `(of ${total})`;
        } else {
            filterActiveCount.style.display = 'none';
        }
    }

    watchGrid.innerHTML = sortedWatches.map(watch => {
        const imgUrl = watch.images && watch.images.length > 0 ? watch.images[0] : 'https://placehold.co/400x300?text=No+Image';
        const brand = watch.brand || 'Unknown';
        const model = watch.modelName || 'Unknown';
        return `
            <div class="card" data-id="${watch.id}">
                <img src="${imgUrl}" alt="${brand} ${model}">
                <div class="card-info">
                    <div class="card-brand">${brand}</div>
                    <div class="card-model">${model}</div>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.getAttribute('data-id'));
            openDetail(id);
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    addWatchBtn.addEventListener('click', () => openAddModal());
    emptyAddBtn.addEventListener('click', () => openAddModal());
    document.getElementById('closeModal').addEventListener('click', closeAddModal);
    document.getElementById('cancelBtn').addEventListener('click', closeAddModal);
    document.getElementById('closeDetail').addEventListener('click', closeDetailModal);
    document.getElementById('editWatchBtn').addEventListener('click', editCurrentWatch);
    document.getElementById('deleteWatchBtn').addEventListener('click', deleteCurrentWatch);
    document.getElementById('galleryPrev').addEventListener('click', prevImage);
    document.getElementById('galleryNext').addEventListener('click', nextImage);

    watchForm.addEventListener('submit', handleFormSubmit);

    sortFieldSelect.addEventListener('change', function() {
        sortField = this.value;
        refreshView();
    });

    sortOrderBtn.addEventListener('click', function() {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        this.textContent = sortOrder === 'asc' ? '↑' : '↓';
        refreshView();
    });

    // NEW: Filter Modal Events
    const openFilterBtn = document.getElementById('openFilterBtn');
    const closeFilterBtn = document.getElementById('closeFilterBtn');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    const clearFiltersFromEmpty = document.getElementById('clearFiltersFromEmpty');

    // ✅ FIX: Only run this if filterModal actually exists in HTML
    if (filterModal) { 
        if (clearFiltersFromEmpty) clearFiltersFromEmpty.addEventListener('click', resetFilters);

        if (openFilterBtn) {
            openFilterBtn.addEventListener('click', () => {
                document.getElementById('filterBrand').value = activeFilters.brand || '';
                document.getElementById('filterBattery').value = activeFilters.battery || '';
                document.getElementById('filterModule').value = activeFilters.module || '';
                document.getElementById('filterMaterial').value = activeFilters.material || '';
                document.getElementById('filterMovement').value = activeFilters.movement || '';
                document.getElementById('filterLocation').value = activeFilters.location || '';
                filterModal.classList.add('active');
            });
        }
        if (closeFilterBtn) {
            closeFilterBtn.addEventListener('click', () => filterModal.classList.remove('active'));
        }
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                activeFilters.brand = document.getElementById('filterBrand').value;
                activeFilters.battery = document.getElementById('filterBattery').value;
                activeFilters.module = document.getElementById('filterModule').value;
                activeFilters.material = document.getElementById('filterMaterial').value;
                activeFilters.movement = document.getElementById('filterMovement').value;
                activeFilters.location = document.getElementById('filterLocation').value;
                filterModal.classList.remove('active');
                refreshView();
            });
        }
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', resetFilters);
        }
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', resetFilters);
        }
        
        filterModal.addEventListener('click', (e) => {
            if (e.target === filterModal) filterModal.classList.remove('active');
        });
    }

    // Helper function (keep this outside or inside, but ensure it checks filterModal too)
    function resetFilters() {
        activeFilters = { brand: '', battery: '', module: '', material: '', movement: '', location: '' };
        if (filterModal) filterModal.classList.remove('active');
        refreshView();
    }
    if (closeFilterBtn) {
        closeFilterBtn.addEventListener('click', () => filterModal.classList.remove('active'));
    }
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            activeFilters.brand = document.getElementById('filterBrand').value;
            activeFilters.battery = document.getElementById('filterBattery').value;
            activeFilters.module = document.getElementById('filterModule').value;
            activeFilters.material = document.getElementById('filterMaterial').value;
            activeFilters.movement = document.getElementById('filterMovement').value;
            activeFilters.location = document.getElementById('filterLocation').value;
            filterModal.classList.remove('active');
            refreshView();
        });
    }
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetFilters);
    }
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', resetFilters);
    }
    if (filterModal) {
        filterModal.addEventListener('click', (e) => {
            if (e.target === filterModal) filterModal.classList.remove('active');
        });
    }

    // NEW: Reset Filters Function (Add this helper function inside setupEventListeners or globally)
    function resetFilters() {
        activeFilters = { brand: '', battery: '', module: '', material: '', movement: '', location: '' };
        filterModal.classList.remove('active');
        refreshView();
    }

    // Brand other input toggle
    document.getElementById('brand').addEventListener('change', function() {
        const otherInput = document.getElementById('brandOther');
        if (this.value === 'Others (Specify)') {
            otherInput.classList.remove('hidden');
            otherInput.required = true;
        } else {
            otherInput.classList.add('hidden');
            otherInput.required = false;
            otherInput.value = '';
        }
    });

    // ✅ FIX: Ensure listener is only attached once
    const imagesInput = document.getElementById('images');
    if (imagesInput) {
        // Remove any existing listener first to prevent duplicates
        imagesInput.replaceWith(imagesInput.cloneNode(true));
        const newInput = document.getElementById('images');
        newInput.addEventListener('change', handleImageSelect);
    }
    
    // Currency other input toggle
    document.getElementById('currency').addEventListener('change', function() {
        document.getElementById('currencyOther').classList.toggle('hidden', this.value !== 'other');
        calculateFinalPrice(); // Trigger calculation on currency change
    });

    // Trigger calculation on price input
    document.getElementById('price').addEventListener('input', calculateFinalPrice);

    // Case Material other input toggle
    // Case Material other input toggle
    document.getElementById('caseMaterial').addEventListener('change', function() {
        const otherInput = document.getElementById('caseMaterialOther');
        if (this.value === 'Other (Specify)') {
            otherInput.classList.remove('hidden');
            otherInput.required = true;
        } else {
            otherInput.classList.add('hidden');
            otherInput.required = false;
            otherInput.value = '';
        }
    });

    // Battery other input toggle
    document.getElementById('battery').addEventListener('change', function() {
        document.getElementById('batteryOther').classList.toggle('hidden', this.value !== 'Other');
    });

    // Movement other input toggle
    document.getElementById('movement').addEventListener('change', function() {
        const otherInput = document.getElementById('movementOther');
        if (this.value === 'Others (Specify)') {
            otherInput.classList.remove('hidden');
            otherInput.required = true;
        } else {
            otherInput.classList.add('hidden');
            otherInput.required = false;
            otherInput.value = '';
        }
    });

    // Close modal on outside click
    watchModal.addEventListener('click', (e) => {
        if (e.target === watchModal) closeAddModal();
    });
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) closeDetailModal();
    });
    // Sync modal
    const syncMenuBtn = document.getElementById('syncMenuBtn');
    const syncModal = document.getElementById('syncModal');
    const closeSyncModal = document.getElementById('closeSyncModal');
    const exportPWADataBtn = document.getElementById('exportPWADataBtn');
    const importPWAFile = document.getElementById('importPWAFile');
    
    if (syncMenuBtn) {
        syncMenuBtn.addEventListener('click', () => syncModal.classList.add('active'));
    }
    if (closeSyncModal) {
        closeSyncModal.addEventListener('click', () => syncModal.classList.remove('active'));
    }
    if (exportPWADataBtn) {
        exportPWADataBtn.addEventListener('click', exportPWAData);
    }
    if (importPWAFile) {
        importPWAFile.addEventListener('change', (e) => importPWAData(e.target.files[0]));
    }
    
    // Close sync modal on outside click
    if (syncModal) {
        syncModal.addEventListener('click', (e) => {
            if (e.target === syncModal) syncModal.classList.remove('active');
        });
    }
}

// Image handling
let selectedImages = [];

// ✅ FIXED: Single, clean function
async function handleImageSelect(e) {
    const files = e.target.files;
    
    console.log('📸 FILE SELECTED! Files found:', files ? files.length : 0);

    if (!files || files.length === 0) {
        // This log will now only appear if you genuinely cancel the file picker
        console.log('⚠️ No files in event (User cancelled or input empty).');
        return;
    }

    // Process files
    console.log(`✅ Processing ${files.length} new file(s)...`);

    for (let i = 0; i < files.length; i++) {
        try {
            const base64 = await fileToBase64(files[i]);
            selectedImages.push(base64);
            console.log(`➕ Added image. Total: ${selectedImages.length}`);
        } catch (err) {
            console.error('❌ Error converting file:', err);
        }
    }
    
    // Render Preview
    renderImagePreview();
    console.log('🎨 Preview rendered.');

    // ✅ Reset input value so the same file can be selected again if deleted and re-added
    e.target.value = ''; 
}

// ✅ NEW: Helper to render the preview with delete/reorder buttons
function renderImagePreview() {
    if (!imagePreview) return;
    
    imagePreview.innerHTML = '';
    
    if (selectedImages.length === 0) {
        return; 
    }

    selectedImages.forEach((imgSrc, index) => {
        // 1. Create Container
        const container = document.createElement('div');
        container.style.position = 'relative';
        container.style.display = 'inline-block'; // Ensure it sits correctly
        container.style.marginRight = '10px';
        container.style.marginBottom = '10px';
        container.style.cursor = 'grab';
        container.dataset.index = index;

        // 2. Create Image
        const img = document.createElement('img');
        img.src = imgSrc;
        img.style.width = '60px';
        img.style.height = '60px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '5px';
        img.style.border = '2px solid #C1A981';
        img.style.pointerEvents = 'none'; 
        
        // 3. Create Delete Button (Strictly as an Element)
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button'; // Prevent form submission
        deleteBtn.textContent = '×'; // Set text content safely
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.top = '-5px';
        deleteBtn.style.right = '-5px';
        deleteBtn.style.background = '#F21E4A';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.borderRadius = '50%';
        deleteBtn.style.width = '20px';
        deleteBtn.style.height = '20px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '14px';
        deleteBtn.style.lineHeight = '1';
        deleteBtn.style.display = 'flex';
        deleteBtn.style.alignItems = 'center';
        deleteBtn.style.justifyContent = 'center';
        deleteBtn.style.padding = '0';
        
        // Attach Click Event
        deleteBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedImages.splice(index, 1);
            renderImagePreview();
        };

        // 4. Append Elements (CRITICAL STEP)
        container.appendChild(img);
        container.appendChild(deleteBtn); // This must be appendChild, NOT innerHTML

        // 5. Add Drag Events
        container.draggable = true;
        container.addEventListener('dragstart', handleDragStart);
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
        container.addEventListener('dragend', handleDragEnd);

        // 6. Add to DOM
        imagePreview.appendChild(container);
    });
}

// ✅ NEW: Drag and Drop Logic Variables
let dragSrcIndex = null;

function handleDragStart(e) {
    dragSrcIndex = this.dataset.index;
    this.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    const dragTargetIndex = this.dataset.index;
    if (dragSrcIndex !== dragTargetIndex) {
        const temp = selectedImages[dragSrcIndex];
        selectedImages[dragSrcIndex] = selectedImages[dragTargetIndex];
        selectedImages[dragTargetIndex] = temp;
        renderImagePreview();
    }
    return false;
}

function handleDragEnd() {
    this.style.opacity = '1';
    const items = document.querySelectorAll('#imagePreview div');
    items.forEach(item => item.style.opacity = '1');
}
// Open Add Modal
function openAddModal() {
    editingWatchId = null;
    document.getElementById('modalTitle').textContent = 'Add Watch';
    watchForm.reset();
    
    // ✅ Explicitly clear state for new watch
    selectedImages = [];
    if (imagePreview) imagePreview.innerHTML = '';
    
    // ✅ Reset file input specifically
    const imagesInput = document.getElementById('images');
    if (imagesInput) imagesInput.value = '';
    
    watchModal.classList.add('active');
}

// Close Add Modal
function closeAddModal() {
    watchModal.classList.remove('active');
    watchForm.reset();
    selectedImages = [];
    imagePreview.innerHTML = '';
    editingWatchId = null;
}

// Handle form submit
async function handleFormSubmit(e) {
    e.preventDefault();

    let brandValue = document.getElementById('brand').value;
    if (brandValue === 'Others (Specify)') {
        brandValue = document.getElementById('brandOther').value;
    }

    let currencyValue = document.getElementById('currency').value;
    if (currencyValue === 'other') {
        currencyValue = document.getElementById('currencyOther').value;
    }

    let caseMaterialValue = document.getElementById('caseMaterial').value;
    // Check for the exact string "Other (Specify)"
    if (caseMaterialValue === 'Other (Specify)') {
        caseMaterialValue = document.getElementById('caseMaterialOther').value;
    }

    let batteryValue = document.getElementById('battery').value;
    if (batteryValue === 'Other') {
        batteryValue = document.getElementById('batteryOther').value;
    }

    // Add Movement Logic
    let movementValue = document.getElementById('movement').value;
    if (movementValue === 'Others (Specify)') {
        movementValue = document.getElementById('movementOther').value;
    }
    
    const watch = {
        brand: brandValue,
        modelName: document.getElementById('modelName').value,
        moduleNumber: document.getElementById('moduleNumber').value,
        price: document.getElementById('price').value,
        currency: currencyValue,
        finalPriceHKD: document.getElementById('finalPriceHKD').value,
        caseSize: document.getElementById('caseSize').value,
        year: document.getElementById('year').value,
        caseMaterial: caseMaterialValue,
        movement: movementValue, // Use the variable instead of direct access
        condition: document.getElementById('condition').value,
        boxPapers: document.getElementById('boxPapers').value,
        battery: batteryValue,
        seller: document.getElementById('seller').value,
        location: document.getElementById('location').value,
        url: document.getElementById('url').value,
        description: document.getElementById('description').value,
        purchasedDate: document.getElementById('purchasedDate').value,
        images: selectedImages
    };

    if (editingWatchId) {
        watch.id = editingWatchId;
        // ✅ Always use the current state of selectedImages (which now holds old + new)
        // No need to check length === 0 anymore because we loaded them in editCurrentWatch
        if (!watch.images || watch.images.length === 0) {
             const existing = watches.find(w => w.id === editingWatchId);
             if (existing) watch.images = existing.images;
        }
    }

    try {
        await saveWatch(watch);
        await loadWatches();
        refreshView();
        closeAddModal();
    } catch (error) {
        console.error('Save error:', error);
        alert('Error saving watch');
    }
}

// Open Detail Modal
async function openDetail(id) {
    currentWatchId = id;
    const watch = await getWatch(id);
    
    if (!watch) return;

    document.getElementById('detailTitle').textContent = (watch.brand || '') + ' ' + (watch.modelName || '');

    currentImages = watch.images || [];
    currentImageIndex = 0;

    const gallery = document.getElementById('detailGallery');
    if (currentImages.length > 0) {
        gallery.style.display = 'block';
        updateGallery();
    } else {
        gallery.style.display = 'none';
    }

    const fields = [
        { label: 'Brand', value: watch.brand },
        { label: 'Model', value: watch.modelName },
        { label: 'Module', value: watch.moduleNumber },
        { label: 'Price', value: (watch.currency || '') + ' ' + (watch.price || '') },
        { label: 'Final Price (HKD)', value: watch.finalPriceHKD ? `HK$ ${watch.finalPriceHKD}` : '-' }, // Added
        { label: 'Case Size', value: watch.caseSize },
        { label: 'Material', value: watch.caseMaterial },
        { label: 'Movement', value: watch.movement },
        { label: 'Condition', value: watch.condition },
        { label: 'Release Year', value: watch.year },
        { label: 'Box & Papers', value: watch.boxPapers },
        { label: 'Battery', value: watch.battery },
        { label: 'Seller', value: watch.seller },
        { label: 'Location', value: watch.location },
        { label: 'URL', value: watch.url, full: true },
        { label: 'Description', value: watch.description, full: true, long: true },
        { label: 'Purchased', value: watch.purchasedDate },
        { label: 'Saved Date', value: watch.savedDate }
    ];

    const grid = document.getElementById('detailGrid');
    grid.innerHTML = fields.map(f => {
        if (!f.value) return '';
        const fullClass = f.full ? ' detail-full' : '';
        const longClass = f.long ? ' long' : '';
        return `
            <div class="detail-row${fullClass}">
                <div class="detail-label">${f.label}</div>
                <div class="detail-value${longClass}">${f.value}</div>
            </div>
        `;
    }).join('');

    detailModal.classList.add('active');
}

// Close Detail Modal
function closeDetailModal() {
    detailModal.classList.remove('active');
    currentWatchId = null;
}

// Update gallery
function updateGallery() {
    if (currentImages.length === 0) return;

    document.getElementById('galleryMain').src = currentImages[currentImageIndex];
    document.getElementById('imageCount').textContent = 
        'Image ' + (currentImageIndex + 1) + ' of ' + currentImages.length;

    const thumbs = document.getElementById('galleryThumbnails');
    thumbs.innerHTML = currentImages.map((img, i) => 
        '<img src="' + img + '" class="' + (i === currentImageIndex ? 'active' : '') + '" data-index="' + i + '">'
    ).join('');

    thumbs.querySelectorAll('img').forEach(thumb => {
        thumb.addEventListener('click', () => {
            currentImageIndex = parseInt(thumb.getAttribute('data-index'));
            updateGallery();
        });
    });

    const showNav = currentImages.length > 1;
    document.getElementById('galleryPrev').style.display = showNav ? 'block' : 'none';
    document.getElementById('galleryNext').style.display = showNav ? 'block' : 'none';
}

function prevImage() {
    if (currentImages.length > 1) {
        currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
        updateGallery();
    }
}

function nextImage() {
    if (currentImages.length > 1) {
        currentImageIndex = (currentImageIndex + 1) % currentImages.length;
        updateGallery();
    }
}

// Edit current watch
function editCurrentWatch() {
    if (!currentWatchId) return;
    
    const watch = watches.find(w => w.id === currentWatchId);
    if (!watch) return;

    editingWatchId = currentWatchId;
    closeDetailModal();

    document.getElementById('modalTitle').textContent = 'Edit Watch';
    
    // Set brand
    const brandSelect = document.getElementById('brand');
    const brandOtherInput = document.getElementById('brandOther');
    const knownBrands = ['G-Shock', 'Casio', 'Seiko', 'Alba', 'Citizen', 'Armitron', 'Others (Specify)'];
    
    if (knownBrands.includes(watch.brand)) {
        // If it's a known brand (including the literal string "Others (Specify)")
        brandSelect.value = watch.brand;
        if (watch.brand === 'Others (Specify)') {
            // Edge case: if they literally saved it as "Others (Specify)" without custom text
            brandOtherInput.classList.remove('hidden');
            brandOtherInput.required = true;
        } else {
            brandOtherInput.classList.add('hidden');
            brandOtherInput.required = false;
            brandOtherInput.value = '';
        }
    } else {
        // It's a custom brand not in the list
        brandSelect.value = 'Others (Specify)';
        brandOtherInput.value = watch.brand || '';
        brandOtherInput.classList.remove('hidden');
        brandOtherInput.required = true;
    }

    document.getElementById('modelName').value = watch.modelName || '';
    document.getElementById('moduleNumber').value = watch.moduleNumber || '';
    document.getElementById('price').value = watch.price || '';
    document.getElementById('finalPriceHKD').value = watch.finalPriceHKD || '';
    
    // Set currency
    const currencySelect = document.getElementById('currency');
    const knownCurrencies = ['HKD', 'USD', 'EUR', 'GBP', 'JPY'];
    if (knownCurrencies.includes(watch.currency)) {
        currencySelect.value = watch.currency;
        document.getElementById('currencyOther').classList.add('hidden');
    } else {
        currencySelect.value = 'other';
        document.getElementById('currencyOther').classList.remove('hidden');
        document.getElementById('currencyOther').value = watch.currency || '';
    }

    document.getElementById('caseSize').value = watch.caseSize || '';
    document.getElementById('year').value = watch.year || '';

    // Set case material
    const materialSelect = document.getElementById('caseMaterial');
    // Updated list to match new options
    const knownMaterials = ['Resin', 'Stainless Steel', 'Silver Plated', 'Gold Plated', 'Plastic', 'Carbon Fiber', 'Other (Specify)'];
    
    if (knownMaterials.includes(watch.caseMaterial)) {
        materialSelect.value = watch.caseMaterial;
        // If explicitly "Other (Specify)", show the input
        if (watch.caseMaterial === 'Other (Specify)') {
             document.getElementById('caseMaterialOther').classList.remove('hidden');
             document.getElementById('caseMaterialOther').required = true;
        } else {
             document.getElementById('caseMaterialOther').classList.add('hidden');
             document.getElementById('caseMaterialOther').required = false;
             document.getElementById('caseMaterialOther').value = '';
        }
    } else {
        // Custom value not in list -> Select "Other (Specify)" and fill input
        materialSelect.value = 'Other (Specify)';
        document.getElementById('caseMaterialOther').classList.remove('hidden');
        document.getElementById('caseMaterialOther').value = watch.caseMaterial || '';
        document.getElementById('caseMaterialOther').required = true;
    }

    // Handle Movement Logic
    const movementSelect = document.getElementById('movement');
    const movementOtherInput = document.getElementById('movementOther');
    const standardMovements = ['Quartz', 'Solar', 'Kinetic', 'Others (Specify)', ''];
    
    if (watch.movement && !standardMovements.includes(watch.movement)) {
        // It's a custom value
        movementSelect.value = 'Others (Specify)';
        movementOtherInput.value = watch.movement;
        movementOtherInput.classList.remove('hidden');
        movementOtherInput.required = true;
    } else {
        // It's a standard value
        movementSelect.value = watch.movement || '';
        movementOtherInput.classList.add('hidden');
        movementOtherInput.value = '';
        movementOtherInput.required = false;
        
        // Edge case: if saved literally as "Others (Specify)" without text
        if (watch.movement === 'Others (Specify)') {
            movementOtherInput.classList.remove('hidden');
            movementOtherInput.required = true;
        }
    }
    document.getElementById('condition').value = watch.condition || '';
    document.getElementById('boxPapers').value = watch.boxPapers || '';

    // Set battery
    const batterySelect = document.getElementById('battery');
    const knownBatteries = ['CR1616', 'CR1620', 'CR2016', 'CR2025', 'CR2032', 'CR2430', 'CR2450', 'CTL1616F', 'SR621SW', 'SR626SW', 'SR920SW', 'SR927W', 'SR936SW', 'Unknown'];
    if (knownBatteries.includes(watch.battery)) {
        batterySelect.value = watch.battery;
        document.getElementById('batteryOther').classList.add('hidden');
    } else {
        batterySelect.value = 'Other';
        document.getElementById('batteryOther').classList.remove('hidden');
        document.getElementById('batteryOther').value = watch.battery || '';
    }

    document.getElementById('seller').value = watch.seller || '';
    document.getElementById('location').value = watch.location || '';
    document.getElementById('url').value = watch.url || '';
    document.getElementById('description').value = watch.description || '';
    document.getElementById('purchasedDate').value = watch.purchasedDate || '';

    // ✅ CRITICAL: Load existing images from the database object
    selectedImages = watch.images || [];
    
    console.log('Edit Mode: Loaded', selectedImages.length, 'existing images.');

    // ✅ Render them immediately
    renderImagePreview();
    
    // Reset file input
    const imagesInput = document.getElementById('images');
    if (imagesInput) imagesInput.value = '';
    
    watchModal.classList.add('active');
}

// Delete current watch
async function deleteCurrentWatch() {
    if (!currentWatchId) return;
    
    if (confirm('Delete this watch?')) {
        try {
            await deleteWatch(currentWatchId);
            await loadWatches();
            refreshView();
            closeDetailModal();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Error deleting watch');
        }
    }
}

// EXPORT DATA
async function exportPWAData() {
    if (watches.length === 0) {
        alert('No watches to export!');
        return;
    }
    
    const exportData = {
        version: '2026.7.17.1',
        exportDate: new Date().toISOString(),
        platform: 'PWA-iOS',
        watches: watches
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `watch-backup-pwa-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    alert(`Exported ${watches.length} watches!`);
}

// IMPORT DATA
async function importPWAData(file) {
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            if (!importData.watches || !Array.isArray(importData.watches)) {
                throw new Error('Invalid file format');
            }
            
            const importedWatches = importData.watches;
            let added = 0;
            let skipped = 0;
            
            for (const watch of importedWatches) {
                // Check for duplicates by moduleNumber
                const exists = watches.some(w => w.moduleNumber === watch.moduleNumber);
                
                if (!exists) {
                    await saveWatch(watch);
                    added++;
                } else {
                    skipped++;
                }
            }
            
            await loadWatches();
            refreshView();
            
            alert(`Imported ${added} new watches! (Skipped ${skipped} duplicates)`);
        } catch (error) {
            alert('Import failed: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Start the app
init();
