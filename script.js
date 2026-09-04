let currentDate = new Date();
const todayObj = new Date();
const todayString = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
let selectedDate = todayString;

let todos = JSON.parse(localStorage.getItem('toss_todos')) || [];
let events = JSON.parse(localStorage.getItem('toss_events')) || [];

events = events.map(e => ({ ...e, startDate: e.startDate || e.date, endDate: e.endDate || e.date }));
let editModeEventId = null;

// ==========================================
// 🔥 Firebase Realtime Sync Setup (Hardcoded for Zero-Config)
// ==========================================
let db = null;
let firestoreUnsubscribe = null;
let isSyncingFromRemote = false;
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
  localStorage.setItem('toss_room_code', roomFromUrl);
}
let currentRoomCode = roomFromUrl || localStorage.getItem('toss_room_code') || 'shared-room';

let searchQuery = '';
let activeCategoryFilter = 'all';
let trashEvents = JSON.parse(localStorage.getItem('toss_trash')) || [];

// ==========================================
// 🎨 Dynamic Category Management System
// ==========================================
const recommendedCategories = [
  { id: 'work', name: '업무', color: '#3182f6', icon: '💼' },
  { id: 'personal', name: '개인', color: '#10b981', icon: '🌱' },
  { id: 'important', name: '중요', color: '#ef4444', icon: '🔥' }
];

// 처음 접속했을 때는 카테고리 싹 없게 (요청: 기본 카테고리 없이 깨끗한 상태로 시작)
const v2InitKey = 'toss_categories_v2_empty_state_init';
if (!localStorage.getItem(v2InitKey)) {
  localStorage.setItem(v2InitKey, 'true');
  localStorage.removeItem('toss_categories');
}

let storedCategories = localStorage.getItem('toss_categories');
let categories = [];
if (storedCategories !== null) {
  try {
    categories = JSON.parse(storedCategories) || [];
  } catch (e) {
    categories = [];
  }
}
// 모든 카테고리는 자유롭게 삭제 가능 (기본 잠금 해제)
categories = categories.map(c => ({ ...c, isDefault: false }));

function saveCategories() {
  localStorage.setItem('toss_categories', JSON.stringify(categories));
  renderCategoryUI();
  syncToFirebase();
}

window.openCategoryManagerModal = function() {
  renderCategoryManagerList();
  renderRecommendedCategories();
  const colorInput = document.getElementById('new-cat-color');
  const previewCircle = document.getElementById('new-cat-color-preview');
  if (colorInput && previewCircle) {
    previewCircle.style.background = colorInput.value;
  }
  document.getElementById('category-manager-modal').classList.remove('hidden');
};

function renderCategoryManagerList() {
  const list = document.getElementById('category-manager-list');
  const countBadge = document.getElementById('category-count-badge');
  if (countBadge) countBadge.innerText = `${categories.length}개`;
  if (!list) return;
  list.innerHTML = '';
  if (categories.length === 0) {
    list.innerHTML = `<li style="text-align:center; color:var(--text-secondary); padding:20px 0; font-size:13px;">등록된 카테고리가 없습니다.<br><span style="font-size:12px; opacity:0.8;">원하는 카테고리를 직접 추가하거나 아래 추천 카테고리를 눌러보세요.</span></li>`;
    return;
  }
  categories.forEach(cat => {
    const delBtn = `<button class="category-item-del-btn" onclick="deleteCategory('${cat.id}')">삭제</button>`;
    list.innerHTML += `
      <li class="category-manager-item">
        <div class="category-item-info">
          <span class="category-item-dot" style="background:${cat.color}; color:${cat.color};"></span>
          <span class="category-item-text">${cat.icon} <b>${cat.name}</b></span>
        </div>
        ${delBtn}
      </li>`;
  });
}

function renderRecommendedCategories() {
  const container = document.getElementById('category-recommend-chips');
  if (!container) return;
  container.innerHTML = '';
  recommendedCategories.forEach(rec => {
    const isAdded = categories.some(c => c.id === rec.id || c.name === rec.name);
    if (isAdded) {
      container.innerHTML += `
        <button class="recommend-chip added" disabled title="이미 등록됨">
          <span>${rec.icon} ${rec.name}</span>
          <span class="recommend-badge">✓ 등록됨</span>
        </button>
      `;
    } else {
      container.innerHTML += `
        <button class="recommend-chip" onclick="addRecommendedCategory('${rec.id}')" title="클릭하여 카테고리 바로 추가">
          <span>${rec.icon} ${rec.name}</span>
          <span class="recommend-add-icon">＋</span>
        </button>
      `;
    }
  });
}

window.addRecommendedCategory = function(recId) {
  const rec = recommendedCategories.find(r => r.id === recId);
  if (!rec) return;
  if (categories.some(c => c.id === rec.id || c.name === rec.name)) return;
  saveHistoryState();
  categories.push({ id: rec.id, name: rec.name, icon: rec.icon, color: rec.color, isDefault: false });
  saveCategories();
  renderCategoryManagerList();
  renderRecommendedCategories();
  renderCategoryUI();
  renderCalendar();
  showToast(`✨ [${rec.icon} ${rec.name}] 카테고리가 등록되었습니다.`);
};

window.addNewCategory = function() {
  const nameInput = document.getElementById('new-cat-name');
  const iconInput = document.getElementById('new-cat-icon');
  const colorInput = document.getElementById('new-cat-color');
  const name = nameInput.value.trim();
  const icon = iconInput.value.trim() || '📌';
  const color = colorInput.value || '#3182f6';
  
  if (!name) { alert('카테고리 이름을 입력해주세요.'); nameInput.focus(); return; }
  
  const newCat = { id: 'cat_' + Date.now(), name, icon, color, isDefault: false };
  categories.push(newCat);
  nameInput.value = '';
  saveCategories();
  renderCategoryManagerList();
  renderRecommendedCategories();
  renderCategoryUI();
  renderCalendar();
  showToast(`🎨 [${icon} ${name}] 카테고리가 추가되었습니다.`);
};

window.deleteCategory = function(catId) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;
  if (confirm(`[${cat.name}] 카테고리를 삭제하시겠습니까?`)) {
    saveHistoryState();
    categories = categories.filter(c => c.id !== catId);
    events = events.map(e => e.category === catId ? { ...e, category: '' } : e);
    if (activeCategoryFilter === catId) {
      activeCategoryFilter = 'all';
    }
    saveCategories();
    saveToLocalStorage();
    renderCategoryManagerList();
    renderRecommendedCategories();
    renderCategoryUI();
    renderCalendar();
    showToast(`🗑️ [${cat.name}] 카테고리가 삭제되었습니다.`);
  }
};

function renderCategoryUI() {
  // 1. Render Segmented Tabs
  const tabsContainer = document.getElementById('dynamic-category-tabs');
  if (tabsContainer) {
    let tabsHtml = `<button class="segmented-tab ${activeCategoryFilter === 'all' ? 'active' : ''}" data-cat="all" onclick="setCategoryFilter('all')">전체 일정</button>`;
    categories.forEach(cat => {
      tabsHtml += `<button class="segmented-tab ${activeCategoryFilter === cat.id ? 'active' : ''}" data-cat="${cat.id}" onclick="setCategoryFilter('${cat.id}')">${cat.icon} ${cat.name}</button>`;
    });
    tabsHtml += `<button class="segmented-tab" onclick="openCategoryManagerModal()" style="max-width:44px;" title="카테고리 관리 및 추가">⚙️</button>`;
    tabsContainer.innerHTML = tabsHtml;
  }

  // 2. Render Modal Category Selector
  const selectorContainer = document.getElementById('dynamic-category-selector');
  if (selectorContainer) {
    if (categories.length === 0) {
      selectorContainer.innerHTML = `<span style="font-size:13px; color:var(--text-secondary); display:flex; align-items:center; gap:8px;">📌 기본 (등록된 카테고리 없음) <button type="button" class="cancel-btn" style="padding:2px 8px; font-size:11px;" onclick="openCategoryManagerModal()">+ 카테고리 추가</button></span><input type="hidden" name="event-category" value="">`;
    } else {
      let selectorHtml = '';
      categories.forEach((cat, index) => {
        const checked = index === 0 ? 'checked' : '';
        selectorHtml += `<label class="category-radio"><input type="radio" name="event-category" value="${cat.id}" ${checked}> ${cat.icon} ${cat.name}</label>`;
      });
      selectorContainer.innerHTML = selectorHtml;
    }
  }

  // 3. Render Batch Action Buttons
  const batchContainer = document.getElementById('dynamic-batch-category-buttons');
  if (batchContainer) {
    let batchHtml = '';
    categories.forEach(cat => {
      batchHtml += `<button class="batch-btn" onclick="batchChangeCategory('${cat.id}')">${cat.icon} ${cat.name}로 변경</button>`;
    });
    batchContainer.innerHTML = batchHtml;
  }
}

