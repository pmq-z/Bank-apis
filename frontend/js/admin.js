/**
 * @file        admin.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Módulo de la Single Page Application del panel de administración.
 *              Completamente independiente del módulo de usuario (`auth.js`,
 *              `dashboard.js`); utiliza `localStorage` en lugar de
 *              `sessionStorage` para persistir la sesión entre pestañas.
 *              Funcionalidades principales:
 *              - Login con verificación del flag `is_admin` en la respuesta JWT.
 *              - Cliente HTTP propio (`adminFetch`) con renovación silenciosa
 *                de tokens y cierre de sesión automático ante errores 401/403
 *                irrecuperables.
 *              - Carga de estadísticas globales del sistema en tiempo real.
 *              - Tablas paginadas de transacciones y usuarios con búsqueda
 *                debounced (350 ms).
 *              - Sanitización XSS mediante `escapeHtml()` en todo contenido
 *                dinámico insertado en el DOM.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

// URL base de la API (viene de config.js)
const API = window.APP_CONFIG?.apiBase || 'http://localhost:3001/api';

// ─── Estado de la aplicación admin ───────────────────────────────────────────
let adminUser       = null;
let txPage          = 1;
let usersPage       = 1;
let txSearchTerm    = '';
let usersSearchTerm = '';

// ─── Helpers de sesión (guardamos los tokens del admin separados del usuario normal) ──
// Usamos localStorage acá (en vez de sessionStorage) para que el admin
// no tenga que loguearse cada vez que abre la pestaña
function saveAdminSession(data) {
  localStorage.setItem('adminAccessToken',  data.accessToken);
  localStorage.setItem('adminRefreshToken', data.refreshToken);
  localStorage.setItem('adminUser',         JSON.stringify(data.user));
}

function clearAdminSession() {
  localStorage.removeItem('adminAccessToken');
  localStorage.removeItem('adminRefreshToken');
  localStorage.removeItem('adminUser');
}

function getAdminUser() {
  try { return JSON.parse(localStorage.getItem('adminUser')); } catch { return null; }
}

function isAdminLoggedIn() {
  return !!localStorage.getItem('adminAccessToken') && !!getAdminUser()?.is_admin;
}

// ─── Cliente HTTP del admin ───────────────────────────────────────────────────
// Similar al api.js del usuario normal, pero usando los tokens del admin

async function adminFetch(endpoint, opts = {}) {
  const token = localStorage.getItem('adminAccessToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };

  const res = await fetch(`${API}${endpoint}`, { ...opts, headers });

  // Si el token del admin expiró, intentamos renovarlo
  if (res.status === 403) {
    const refreshToken = localStorage.getItem('adminRefreshToken');
    if (!refreshToken) { handleAdminLogout(); return; }

    const refreshRes = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshRes.ok) { handleAdminLogout(); return; }

    const { data } = await refreshRes.json();
    localStorage.setItem('adminAccessToken',  data.accessToken);
    localStorage.setItem('adminRefreshToken', data.refreshToken);

    // Reintentamos la petición original con el nuevo token
    return adminFetch(endpoint, opts);
  }

  if (res.status === 401) { handleAdminLogout(); return; }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(iso) {
  return new Intl.DateTimeFormat('es-AR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ─── Toast (reutilizamos el mismo estilo del panel de usuario) ────────────────

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  t.addEventListener('click', () => dismiss(t));
  setTimeout(() => dismiss(t), 4000);
  function dismiss(el) {
    el.classList.add('exit');
    setTimeout(() => el.remove(), 250);
  }
}

// ─── Cambio de pantalla entre login y panel ───────────────────────────────────

function showAdminScreen(id) {
  document.querySelectorAll('.admin-screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => target?.classList.add('active'));
  });
}

// ─── Navegación entre secciones del panel ────────────────────────────────────

function navigateTo(sectionName) {
  // Ocultamos todas las secciones y desactivamos los links
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(a => a.classList.remove('active'));

  // Activamos la sección y el link correspondientes
  document.getElementById(`section-${sectionName}`)?.classList.add('active');
  document.querySelector(`.admin-nav-item[data-section="${sectionName}"]`)?.classList.add('active');

  // Cargamos los datos de la sección si es necesario
  if (sectionName === 'transactions') loadTransactions(1);
  if (sectionName === 'users')        loadUsers(1);
}

// ─── Carga de estadísticas ────────────────────────────────────────────────────

async function loadStats() {
  try {
    const res = await adminFetch('/admin/stats');
    const { totalUsers, totalTransactions, totalVolume } = res.data;

    document.getElementById('stat-users').textContent        = totalUsers.toLocaleString();
    document.getElementById('stat-transactions').textContent = totalTransactions.toLocaleString();
    document.getElementById('stat-volume').textContent       = fmtMoney(totalVolume);
  } catch (err) {
    toast('No se pudieron cargar las estadísticas.', 'error');
  }
}

// ─── Carga de transacciones recientes para el overview ───────────────────────

async function loadOverviewTransactions() {
  const container = document.getElementById('overview-tx-list');
  try {
    const res = await adminFetch('/admin/transactions?page=1&limit=10');
    const { transactions } = res.data;
    container.innerHTML = '';

    if (!transactions.length) {
      container.innerHTML = '<p class="table-loading">No hay transacciones todavía.</p>';
      return;
    }

    // Creamos una tabla pequeña para el overview
    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = `
      <thead><tr>
        <th>Fecha</th><th>Remitente</th><th>Destinatario</th><th>Monto</th><th>Estado</th>
      </tr></thead>
    `;
    const tbody = document.createElement('tbody');
    transactions.forEach(tx => tbody.appendChild(buildTxRow(tx)));
    table.appendChild(tbody);
    container.appendChild(table);
  } catch (err) {
    container.innerHTML = '<p class="table-loading">Error al cargar transacciones.</p>';
  }
}

// ─── Carga de la tabla completa de transacciones ──────────────────────────────

async function loadTransactions(page = 1) {
  txPage = page;
  const tbody      = document.getElementById('tx-tbody');
  const pagination = document.getElementById('tx-pagination');

  tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Cargando...</td></tr>';

  try {
    const params = new URLSearchParams({ page, limit: 20 });
    if (txSearchTerm) params.set('search', txSearchTerm);

    const res = await adminFetch(`/admin/transactions?${params}`);
    const { transactions, pagination: pag } = res.data;

    // Actualizamos el contador de resultados
    document.getElementById('tx-count-label').textContent =
      `${pag.total} transacción${pag.total !== 1 ? 'es' : ''}`;

    tbody.innerHTML = '';

    if (!transactions.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No se encontraron transacciones.</td></tr>';
      pagination.innerHTML = '';
      return;
    }

    transactions.forEach(tx => tbody.appendChild(buildTxRow(tx)));
    renderPagination(pagination, pag.page, pag.totalPages, loadTransactions);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">${err.message}</td></tr>`;
  }
}

// Construye una fila <tr> para una transacción
function buildTxRow(tx) {
  const tr = document.createElement('tr');
  const description = tx.description || '<span class="cell-muted">—</span>';
  tr.innerHTML = `
    <td>${fmtDate(tx.created_at)}</td>
    <td>
      <strong>${escapeHtml(tx.sender.full_name)}</strong><br>
      <small class="cell-muted">${escapeHtml(tx.sender.account_number)}</small>
    </td>
    <td>
      <strong>${escapeHtml(tx.receiver.full_name)}</strong><br>
      <small class="cell-muted">${escapeHtml(tx.receiver.account_number)}</small>
    </td>
    <td>${description}</td>
    <td class="amount-cell">${fmtMoney(tx.amount)}</td>
    <td><span class="status-badge ${tx.status}">${tx.status}</span></td>
  `;
  return tr;
}

// ─── Carga de la tabla de usuarios ───────────────────────────────────────────

async function loadUsers(page = 1) {
  usersPage = page;
  const tbody      = document.getElementById('users-tbody');
  const pagination = document.getElementById('users-pagination');

  tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Cargando...</td></tr>';

  try {
    const params = new URLSearchParams({ page, limit: 20 });
    if (usersSearchTerm) params.set('search', usersSearchTerm);

    const res = await adminFetch(`/admin/users?${params}`);
    const { users, pagination: pag } = res.data;

    document.getElementById('users-count-label').textContent =
      `${pag.total} usuario${pag.total !== 1 ? 's' : ''}`;

    tbody.innerHTML = '';

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No se encontraron usuarios.</td></tr>';
      pagination.innerHTML = '';
      return;
    }

    users.forEach(user => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(user.full_name)}</strong></td>
        <td>${escapeHtml(user.email)}</td>
        <td><code>${escapeHtml(user.account_number)}</code></td>
        <td class="amount-cell">${fmtMoney(user.balance)}</td>
        <td>${user.is_admin ? '<span class="admin-tag">ADMIN</span>' : '<span class="cell-muted">No</span>'}</td>
        <td>${fmtDate(user.created_at)}</td>
      `;
      tbody.appendChild(tr);
    });

    renderPagination(pagination, pag.page, pag.totalPages, loadUsers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">${err.message}</td></tr>`;
  }
}

// ─── Paginación reutilizable ─────────────────────────────────────────────────

function renderPagination(container, current, total, loadFn) {
  container.innerHTML = '';
  if (total <= 1) return;

  const makeBtn = (label, page, disabled = false, active = false) => {
    const btn = document.createElement('button');
    btn.className = `page-btn${active ? ' active' : ''}`;
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) btn.addEventListener('click', () => loadFn(page));
    return btn;
  };

  container.appendChild(makeBtn('←', current - 1, current === 1));
  for (let i = 1; i <= total; i++) {
    if (total <= 7 || Math.abs(i - current) <= 2 || i === 1 || i === total) {
      container.appendChild(makeBtn(i, i, false, i === current));
    } else if (Math.abs(i - current) === 3) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.color = 'var(--text-muted)';
      container.appendChild(dots);
    }
  }
  container.appendChild(makeBtn('→', current + 1, current === total));
}

// ─── Login del admin ──────────────────────────────────────────────────────────

function initAdminLogin() {
  const form = document.getElementById('admin-login-form');
  const btn  = document.getElementById('admin-login-btn');

  // Botón de mostrar/ocultar contraseña
  document.querySelectorAll('.eye-btn').forEach(eyeBtn => {
    eyeBtn.addEventListener('click', () => {
      const input = document.getElementById(eyeBtn.dataset.target);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      eyeBtn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const errEl    = document.getElementById('admin-login-error');
    errEl.classList.add('hidden');

    // Validación básica en el cliente
    if (!email || !password) {
      errEl.textContent = 'Por favor completá todos los campos.';
      errEl.classList.remove('hidden');
      return;
    }

    // Mostramos el spinner en el botón
    btn.disabled = true;
    btn.querySelector('.btn-text').classList.add('hidden');
    btn.querySelector('.btn-spinner').classList.remove('hidden');

    try {
      // Usamos el mismo endpoint de login que los usuarios normales
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Credenciales incorrectas.');
      }

      // Verificamos que el usuario que se logueó sea realmente un admin
      // Si no lo es, rechazamos el acceso aunque el login fuera exitoso
      if (!data.data.user.is_admin) {
        throw new Error('Esta cuenta no tiene privilegios de administrador.');
      }

      // Guardamos la sesión del admin y mostramos el panel
      saveAdminSession(data.data);
      adminUser = data.data.user;
      showAdminPanel();

    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-text').classList.remove('hidden');
      btn.querySelector('.btn-spinner').classList.add('hidden');
    }
  });
}

// ─── Inicializar el panel después del login ───────────────────────────────────

async function showAdminPanel() {
  // Mostramos el nombre del admin en la barra superior
  document.getElementById('admin-greeting').textContent =
    `Hola, ${adminUser.full_name.split(' ')[0]}`;

  showAdminScreen('admin-panel-screen');

  // Cargamos todo en paralelo para que sea más rápido
  await Promise.all([loadStats(), loadOverviewTransactions()]);
}

// ─── Cerrar sesión del admin ──────────────────────────────────────────────────

async function handleAdminLogout() {
  // Intentamos invalidar los tokens en el servidor
  try {
    const token = localStorage.getItem('adminAccessToken');
    if (token) {
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
    }
  } catch { /* si falla no importa, borramos la sesión igual */ }

  clearAdminSession();
  adminUser = null;
  showAdminScreen('admin-login-screen');
  toast('Sesión cerrada.', 'success');
}

