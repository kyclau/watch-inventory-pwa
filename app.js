console.log('KL\'s Watch Cabinet PWA loaded');

let watches = [];
let sortedWatches = [];
let currentImageIndex = 0;
let currentImages = [];
let editingWatchId = null;
let currentWatchId = null;
let sortField = 'savedDate';
let sortOrder = 'asc';

const DB_NAME = 'KLWatchCabinetDB';
const DB_VERSION = 1;
const STORE_NAME = 'watches';

let db = null;

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

        await loadWatches();
        
        // --- MIGRATION: Update old Condition values ---
        const conditionMap = {
            'New': 'Brand New',
            'Like New': 'NOS',
            'Excellent': 'Used-Excellent',
            'Very Good': 'Used-Very Good',
            'Good': 'Used-Good',
            'Pre-owned': 'Used-Fair' 
            // Note: You may want to manually review 'Pre-owned' items, mapped to Fair here as default
        };
        
        let needsUpdate = false;
        for (let watch of watches) {
            if (conditionMap[watch.condition]) {
                watch.condition = conditionMap[watch.condition];
                needsUpdate = true;
            }
        }
        
        if (needsUpdate) {
            // Save all updated watches back to DB
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            for (let watch of watches) {
                store.put(watch);
            }
            console.log('Condition values migrated');
        }
        // ---------------------------------------------

        sortWatches();

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
        
        if (sortField === 'brand') {
            valA = (a.brand || '').toLowerCase();
            valB = (b.brand || '').toLowerCase();
        } else if (sortField === 'year') {
            valA = parseInt(a.year) || 0;
            valB = parseInt(b.year) || 0;
        } else {
            valA = parseDate(a.savedDate);
            valB = parseDate(b.savedDate);
        }
        
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[0] - 1, parts[1]);
    }
    return new Date(0);
}

// DOM Elements
const watchGrid = document.getElementById('watchGrid');
const emptyState = document.getElementById('emptyState');
const statsBar = document.getElementById('statsBar');
const watchCount = document.getElementById('watchCount');
const addWatchBtn = document.getElementById('addWatchBtn');
const emptyAddBtn = document.getElementById('emptyAddBtn');
const watchModal = document.getElementById('watchModal');
const detailModal = document.getElementById('detailModal');
const watchForm = document.getElementById('watchForm');
const imagePreview = document.getElementById('imagePreview');
const imagesInput = document.getElementById('images');
const sortFieldSelect = document.getElementById('sortField');
const sortOrderBtn = document.getElementById('sortOrderBtn');

// Initialize App
async function init() {
    try {
        await initDB();
        await loadWatches();
        sortWatches();
        render();
        setupEventListeners();
    } catch (error) {
        console.error('Init error:', error);
    }
}