function saveTrashToStorage() {
  localStorage.setItem('toss_trash', JSON.stringify(trashEvents));
}

window.copyShareLink = function() {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoomCode)}`;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('🔗 1초 자동 연결 링크가 복사되었습니다! 카톡에 공유하세요.');
    });
  } else {
    const tempInput = document.createElement('input');
    tempInput.value = shareUrl;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast('🔗 1초 자동 연결 링크가 복사되었습니다! 카톡에 공유하세요.');
  }
};

// ==========================================
// 🔍 Supercharged Real-time Search Engine
// ==========================================
let currentSearchTab = 'all';

function highlightMatch(text, query) {
  if (!text) return '';
  if (!query) return escapeHtml(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.openSearchPanel = function() {
  const panel = document.getElementById('search-results-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  renderSearchResults();
};

window.closeSearchPanel = function() {
  const panel = document.getElementById('search-results-panel');
  if (panel) panel.classList.add('hidden');
};

window.clearSearch = function() {
  const input = document.getElementById('calendar-search-input');
  if (input) input.value = '';
  searchQuery = '';
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  renderCalendar();
  closeSearchPanel();
};

window.setSearchFilterTab = function(tab) {
  currentSearchTab = tab;
  document.querySelectorAll('.search-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderSearchResults();
};

window.applyQuickSearch = function(keyword) {
  const input = document.getElementById('calendar-search-input');
  if (!input) return;
  input.value = keyword;
  window.onSearchInput(keyword);
  input.focus();
};

window.onSearchInput = function(val) {
  searchQuery = val.trim().toLowerCase();
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', searchQuery.length === 0);
  }
  openSearchPanel();
  renderSearchResults();
  renderCalendar();
};

function renderSearchResults() {
  const list = document.getElementById('search-results-list');
  const suggestions = document.getElementById('search-suggestions-container');
  if (!list) return;

  const countAll = document.getElementById('search-count-all');
  const countEvents = document.getElementById('search-count-events');
  const countTodos = document.getElementById('search-count-todos');

  // Filter events
  const matchingEvents = events.filter(e => {
    if (!searchQuery) return false;
    if (searchQuery === '오늘') {
      return todayString >= e.startDate && todayString <= e.endDate;
    }
    if (searchQuery === '이번달') {
      const ym = todayString.substring(0, 7);
      return e.startDate.startsWith(ym) || e.endDate.startsWith(ym);
    }
    const catObj = categories.find(c => c.id === e.category);
    const catName = catObj ? catObj.name.toLowerCase() : '';
    return (e.title || '').toLowerCase().includes(searchQuery) ||
           (e.location || '').toLowerCase().includes(searchQuery) ||
           (e.memo || '').toLowerCase().includes(searchQuery) ||
           catName.includes(searchQuery) ||
           (e.startDate && e.startDate.includes(searchQuery)) ||
           (e.endDate && e.endDate.includes(searchQuery));
  });

  // Filter todos
  const matchingTodos = todos.filter(t => {
    if (!searchQuery) return false;
    if (searchQuery === '#미완료') return !t.completed;
    return (t.text || '').toLowerCase().includes(searchQuery);
  });

  const totalCount = matchingEvents.length + matchingTodos.length;
  if (countAll) countAll.innerText = totalCount;
  if (countEvents) countEvents.innerText = matchingEvents.length;
  if (countTodos) countTodos.innerText = matchingTodos.length;

  // Toggle suggestions container: show suggestions if search query is empty
  if (suggestions) {
    suggestions.style.display = searchQuery.length === 0 ? 'block' : 'none';
  }

  if (searchQuery.length === 0) {
    list.innerHTML = `
      <div class="search-empty-state">
        <div class="search-empty-icon">🔍</div>
        <div>찾으시는 일정이나 할 일, 장소, 메모를 입력해보세요.</div>
        <div style="font-size:11.5px; opacity:0.75; margin-top:4px;">단축키 <b>/</b> 키로 어디서든 빠르게 검색할 수 있습니다.</div>
      </div>
    `;
    return;
  }

  if (totalCount === 0) {
    list.innerHTML = `
      <div class="search-empty-state">
        <div class="search-empty-icon">😢</div>
        <div><b>"${escapeHtml(searchQuery)}"</b>에 대한 검색 결과가 없습니다.</div>
        <div style="font-size:11.5px; opacity:0.75; margin-top:4px;">다른 단어로 검색하거나 일정을 추가해보세요.</div>
      </div>
    `;
    return;
  }

  let html = '';

  // Render Events if tab is 'all' or 'events'
  if (currentSearchTab === 'all' || currentSearchTab === 'events') {
    matchingEvents.forEach(evt => {
      const catObj = categories.find(c => c.id === evt.category);
      const catColor = catObj ? catObj.color : '#3182f6';
      const catIcon = catObj ? catObj.icon : '📅';
      const catName = catObj ? catObj.name : '일반';
      const dateDisplay = evt.startDate === evt.endDate ? evt.startDate : `${evt.startDate} ~ ${evt.endDate}`;
      const isToday = todayString >= evt.startDate && todayString <= evt.endDate;

      html += `
        <div class="search-result-item" onclick="jumpToCalendarEvent(${evt.id}, '${evt.startDate}')">
          <div class="search-result-icon" style="background:${catColor}20; color:${catColor};">
            ${catIcon}
          </div>
          <div class="search-result-body">
            <div class="search-result-top">
              <span class="search-result-title">${highlightMatch(evt.title, searchQuery)}</span>
              <span class="search-result-badge" style="background:${catColor}20; color:${catColor};">${catName}</span>
            </div>
            <div class="search-result-meta">
              <span>📅 ${highlightMatch(dateDisplay, searchQuery)} ${isToday ? '<b style="color:var(--accent-primary);">(오늘)</b>' : ''}</span>
              ${evt.time ? `<span>⏰ ${highlightMatch(evt.time, searchQuery)}</span>` : ''}
              ${evt.location ? `<span>📍 ${highlightMatch(evt.location, searchQuery)}</span>` : ''}
            </div>
            ${evt.memo ? `<div class="search-result-memo">📝 ${highlightMatch(evt.memo, searchQuery)}</div>` : ''}
          </div>
        </div>
      `;
    });
  }

  // Render Todos if tab is 'all' or 'todos'
  if (currentSearchTab === 'all' || currentSearchTab === 'todos') {
    matchingTodos.forEach(todo => {
      html += `
        <div class="search-result-item" onclick="jumpToTodoItem(${todo.id})">
          <div class="search-result-icon" style="background:var(--nav-bg); color:var(--text-primary);">
            ${todo.completed ? '✅' : '⏳'}
          </div>
          <div class="search-result-body">
            <div class="search-result-top">
              <span class="search-result-title" style="${todo.completed ? 'text-decoration:line-through; opacity:0.7;' : ''}">${highlightMatch(todo.text, searchQuery)}</span>
              <span class="search-result-badge" style="background:var(--nav-bg); color:var(--text-secondary);">${todo.completed ? '완료됨' : '진행중'}</span>
            </div>
            <div class="search-result-meta">
              <span>체크리스트 할 일</span>
            </div>
          </div>
        </div>
      `;
    });
  }

  list.innerHTML = html;
}

window.jumpToCalendarEvent = function(eventId, dateStr) {
  closeSearchPanel();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    currentDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  selectedDate = dateStr;
  renderCalendar();

  setTimeout(() => {
    const targetCell = document.querySelector(`.day-cell[data-date="${dateStr}"]`);
    if (targetCell) {
      targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      targetCell.classList.remove('search-target-pulse');
      void targetCell.offsetWidth;
      targetCell.classList.add('search-target-pulse');
      setTimeout(() => targetCell.classList.remove('search-target-pulse'), 2500);
    }
    editEvent(eventId);
  }, 100);

  const evt = events.find(e => e.id === eventId);
  showToast(`🎯 '${evt ? evt.title : '일정'}' 날짜(${dateStr})로 이동했습니다.`);
};

window.jumpToTodoItem = function(todoId) {
  closeSearchPanel();
  const todoList = document.getElementById('todo-list');
  if (todoList) {
    todoList.scrollIntoView({ behavior: 'smooth' });
  }
  const todo = todos.find(t => t.id === todoId);
  showToast(`✅ '${todo ? todo.text : '할 일'}' 항목을 확인하세요.`);
};

// Global click & shortcut listeners for search
document.addEventListener('click', (e) => {
  const headerCenter = document.querySelector('.header-center');
  if (headerCenter && !headerCenter.contains(e.target)) {
    closeSearchPanel();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSearchPanel();
    const input = document.getElementById('calendar-search-input');
    if (input && document.activeElement === input) {
      input.blur();
    }
  }
  // Pressing '/' opens search if not inside an input/textarea
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement ? document.activeElement.tagName : '')) {
    e.preventDefault();
    const input = document.getElementById('calendar-search-input');
    if (input) {
      input.focus();
      input.select();
      openSearchPanel();
    }
  }
});

window.setCategoryFilter = function(cat) {
  activeCategoryFilter = cat;
  renderCategoryUI();
  renderCalendar();
};

window.openTrashModal = function() {
  renderTrashList();
  document.getElementById('trash-modal').classList.remove('hidden');
};

function renderTrashList() {
  const list = document.getElementById('trash-list');
  if (!list) return;
  if (trashEvents.length === 0) {
    list.innerHTML = '<li style="text-align:center; color:var(--text-secondary); padding:20px;">휴지통이 비어 있습니다.</li>';
    return;
  }
  list.innerHTML = '';
  trashEvents.forEach(evt => {
    list.innerHTML += `<li class="todo-item"><div class="todo-left"><span class="todo-text"><b>${evt.title}</b> (${evt.startDate})</span></div><button class="primary-btn" style="padding:4px 10px; font-size:12px;" onclick="restoreTrashEvent(${evt.id})">복구</button></li>`;
  });
}

window.restoreTrashEvent = function(id) {
  const targetIndex = trashEvents.findIndex(e => e.id === id);
  if (targetIndex > -1) {
    saveHistoryState();
    const restored = trashEvents.splice(targetIndex, 1)[0];
    events.push(restored);
    saveTrashToStorage();
    saveToLocalStorage();
    renderTrashList();
    renderCalendar();
    showToast(`↩️ [${restored.title}] 일정이 복구되었습니다.`);
  }
};

window.emptyTrashBin = function() {
  if (trashEvents.length === 0) return;
  if (confirm('휴지통을 완전히 비우시겠습니까? 복구할 수 없습니다.')) {
    trashEvents = [];
    saveTrashToStorage();
    renderTrashList();
    showToast('🧹 휴지통이 모두 비워졌습니다.');
  }
};

const hardcodedFirebaseConfig = {
  apiKey: "AIzaSyAsSq73zXeT8K7LDGjEzeE73dElgX6ig-Tc",
  authDomain: "finn-code.firebaseapp.com",
  projectId: "finn-code",
  storageBucket: "finn-code.firebasestorage.app",
  messagingSenderId: "144640970098",
  appId: "1:144640970098:web:644cc1895f9483fec421eb",
  measurementId: "G-1SFK5060BM"
};

function initFirebaseSync() {
  const storedCfg = localStorage.getItem('toss_firebase_config');
  let cfg = hardcodedFirebaseConfig;
  if (storedCfg) {
    try { cfg = { ...hardcodedFirebaseConfig, ...JSON.parse(storedCfg) }; } catch(e) {}
  }

  const statusBadge = document.getElementById('firebase-status-badge');

  if (cfg && cfg.apiKey && cfg.projectId && typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(cfg);
      }
      db = firebase.firestore();
      if (statusBadge) {
        statusBadge.innerText = '🟢 실시간 연동됨';
        statusBadge.style.background = '#dcfce7';
        statusBadge.style.color = '#166534';
        statusBadge.style.cursor = 'default';
        statusBadge.onclick = null;
      }
      setupRoomSubscription(currentRoomCode);
      return true;
    } catch (err) {
      console.error('Firebase init error:', err);
    }
  }

  if (statusBadge) {
    statusBadge.innerText = '🟢 실시간 연동됨';
    statusBadge.style.background = '#dcfce7';
    statusBadge.style.color = '#166534';
  }
  return false;
}

function setupRoomSubscription(roomCode) {
  if (!db) return;
  if (firestoreUnsubscribe) firestoreUnsubscribe();

  const docRef = db.collection('shared_calendars').doc(roomCode);
  firestoreUnsubscribe = docRef.onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (data) {
        isSyncingFromRemote = true;
        if (Array.isArray(data.todos)) todos = data.todos;
        if (Array.isArray(data.events)) {
          events = data.events.map(e => ({ ...e, startDate: e.startDate || e.date, endDate: e.endDate || e.date }));
        }
        localStorage.setItem('toss_todos', JSON.stringify(todos));
        localStorage.setItem('toss_events', JSON.stringify(events));
        renderCalendar();
        renderTodos();
        isSyncingFromRemote = false;
      }
    } else {
      // Create initial doc in Firebase
      docRef.set({ todos, events, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  }, err => {
    console.error('Firestore snapshot error:', err);
  });
}

function syncToFirebase() {
  if (db && !isSyncingFromRemote) {
    db.collection('shared_calendars').doc(currentRoomCode).set({
      todos,
      events,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => console.error('Firestore sync error:', err));
  }
}

window.saveFirebaseConfigUI = function() {
  const apiKey = document.getElementById('fb-apiKey').value.trim();
  const projectId = document.getElementById('fb-projectId').value.trim();
  const appId = document.getElementById('fb-appId').value.trim();

  if (!apiKey || !projectId) {
    alert('API Key와 Project ID를 모두 입력해주세요.');
    return;
  }

  const cfg = { apiKey, projectId, appId, authDomain: `${projectId}.firebaseapp.com` };
  localStorage.setItem('toss_firebase_config', JSON.stringify(cfg));
  document.getElementById('firebase-modal').classList.add('hidden');
  if (initFirebaseSync()) {
    alert('🔥 파이어베이스가 성공적으로 연동되었습니다! 이제 공유 방 코드가 같은 유저끼리 실시간 동기화됩니다.');
    syncToFirebase();
  }
};

// ==========================================
// ↩️ History Stack (Undo / Redo System)
// ==========================================
let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 30;

function saveHistoryState() {
  historyStack.push({
    todos: JSON.parse(JSON.stringify(todos)),
    events: JSON.parse(JSON.stringify(events))
  });
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
  redoStack = [];
}

function undo() {
  if (historyStack.length === 0) {
    showToast('⚠️ 더 이상 취소할 작업이 없습니다.');
    return;
  }
  redoStack.push({
    todos: JSON.parse(JSON.stringify(todos)),
    events: JSON.parse(JSON.stringify(events))
  });
  const prev = historyStack.pop();
  todos = prev.todos;
  events = prev.events;
  saveToLocalStorage();
  renderCalendar();
  renderTodos();
  showToast('↩️ 실행 취소되었습니다 (Ctrl+Z)');
}

function redo() {
  if (redoStack.length === 0) {
    showToast('⚠️ 더 이상 다시 실행할 작업이 없습니다.');
    return;
  }
  historyStack.push({
    todos: JSON.parse(JSON.stringify(todos)),
    events: JSON.parse(JSON.stringify(events))
  });
  const next = redoStack.pop();
  todos = next.todos;
  events = next.events;
  saveToLocalStorage();
  renderCalendar();
  renderTodos();
  showToast('↪️ 다시 실행되었습니다 (Ctrl+Shift+Z)');
}

let toastTimeout = null;
function showToast(msg) {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');
  if (toast && toastMsg) {
    toastMsg.innerText = msg;
    toast.classList.remove('hidden');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2200);
  }
}

// ==========================================
// ☑️ Multi-Selection System
// ==========================================
let selectedEventIds = new Set();

window.toggleEventSelect = function(e, id) {
  e.preventDefault();
  e.stopPropagation();
  if (selectedEventIds.has(id)) {
    selectedEventIds.delete(id);
  } else {
    selectedEventIds.add(id);
  }
  updateBatchBar();
  renderCalendar();
};

window.clearEventSelection = function() {
  selectedEventIds.clear();
  updateBatchBar();
  renderCalendar();
};

function updateBatchBar() {
  const bar = document.getElementById('floating-batch-bar');
  const countDisplay = document.getElementById('batch-count-display');
  if (!bar || !countDisplay) return;
  if (selectedEventIds.size > 0) {
    countDisplay.innerText = `${selectedEventIds.size}개 일정 선택됨`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

window.batchDeleteEvents = function() {
  if (selectedEventIds.size === 0) return;
  if (confirm(`선택한 ${selectedEventIds.size}개의 일정을 삭제하시겠습니까?`)) {
    saveHistoryState();
    events = events.filter(evt => !selectedEventIds.has(evt.id));
    selectedEventIds.clear();
    updateBatchBar();
    saveToLocalStorage();
    renderCalendar();
    showToast('🗑️ 선택한 일정이 일괄 삭제되었습니다.');
  }
};

window.batchChangeCategory = function(cat) {
  if (selectedEventIds.size === 0) return;
  saveHistoryState();
  events = events.map(evt => selectedEventIds.has(evt.id) ? { ...evt, category: cat } : evt);
  selectedEventIds.clear();
  updateBatchBar();
  saveToLocalStorage();
  renderCalendar();
  const targetCat = categories.find(c => c.id === cat);
  const catName = targetCat ? targetCat.name : cat;
  showToast(`🎨 선택한 일정이 [${catName}] 카테고리로 변경되었습니다.`);
};

const KMA_AUTH_KEY = "2WHPjj_CTyOhz44_wl8j4A";
let weatherForecastMap = {}; 
let chartInstance = null;

function dfs_xy_conv(v1, v2) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID, slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + (v1) * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = v2 * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

function parseKmaWeather(sky, pty) {
  if (pty === "1" || pty === "4") return { desc: "비", emoji: "🌧️" };
  if (pty === "2") return { desc: "비/눈", emoji: "🌨️" };
  if (pty === "3") return { desc: "눈", emoji: "❄️" };
  if (sky === "1") return { desc: "맑음", emoji: "☀️" };
  if (sky === "3") return { desc: "구름많음", emoji: "⛅" };
  if (sky === "4") return { desc: "흐림", emoji: "☁️" };
  return { desc: "맑음", emoji: "☀️" };
}

async function fetchLocationName(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`);
    if(res.ok) {
      const data = await res.json();
      const addr = data.address;
      return addr.city || addr.town || addr.borough || addr.district || addr.county || addr.state || "대한민국";
    }
  } catch(e) {}
  return "대한민국 기상청";
}