// ─── Configurar la navegación del sidebar ────────────────────────────────────

function initNavigation() {
  document.querySelectorAll('.admin-nav-item, .view-all-link').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const section = el.dataset.section;
      if (section) navigateTo(section);
    });
  });

  document.getElementById('admin-logout-btn')?.addEventListener('click', handleAdminLogout);
}

// ─── Búsqueda con debounce en las tablas ─────────────────────────────────────

function initSearch() {
  // Búsqueda de transacciones
  let txTimer;
  document.getElementById('tx-search-admin')?.addEventListener('input', (e) => {
    clearTimeout(txTimer);
    txTimer = setTimeout(() => {
      txSearchTerm = e.target.value.trim();
      loadTransactions(1); // volvemos a la primera página con el nuevo filtro
    }, 350);
  });

  // Búsqueda de usuarios
  let usersTimer;
  document.getElementById('users-search-admin')?.addEventListener('input', (e) => {
    clearTimeout(usersTimer);
    usersTimer = setTimeout(() => {
      usersSearchTerm = e.target.value.trim();
      loadUsers(1);
    }, 350);
  });
}

// ─── Arranque de la aplicación admin ─────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initAdminLogin();
  initNavigation();
  initSearch();

  // Si ya hay una sesión de admin guardada en localStorage, mostramos el panel directamente
  if (isAdminLoggedIn()) {
    adminUser = getAdminUser();
    showAdminPanel();
  } else {
    showAdminScreen('admin-login-screen');
  }
});