// Render watch grid
function render() {
    if (sortedWatches.length === 0) {
        watchGrid.style.display = 'none';
        emptyState.style.display = 'block';
        statsBar.style.display = 'none';
    } else {
        watchGrid.style.display = 'grid';
        emptyState.style.display = 'none';
        statsBar.style.display = 'block';
        watchCount.textContent = sortedWatches.length + ' watch' + (sortedWatches.length !== 1 ? 'es' : '');
    }

    watchGrid.innerHTML = sortedWatches.map(watch => {
        const imgUrl = watch.images && watch.images.length > 0 
            ? watch.images[0] 
            : 'https://placehold.co/400x300?text=No+Image';
        const brand = watch.brand || 'Unknown';
        const model = watch.modelName || 'Unknown';
        // Price variable removed as it is no longer displayed
        
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
    imagesInput.addEventListener('change', handleImageSelect);

    sortFieldSelect.addEventListener('change', function() {
        sortField = this.value;
        sortWatches();
        render();
    });

    sortOrderBtn.addEventListener('click', function() {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        this.textContent = sortOrder === 'asc' ? 'Ascending ↑' : 'Descending ↓';
        sortWatches();
        render();
    });

    // Brand other input toggle
    document.getElementById('brand').addEventListener('change', function() {
        document.getElementById('brandOther').classList.toggle('hidden', this.value !== 'other');
    });

    // Currency other input toggle
    document.getElementById('currency').addEventListener('change', function() {
        document.getElementById('currencyOther').classList.toggle('hidden', this.value !== 'other');
    });

    // Case Material other input toggle
    document.getElementById('caseMaterial').addEventListener('change', function() {
        document.getElementById('caseMaterialOther').classList.toggle('hidden', this.value !== 'other');
    });

    // Battery other input toggle
    document.getElementById('battery').addEventListener('change', function() {
        document.getElementById('batteryOther').classList.toggle('hidden', this.value !== 'Other');
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

async function handleImageSelect(e) {
    const files = e.target.files;
    selectedImages = [];
    imagePreview.innerHTML = '';

    for (let i = 0; i < files.length; i++) {
        const base64 = await fileToBase64(files[i]);
        selectedImages.push(base64);
        
        const img = document.createElement('img');
        img.src = base64;
        imagePreview.appendChild(img);
    }
}

// Open Add Modal
function openAddModal() {
    editingWatchId = null;
    document.getElementById('modalTitle').textContent = 'Add Watch';
    watchForm.reset();
    selectedImages = [];
    imagePreview.innerHTML = '';
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
    if (brandValue === 'other') {
        brandValue = document.getElementById('brandOther').value;
    }

    let currencyValue = document.getElementById('currency').value;
    if (currencyValue === 'other') {
        currencyValue = document.getElementById('currencyOther').value;
    }

    let caseMaterialValue = document.getElementById('caseMaterial').value;
    if (caseMaterialValue === 'other') {
        caseMaterialValue = document.getElementById('caseMaterialOther').value;
    }

    let batteryValue = document.getElementById('battery').value;
    if (batteryValue === 'Other') {
        batteryValue = document.getElementById('batteryOther').value;
    }

    const watch = {
        brand: brandValue,
        modelName: document.getElementById('modelName').value,
        moduleNumber: document.getElementById('moduleNumber').value,
        price: document.getElementById('price').value,
        currency: currencyValue,
        caseSize: document.getElementById('caseSize').value,
        year: document.getElementById('year').value,
        caseMaterial: caseMaterialValue,
        movement: document.getElementById('movement').value,
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
        const existing = watches.find(w => w.id === editingWatchId);
        if (existing && existing.images && selectedImages.length === 0) {
            watch.images = existing.images;
        }
    }

    try {
        await saveWatch(watch);
        await loadWatches();
        sortWatches();
        render();
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
        { label: 'Case Size', value: watch.caseSize },
        { label: 'Material', value: watch.caseMaterial },
        { label: 'Movement', value: watch.movement },
        { label: 'Condition', value: watch.condition },
        { label: 'Year', value: watch.year },
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
    const knownBrands = ['G-Shock', 'Casio', 'Seiko', 'Alba', 'Citizen', 'Armitron'];
    if (knownBrands.includes(watch.brand)) {
        brandSelect.value = watch.brand;
        document.getElementById('brandOther').classList.add('hidden');
    } else {
        brandSelect.value = 'other';
        document.getElementById('brandOther').classList.remove('hidden');
        document.getElementById('brandOther').value = watch.brand || '';
    }

    document.getElementById('modelName').value = watch.modelName || '';
    document.getElementById('moduleNumber').value = watch.moduleNumber || '';
    document.getElementById('price').value = watch.price || '';
    
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
    const knownMaterials = ['Resin', 'Stainless Steel', 'Titanium', 'Gold', 'Platinum', 'Bronze', 'Ceramic', 'Carbon Fiber'];
    if (knownMaterials.includes(watch.caseMaterial)) {
        materialSelect.value = watch.caseMaterial;
        document.getElementById('caseMaterialOther').classList.add('hidden');
    } else {
        materialSelect.value = 'other';
        document.getElementById('caseMaterialOther').classList.remove('hidden');
        document.getElementById('caseMaterialOther').value = watch.caseMaterial || '';
    }

    document.getElementById('movement').value = watch.movement || '';
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

    selectedImages = [];
    imagePreview.innerHTML = '';
    watchModal.classList.add('active');
}

// Delete current watch
async function deleteCurrentWatch() {
    if (!currentWatchId) return;
    
    if (confirm('Delete this watch?')) {
        try {
            await deleteWatch(currentWatchId);
            await loadWatches();
            sortWatches();
            render();
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
            sortWatches();
            render();
            
            alert(`Imported ${added} new watches! (Skipped ${skipped} duplicates)`);
        } catch (error) {
            alert('Import failed: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Start the app
init();