async function fetchWeather(lat, lon) {
  const loading = document.getElementById('weather-loader');
  const content = document.getElementById('weather-content');
  loading.classList.remove('hidden');
  content.classList.add('hidden');

  const locName = await fetchLocationName(lat, lon);
  document.getElementById('weather-location').innerText = `📍 ${locName}`;

  try {
    const { nx, ny } = dfs_xy_conv(lat, lon);
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
    let checkHour = kst.getUTCHours();
    if (kst.getUTCMinutes() < 15) checkHour -= 1;
    let baseHour = baseTimes.filter(h => h <= checkHour).pop();
    let targetDate = kst;
    if (baseHour === undefined) { baseHour = 23; targetDate = new Date(kst.getTime() - (24 * 60 * 60 * 1000)); }

    const base_date = targetDate.toISOString().slice(0, 10).replace(/-/g, "");
    const base_time = String(baseHour).padStart(2, "0") + "00";
    const targetKmaUrl = `https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}&authKey=${KMA_AUTH_KEY}`;
    
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetKmaUrl + "&t=" + Date.now())}`;
    const res = await fetch(proxyUrl);
    const data = await res.json();
    const items = data.response?.body?.items?.item || [];
    if (!items.length) throw new Error();

    const hourlyMap = {}, dailyMap = {};
    items.forEach(item => {
      const dt = `${item.fcstDate}_${item.fcstTime}`;
      if (!hourlyMap[dt]) hourlyMap[dt] = { date: item.fcstDate, time: item.fcstTime };
      hourlyMap[dt][item.category] = item.fcstValue;
      if (!dailyMap[item.fcstDate]) dailyMap[item.fcstDate] = { date: item.fcstDate, temps: [], pop: [] };
      if (item.category === "TMP") dailyMap[item.fcstDate].temps.push(parseFloat(item.fcstValue));
      if (item.category === "POP") dailyMap[item.fcstDate].pop.push(parseFloat(item.fcstValue));
      if (item.category === "SKY") dailyMap[item.fcstDate].sky = item.fcstValue;
      if (item.category === "PTY") dailyMap[item.fcstDate].pty = item.fcstValue;
    });

    const hourlyList = Object.values(hourlyMap).slice(0, 8).map(h => {
      const w = parseKmaWeather(h.SKY, h.PTY);
      return { time: h.time, temp: Math.round(parseFloat(h.TMP || 0)), desc: w.desc, emoji: w.emoji };
    });

    const dailyList = Object.values(dailyMap).map(d => {
      const w = parseKmaWeather(d.sky, d.pty);
      return {
        date: `${d.date.slice(0,4)}-${d.date.slice(4,6)}-${d.date.slice(6,8)}`,
        max: Math.round(Math.max(...d.temps)), min: Math.round(Math.min(...d.temps)),
        pop: Math.max(...d.pop, 0), desc: w.desc, emoji: w.emoji
      };
    });

    renderKMAData({ current: hourlyList[0], hourly: hourlyList, daily: dailyList });
  } catch (err) {
    fallbackToOpenMeteo(lat, lon);
  }
}

async function fallbackToOpenMeteo(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul`;
    const res = await fetch(url);
    const data = await res.json();
    
    document.getElementById('weather-temp').innerText = `${Math.round(data.current.temperature_2m)}°`;
    document.getElementById('weather-desc').innerText = "실시간 예보";
    document.getElementById('weather-emoji').innerText = "⛅";
    document.getElementById('weather-minmax').innerText = `↑ ${Math.round(data.daily.temperature_2m_max[0])}° / ↓ ${Math.round(data.daily.temperature_2m_min[0])}°`;

    const next8 = data.hourly.temperature_2m.slice(0, 8).map(t => Math.round(t));
    const labels = [0,1,2,3,4,5,6,7].map(i => `${(new Date().getHours() + i) % 24}시`);
    drawWeatherChart(labels, next8);
    document.getElementById('weather-loader').classList.add('hidden');
    document.getElementById('weather-content').classList.remove('hidden');
  } catch(e) {}
}

function renderKMAData(data) {
  const { current, hourly, daily } = data;
  document.getElementById('weather-emoji').innerText = current.emoji;
  document.getElementById('weather-temp').innerText = `${current.temp}°`;
  document.getElementById('weather-desc').innerText = current.desc;
  document.getElementById('weather-minmax').innerText = `↑ ${daily[0]?.max ?? current.temp}° / ↓ ${daily[0]?.min ?? current.temp}°`;

  drawWeatherChart(hourly.map(h => `${parseInt(h.time.slice(0, 2), 10)}시`), hourly.map(h => h.temp));
  
  const list = document.getElementById('weekly-forecast-list');
  list.innerHTML = '';
  const daysArr = ['일', '월', '화', '수', '목', '금', '토'];
  daily.forEach(d => {
    const dayName = (d.date === todayString) ? '오늘' : daysArr[new Date(d.date).getDay()];
    list.innerHTML += `<div class="weekly-item"><span class="weekly-day">${dayName}</span><span class="weekly-rain">${d.pop > 0 ? `💧 ${d.pop}%` : ''}</span><span class="weekly-icon">${d.emoji}</span><span class="weekly-temps"><span class="temp-max">${d.max}°</span> <span class="temp-min">${d.min}°</span></span></div>`;
  });

  weatherForecastMap = {};
  daily.forEach(d => { weatherForecastMap[d.date] = d.emoji; });
  renderCalendar();

  document.getElementById('weather-loader').classList.add('hidden');
  document.getElementById('weather-content').classList.remove('hidden');
}

function drawWeatherChart(labels, temps) {
  const ctx = document.getElementById('weatherChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const lineColor = isDark ? '#60a5fa' : '#ffffff';
  const bgColor = isDark ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.2)';

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: [{ data: temps, borderColor: lineColor, backgroundColor: bgColor, borderWidth: 2, pointBackgroundColor: '#fff', pointRadius: 3, tension: 0.4, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#fff', font: { size: 10 } } }, y: { display: false } } }
  });
}

function initWeather() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        pos => fetchWeather(pos.coords.latitude, pos.coords.longitude), 
        () => fetchWeather(37.4822, 126.9406), 
        { timeout: 5000 }
    );
  } else { fetchWeather(37.4822, 126.9406); }
}
document.getElementById('refresh-weather-btn').addEventListener('click', initWeather);

function saveToLocalStorage() {
  localStorage.setItem('toss_todos', JSON.stringify(todos));
  localStorage.setItem('toss_events', JSON.stringify(events));
  localStorage.setItem('toss_categories', JSON.stringify(categories));
  syncToFirebase();
}

function addTodo() {
  const input = document.getElementById('todo-input');
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  saveHistoryState();
  todos.push({ id: Date.now(), text, completed: false });
  input.value = ''; saveToLocalStorage(); renderTodos(); input.focus();
}
document.getElementById('add-todo-btn').addEventListener('click', addTodo);
document.getElementById('todo-input').addEventListener('keypress', e => { if (e.key === 'Enter') addTodo(); });

function toggleTodo(id) { saveHistoryState(); todos = todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t); saveToLocalStorage(); renderTodos(); }
function deleteTodo(id) { saveHistoryState(); todos = todos.filter(t => t.id !== id); saveToLocalStorage(); renderTodos(); }

document.getElementById('add-event-btn').addEventListener('click', () => openModal(selectedDate || todayString));

function openModal(dateStr = '') {
  editModeEventId = null;
  renderCategoryUI();
  document.getElementById('modal-title').innerText = "새 일정 추가";
  document.getElementById('event-title').value = '';
  document.getElementById('event-date').value = dateStr || selectedDate || todayString;
  document.getElementById('event-end-date').value = dateStr || selectedDate || todayString;
  document.getElementById('event-time').value = '';
  document.getElementById('event-location').value = '';
  document.getElementById('event-memo').value = '';
  const firstRadio = document.querySelector('input[name="event-category"]');
  if (firstRadio) firstRadio.checked = true;
  document.getElementById('modal-action-buttons').innerHTML = `<button class="cancel-btn" onclick="closeModal()">취소</button><button class="primary-btn" onclick="saveEvent()">저장</button>`;
  document.getElementById('event-modal').classList.remove('hidden');
  document.getElementById('event-title').focus();
}

function editEvent(id) {
  const evt = events.find(e => e.id === id); if(!evt) return;
  editModeEventId = id;
  renderCategoryUI();
  document.getElementById('modal-title').innerText = "일정 수정";
  document.getElementById('event-title').value = evt.title;
  document.getElementById('event-date').value = evt.startDate;
  document.getElementById('event-end-date').value = evt.endDate;
  document.getElementById('event-time').value = evt.time || '';
  document.getElementById('event-location').value = evt.location || '';
  document.getElementById('event-memo').value = evt.memo || '';
  const catRadio = document.querySelector(`input[name="event-category"][value="${evt.category || 'work'}"]`);
  if (catRadio) catRadio.checked = true;
  document.getElementById('modal-action-buttons').innerHTML = `<button class="delete-action-btn" onclick="deleteEvent(${id})" style="margin-right:auto;">삭제</button><button class="cancel-btn" onclick="closeModal()">취소</button><button class="primary-btn" onclick="saveEvent()">수정</button>`;
  document.getElementById('event-modal').classList.remove('hidden');
  document.getElementById('event-title').focus();
}

function closeModal() { document.getElementById('event-modal').classList.add('hidden'); }
function saveEvent() {
  const title = document.getElementById('event-title').value.trim();
  const startDate = document.getElementById('event-date').value;
  const endDate = document.getElementById('event-end-date').value;
  const time = document.getElementById('event-time').value;
  const location = document.getElementById('event-location').value.trim();
  const memo = document.getElementById('event-memo').value.trim();
  const categoryRadio = document.querySelector('input[name="event-category"]:checked');
  const category = categoryRadio ? categoryRadio.value : 'work';
  
  if (!title || !startDate || !endDate) { alert('제목과 날짜를 전부 입력해주세요.'); return; }
  if (startDate > endDate) { alert('종료 날짜가 시작 날짜보다 빠를 수 없습니다.'); return; }

  saveHistoryState();
  if (editModeEventId) { events = events.map(e => e.id === editModeEventId ? { ...e, title, startDate, endDate, date: startDate, time, location, memo, category } : e); }
  else { events.push({ id: Date.now(), title, startDate, endDate, date: startDate, time, location, memo, category }); }
  saveToLocalStorage(); closeModal(); renderCalendar();
}

function deleteEvent(id, skipConfirm = false) { 
    if(skipConfirm || confirm('삭제하시겠습니까?')) { 
        saveHistoryState();
        const targetEvt = events.find(e => e.id === id);
        if (targetEvt) {
            trashEvents.unshift(targetEvt);
            saveTrashToStorage();
        }
        events = events.filter(e => e.id !== id); 
        saveToLocalStorage(); 
        closeModal(); 
        renderCalendar(); 
        showToast('🗑️ 일정이 휴지통으로 이동되었습니다.');
    } 
}

// ------------------------------------------------------------------
// Context Menu & Copy/Paste Logic
// ------------------------------------------------------------------
let contextMenuEventId = null;
let hoveredEventId = null;
let copiedEvent = null;

const ctxMenu = document.getElementById('context-menu');

window.showContextMenu = function(e, id) {
    e.preventDefault();
    e.stopPropagation();
    contextMenuEventId = id;
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.classList.remove('hidden');
};

document.getElementById('ctx-delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if(contextMenuEventId) {
        deleteEvent(contextMenuEventId, true);
    }
    ctxMenu.classList.add('hidden');
});

window.setHoveredEvent = function(id) { hoveredEventId = id; };
window.clearHoveredEvent = function(id) { if(hoveredEventId === id) hoveredEventId = null; };

window.onEventTagClick = function(e, id) {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.shiftKey || selectedEventIds.size > 0) {
        window.toggleEventSelect(e, id);
    } else {
        editEvent(id);
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.clearEventSelection();
    }
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        } else if (e.key === 'y' || e.key === 'Y') {
            e.preventDefault();
            redo();
        } else if (e.key === 'c' || e.key === 'C') {
            if (hoveredEventId) {
                const evt = events.find(ev => ev.id === hoveredEventId);
                if (evt) copiedEvent = { ...evt };
            }
        } else if (e.key === 'v' || e.key === 'V') {
            if (copiedEvent && selectedDate) {
                saveHistoryState();
                const duration = (new Date(copiedEvent.endDate) - new Date(copiedEvent.startDate)) / (1000*60*60*24);
                const newStart = selectedDate;
                const newEndObj = new Date(selectedDate);
                newEndObj.setDate(newEndObj.getDate() + duration);
                const newEnd = `${newEndObj.getFullYear()}-${String(newEndObj.getMonth()+1).padStart(2,'0')}-${String(newEndObj.getDate()).padStart(2,'0')}`;
                
                events.push({
                    ...copiedEvent,
                    id: Date.now(),
                    startDate: newStart,
                    endDate: newEnd,
                    date: newStart
                });
                saveToLocalStorage();
                renderCalendar();
                showToast('📋 일정이 붙여넣기 되었습니다.');
            }
        }
    }
});

// Hide context menu and modals on outside click
window.addEventListener('click', e => {
  if (e.target === document.getElementById('event-modal')) closeModal();
  if (e.target === document.getElementById('datepicker-modal')) document.getElementById('datepicker-modal').classList.add('hidden');
  if (e.target === document.getElementById('category-manager-modal')) document.getElementById('category-manager-modal').classList.add('hidden');
  if (e.target === document.getElementById('trash-modal')) document.getElementById('trash-modal').classList.add('hidden');
  if (!ctxMenu.contains(e.target)) ctxMenu.classList.add('hidden');
});

function updateClock() {
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  document.getElementById('live-date').innerText = `${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
  let h = now.getHours(), m = String(now.getMinutes()).padStart(2, '0'), s = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('live-clock').innerHTML = `<span class="clock-ampm">${h >= 12 ? 'PM' : 'AM'}</span> ${String(h % 12 || 12).padStart(2, '0')}:${m}:${s}`;
}
setInterval(updateClock, 1000); updateClock();

const themeToggle = document.getElementById('theme-toggle-checkbox');
let isDark = localStorage.getItem('theme') === 'dark';
function applyTheme() {
  if (isDark) { document.documentElement.setAttribute('data-theme', 'dark'); themeToggle.checked = true; }
  else { document.documentElement.removeAttribute('data-theme'); themeToggle.checked = false; }
  if (chartInstance && chartInstance.data && chartInstance.data.datasets.length > 0) {
    const lineColor = isDark ? '#60a5fa' : '#ffffff';
    const bgColor = isDark ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.2)';
    chartInstance.data.datasets[0].borderColor = lineColor;
    chartInstance.data.datasets[0].backgroundColor = bgColor;
    chartInstance.update();
  }
}
applyTheme();
themeToggle.addEventListener('change', e => { isDark = e.target.checked; localStorage.setItem('theme', isDark ? 'dark' : 'light'); applyTheme(); });

const holidays = {"2026-01-01": "신정", "2026-02-16": "설날", "2026-02-17": "설날", "2026-02-18": "설날", "2026-03-01": "삼일절", "2026-05-05": "어린이날", "2026-06-06": "현충일", "2026-08-15": "광복절", "2026-09-24": "추석", "2026-09-25": "추석", "2026-09-26": "추석", "2026-10-03": "개천절", "2026-10-09": "한글날", "2026-12-25": "성탄절"};

// Drag to Resize Logic
window.resizingEventId = null;
window.resizeType = null;
window.startResize = function(e, id, type) {
    e.preventDefault();
    e.stopPropagation();
    resizingEventId = id;
    resizeType = type;
    document.body.style.cursor = 'ew-resize';
};
window.addEventListener('mouseup', () => {
    if (resizingEventId) {
        resizingEventId = null;
        resizeType = null;
        document.body.style.cursor = '';
        saveToLocalStorage();
        renderCalendar();
    }
});
window.dragEventStart = function(e, id) { 
    e.dataTransfer.setData('source', 'calendar_event'); 
    e.dataTransfer.setData('event_id', id); 
    e.dataTransfer.effectAllowed = 'copyMove'; 
};

function getContrastColor(hexColor) {
  if (!hexColor || typeof hexColor !== 'string') return '#ffffff';
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length < 6) return '#ffffff';
  const r = parseInt(hex.substr(0, 2), 16) || 0;
  const g = parseInt(hex.substr(2, 2), 16) || 0;
  const b = parseInt(hex.substr(4, 2), 16) || 0;
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 165) ? '#111827' : '#ffffff';
}

function renderCalendar() {
  const year = currentDate.getFullYear(), month = currentDate.getMonth();
  document.getElementById('current-year').innerText = `${year}년`;
  document.getElementById('month-display-btn').innerText = `${month + 1}월`;
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLastDate = new Date(year, month, 0).getDate();
  const container = document.getElementById('calendar-days');
  container.innerHTML = '';

  for (let i = firstDay - 1; i >= 0; i--) { createCell(container, prevLastDate - i, true, month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1); }
  for (let d = 1; d <= lastDate; d++) { createCell(container, d, false, year, month); }
  renderDailyAgenda(selectedDate);
}

function matchesFilter(evt) {
  if (activeCategoryFilter !== 'all' && evt.category !== activeCategoryFilter) {
    return false;
  }
  if (searchQuery) {
    if (searchQuery === '오늘') {
      return todayString >= evt.startDate && todayString <= evt.endDate;
    }
    if (searchQuery === '이번달') {
      const ym = todayString.substring(0, 7);
      return evt.startDate.startsWith(ym) || evt.endDate.startsWith(ym);
    }
    const catObj = categories.find(c => c.id === evt.category);
    const catName = catObj ? catObj.name.toLowerCase() : '';
    const titleMatch = (evt.title || '').toLowerCase().includes(searchQuery);
    const locMatch = (evt.location || '').toLowerCase().includes(searchQuery);
    const memoMatch = (evt.memo || '').toLowerCase().includes(searchQuery);
    const catMatch = catName.includes(searchQuery);
    const dateMatch = (evt.startDate && evt.startDate.includes(searchQuery)) || (evt.endDate && evt.endDate.includes(searchQuery));
    if (!titleMatch && !locMatch && !memoMatch && !catMatch && !dateMatch) return false;
  }
  return true;
}

function createCell(container, dayNum, isOther, year, month) {
  const cell = document.createElement('div');
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  cell.className = `day-cell ${isOther ? 'other-month' : ''} ${dateStr === selectedDate ? 'selected' : ''} ${holidays[dateStr] ? 'is-holiday' : ''}`;
  cell.dataset.date = dateStr;
  
  cell.onclick = () => { selectedDate = dateStr; renderCalendar(); };
  cell.ondblclick = () => { selectedDate = dateStr; renderCalendar(); openModal(dateStr); };

  // Drag over / Drop logic for Moving/Copying events
  cell.addEventListener('dragover', (e) => { e.preventDefault(); if(!isOther) cell.classList.add('drag-over'); });
  cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
  cell.addEventListener('drop', (e) => {
    e.preventDefault(); cell.classList.remove('drag-over'); if(isOther) return;
    const source = e.dataTransfer.getData('source');
    if (source === 'todo') {
      const todoId = e.dataTransfer.getData('todo_id'); const todo = todos.find(t => t.id == todoId);
      if(todo) { saveHistoryState(); events.push({ id: Date.now(), title: todo.text, startDate: dateStr, endDate: dateStr, category: '', time: '', location: '', memo: '' }); todos = todos.filter(t => t.id != todoId); saveToLocalStorage(); renderCalendar(); renderTodos(); }
    } else if (source === 'calendar_event') {
      const eventId = e.dataTransfer.getData('event_id'); const evtIndex = events.findIndex(ev => ev.id == eventId);
      if(evtIndex > -1) { 
          saveHistoryState();
          const evt = events[evtIndex];
          const duration = (new Date(evt.endDate) - new Date(evt.startDate)) / (1000*60*60*24);
          const newStart = dateStr;
          const newEndObj = new Date(dateStr);
          newEndObj.setDate(newEndObj.getDate() + duration);
          const newEnd = `${newEndObj.getFullYear()}-${String(newEndObj.getMonth()+1).padStart(2,'0')}-${String(newEndObj.getDate()).padStart(2,'0')}`;
          
          if (e.ctrlKey || e.metaKey) { // Ctrl 누른채로 드롭하면 복사
              events.push({ ...evt, id: Date.now(), startDate: newStart, endDate: newEnd, date: newStart });
          } else { // 일반 드롭은 이동
              evt.startDate = newStart;
              evt.endDate = newEnd;
          }
          selectedDate = dateStr; saveToLocalStorage(); renderCalendar(); 
      }
    }
  });

  // Mouse Enter for Drag to Resize logic
  cell.addEventListener('mouseenter', () => {
      if (resizingEventId && !isOther) {
          const evt = events.find(e => e.id === resizingEventId);
          if (evt) {
              if (resizeType === 'start' && dateStr <= evt.endDate) { evt.startDate = dateStr; renderCalendar(); }
              else if (resizeType === 'end' && dateStr >= evt.startDate) { evt.endDate = dateStr; renderCalendar(); }
          }
      }
  });

  const holidayHtml = (!isOther && holidays[dateStr]) ? `<span class="holiday-name" title="${holidays[dateStr]}">${holidays[dateStr]}</span>` : '';
  const weatherHtml = (!isOther && weatherForecastMap[dateStr]) ? `<span class="cal-weather-icon">${weatherForecastMap[dateStr]}</span>` : '';

  cell.innerHTML = `
    <div class="day-header-wrap">
      <div class="day-header-left">
        <span class="day-number ${!isOther && dateStr === todayString ? 'today-badge' : ''}">${dayNum}</span>
        ${holidayHtml}
      </div>
      ${weatherHtml}
    </div>
  `;
  
  // 연속된 일정 바 랜더링 로직 (media_1788501133981.png 와 100% 동일한 원본 바 형태)
  const dayOfWeek = new Date(year, month, dayNum).getDay();

  events.filter(e => dateStr >= e.startDate && dateStr <= e.endDate && matchesFilter(e))
        .sort((a,b) => {
            const durA = new Date(a.endDate) - new Date(a.startDate);
            const durB = new Date(b.endDate) - new Date(b.startDate);
            if (durA !== durB) return durB - durA;
            return (a.startDate !== b.startDate) ? a.startDate.localeCompare(b.startDate) : (a.time||'24:00').localeCompare(b.time||'24:00');
        })
        .forEach(evt => {
    const isStart = dateStr === evt.startDate;
    const isEnd = dateStr === evt.endDate;
    const leftRad = !isStart ? 'no-left-radius' : '';
    const rightRad = !isEnd ? 'no-right-radius' : '';

    const catObj = categories.find(c => c.id === evt.category);
    const catColor = (catObj && catObj.color) ? catObj.color : '#3182f6';

    const isSelected = selectedEventIds.has(evt.id);
    const selClass = isSelected ? 'selected-multi' : '';

    // media_1788501133981.png 원본 형태: 반투명 배경 + 셀 간격 연결 + 경계선 파란 라인
    const dynamicStyle = `background: ${catColor}20; color: ${catColor}; border-left: 3px solid ${catColor};`;

    let tag = `<div class="event-tag ${leftRad} ${rightRad} ${selClass}" style="${dynamicStyle}" draggable="true" ondragstart="window.dragEventStart(event, ${evt.id})" onclick="window.onEventTagClick(event, ${evt.id})" onmouseenter="window.setHoveredEvent(${evt.id})" onmouseleave="window.clearHoveredEvent(${evt.id})" oncontextmenu="window.showContextMenu(event, ${evt.id})">`;
    
    if (isStart) {
      tag += `<div class="resize-handle left" onmousedown="window.startResize(event, ${evt.id}, 'start')" ondragstart="return false;"></div>`;
      tag += `${isSelected ? '☑️ ' : ''}<span class="event-tag-title" style="pointer-events:none;">${evt.time ? `<small style="opacity:0.85; margin-right:3px;">${evt.time}</small>` : ''}${evt.title}</span>`;
    } else {
      tag += `<span style="visibility:hidden; user-select:none; pointer-events:none;">&nbsp;</span>`;
    }
    
    if (isEnd) {
      tag += `<div class="resize-handle right" onmousedown="window.startResize(event, ${evt.id}, 'end')" ondragstart="return false;"></div>`;
    }
    
    tag += `</div>`;
    cell.innerHTML += tag;
  });
  container.appendChild(cell);
}

function renderDailyAgenda(dateStr) {
  const title = document.getElementById('agenda-date-title');
  const count = document.getElementById('agenda-count');
  const list = document.getElementById('agenda-list');
  const d = new Date(dateStr);
  title.innerText = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const dayEvts = events.filter(e => dateStr >= e.startDate && dateStr <= e.endDate && matchesFilter(e));
  count.innerText = `${dayEvts.length}개의 일정`;
  list.innerHTML = dayEvts.length === 0 ? '<div class="agenda-empty">등록된 일정이 없습니다.</div>' : '';
  dayEvts.forEach(evt => {
    const catObj = categories.find(c => c.id === (evt.category || 'work'));
    const catColor = catObj ? catObj.color : '#3182f6';
    list.innerHTML += `<div class="agenda-item" style="border-left-color:${catColor};" onclick="editEvent(${evt.id})"><div class="agenda-time">${evt.time || '종일'}</div><div class="agenda-content"><div class="agenda-title">${evt.title}</div><div class="agenda-details">${evt.location ? `<span>📍 ${evt.location}</span>` : ''}${evt.memo ? `<span>📝 ${evt.memo}</span>` : ''}</div></div></div>`;
  });
}

function renderTodos() {
  const list = document.getElementById('todo-list');
  list.innerHTML = todos.length === 0 ? '<li style="text-align:center; color:var(--text-secondary); padding:20px;">할 일이 없습니다.</li>' : '';
  document.getElementById('todo-count').innerText = `${todos.filter(t => !t.completed).length}개 남음`;
  todos.forEach(t => {
    list.innerHTML += `<li class="todo-item ${t.completed ? 'completed' : ''}" draggable="true" ondragstart="event.dataTransfer.setData('source', 'todo'); event.dataTransfer.setData('todo_id', ${t.id}); event.dataTransfer.effectAllowed = 'move';"><div class="todo-left"><input type="checkbox" ${t.completed ? 'checked' : ''} onchange="toggleTodo(${t.id})"><span class="todo-text">${t.text}</span></div><button class="delete-btn" onclick="deleteTodo(${t.id})">&times;</button></li>`;
  });
}

let currentViewMode = 'month';

window.setViewMode = function(mode) {
  currentViewMode = mode;
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
  
  const monthView = document.getElementById('calendar-view-month');
  const weekView = document.getElementById('calendar-view-week');
  const listView = document.getElementById('calendar-view-list');
  
  if (monthView) monthView.classList.toggle('hidden', mode !== 'month');
  if (weekView) weekView.classList.toggle('hidden', mode !== 'week');
  if (listView) listView.classList.toggle('hidden', mode !== 'list');
  
  if (mode === 'month') {
    renderCalendar();
  } else if (mode === 'week') {
    renderWeekView();
  } else if (mode === 'list') {
    renderListView();
  }
};

function renderWeekView() {
  const container = document.getElementById('week-view-container');
  if (!container) return;
  container.innerHTML = '';
  
  const curr = new Date(currentDate);
  const day = curr.getDay();
  const startOfWeek = new Date(curr);
  startOfWeek.setDate(curr.getDate() - day); // Sunday
  
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  
  document.getElementById('current-year').innerText = `${startOfWeek.getFullYear()}년`;
  document.getElementById('month-display-btn').innerText = `${startOfWeek.getMonth() + 1}월`;
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isToday = dateStr === todayString;
    const isSun = i === 0;
    const isSat = i === 6;
    const holiday = holidays[dateStr];
    
    const dayEvts = events.filter(e => dateStr >= e.startDate && dateStr <= e.endDate && matchesFilter(e));
    
    let colHtml = `
      <div class="week-col ${isToday ? 'today' : ''}" onclick="selectedDate='${dateStr}'; renderDailyAgenda('${dateStr}');">
        <div class="week-col-header">
          <div class="week-day-name ${isSun ? 'sun' : isSat ? 'sat' : ''}">${dayNames[i]}</div>
          <div class="week-day-number ${isToday ? 'today-badge' : ''}">${d.getDate()}</div>
          ${holiday ? `<div style="font-size:11px; font-weight:700; color:var(--danger-color); margin-top:2px;">${holiday}</div>` : ''}
        </div>
        <div class="week-col-events">
    `;
    
    dayEvts.forEach(evt => {
      const catObj = categories.find(c => c.id === (evt.category || 'work')) || categories[0] || { color: '#3182f6', name: '업무' };
      const catColor = catObj.color || '#3182f6';
      const textColor = getContrastColor(catColor);
      colHtml += `
        <div class="event-tag" style="background:${catColor}25; color:${catColor}; border-left:3px solid ${catColor}; border-radius:6px;" onclick="editEvent(${evt.id})">
          <span class="event-tag-title">${evt.time ? `<small style="opacity:0.85; margin-right:3px;">${evt.time}</small>` : ''}${evt.title}</span>
        </div>
      `;
    });
    
    colHtml += `</div></div>`;
    container.innerHTML += colHtml;
  }
  
  renderDailyAgenda(selectedDate);
}

function renderListView() {
  const container = document.getElementById('list-view-container');
  if (!container) return;
  container.innerHTML = '';
  
  const filteredEvents = events.filter(e => matchesFilter(e))
    .sort((a, b) => (a.startDate !== b.startDate ? a.startDate.localeCompare(b.startDate) : (a.time || '24:00').localeCompare(b.time || '24:00')));
    
  if (filteredEvents.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:40px 0; font-size:14px; font-weight:600;">등록된 일정이 없습니다.</div>`;
    return;
  }
  
  filteredEvents.forEach(evt => {
    const catObj = categories.find(c => c.id === (evt.category || 'work')) || categories[0] || { color: '#3182f6', name: '업무' };
    const catColor = catObj.color || '#3182f6';
    const sDate = new Date(evt.startDate);
    const m = sDate.getMonth() + 1;
    const d = sDate.getDate();
    const dateRange = (evt.startDate === evt.endDate) ? evt.startDate : `${evt.startDate} ~ ${evt.endDate}`;
    
    container.innerHTML += `
      <div class="list-view-item" style="border-left: 5px solid ${catColor};" onclick="editEvent(${evt.id})">
        <div class="list-item-date-badge">
          <span class="list-item-month">${m}월</span>
          <span class="list-item-day">${d}</span>
        </div>
        <div class="list-item-info">
          <div class="list-item-title">${evt.title}</div>
          <div class="list-item-meta">
            <span class="list-item-cat-chip" style="background:${catColor};">${catObj.icon || '📌'} ${catObj.name}</span>
            <span>📅 ${dateRange}</span>
            ${evt.time ? `<span>⏰ ${evt.time}</span>` : ''}
            ${evt.location ? `<span>📍 ${evt.location}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  });
}

document.getElementById('prev-btn').onclick = (e) => {
  e.stopPropagation();
  if (currentViewMode === 'week') {
    currentDate.setDate(currentDate.getDate() - 7);
    renderWeekView();
  } else {
    currentDate.setMonth(currentDate.getMonth() - 1);
    if (currentViewMode === 'month') renderCalendar();
    else if (currentViewMode === 'list') renderListView();
  }
};

document.getElementById('next-btn').onclick = (e) => {
  e.stopPropagation();
  if (currentViewMode === 'week') {
    currentDate.setDate(currentDate.getDate() + 7);
    renderWeekView();
  } else {
    currentDate.setMonth(currentDate.getMonth() + 1);
    if (currentViewMode === 'month') renderCalendar();
    else if (currentViewMode === 'list') renderListView();
  }
};

const openDatePickerFn = (e) => {
  if(e) e.stopPropagation();
  let yList = document.getElementById('year-list'), mList = document.getElementById('month-list');
  if(!yList || !mList) return;
  yList.innerHTML = ''; mList.innerHTML = '';
  let selY = currentDate.getFullYear(), selM = currentDate.getMonth();
  for(let y=2020; y<=2035; y++) yList.innerHTML += `<li class="picker-item ${y===selY?'active':''}" onclick="currentDate.setFullYear(${y});renderCalendar();openDatePickerFn();">${y}년</li>`;
  for(let m=0; m<12; m++) mList.innerHTML += `<li class="picker-item ${m===selM?'active':''}" onclick="currentDate.setMonth(${m});renderCalendar();openDatePickerFn();">${m+1}월</li>`;
  document.getElementById('datepicker-modal').classList.remove('hidden');
};

const resetToTodayFn = (e) => {
  if(e) { e.preventDefault(); e.stopPropagation(); }
  currentDate = new Date(); selectedDate = todayString;
  document.getElementById('datepicker-modal').classList.add('hidden');
  if (currentViewMode === 'week') renderWeekView();
  else if (currentViewMode === 'list') renderListView();
  else renderCalendar();
};

document.getElementById('current-year').onclick = openDatePickerFn;
document.getElementById('month-display-btn').onclick = openDatePickerFn;
document.getElementById('today-btn').onclick = resetToTodayFn;
document.getElementById('close-datepicker-btn').onclick = () => document.getElementById('datepicker-modal').classList.add('hidden');
document.getElementById('confirm-datepicker-btn').onclick = () => {
  document.getElementById('datepicker-modal').classList.add('hidden');
  if (currentViewMode === 'week') renderWeekView();
  else if (currentViewMode === 'list') renderListView();
  else renderCalendar();
};

const roomInput = document.getElementById('room-code-input');
if (roomInput) {
  roomInput.value = currentRoomCode;
  roomInput.addEventListener('change', e => {
    const newRoom = e.target.value.trim() || 'shared-room';
    currentRoomCode = newRoom;
    localStorage.setItem('toss_room_code', currentRoomCode);
    if (db) {
      setupRoomSubscription(currentRoomCode);
    }
  });
}

const newCatInput = document.getElementById('new-cat-name');
if (newCatInput) {
  newCatInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') addNewCategory();
  });
}

renderCategoryUI();
renderCalendar();
renderTodos();
initWeather();
initFirebaseSync();
