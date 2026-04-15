/**
 * @file        dashboard.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Módulo del panel de usuario. Implementado como IIFE para
 *              encapsular el estado interno y exponer únicamente la interfaz
 *              pública necesaria. Gestiona:
 *              - Visualización del perfil y animación de saldo con easing
 *                ease-out-cubic usando `requestAnimationFrame`.
 *              - Flujo de transferencia en 3 pasos: búsqueda de destinatario,
 *                ingreso de monto y pantalla de confirmación.
 *              - Historial paginado de transacciones con búsqueda debounced
 *                (300 ms) y paginación dinámica.
 *              - Navegación entre vistas (overview, transferencia, historial)
 *                sin recarga de página.
 *              - Sistema de notificaciones toast con animación de entrada/salida.
 *              - Sanitización de contenido dinámico con `escapeHtml()` para
 *                prevenir ataques XSS.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

const Dashboard = (() => {

  // ─── Variables de estado ──────────────────────────────────────────────────
  // Guardamos el usuario actual y el destinatario elegido entre funciones

  let currentUser   = null; // datos del usuario logueado
  let recipient     = null; // destinatario seleccionado en el formulario de transferencia
  let historyPage   = 1;    // página actual del historial
  let historySearch = '';   // texto de búsqueda actual

  // ─── Funciones de formato ─────────────────────────────────────────────────

  // Formatea un número como moneda en dólares: 1500 → "$1,500.00"
  function fmtMoney(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  // Formatea una fecha ISO a un formato legible: "Apr 15, 2026, 03:00 PM"
  function fmtDate(iso) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  }

  // Devuelve el saludo según la hora del día
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  // ─── Notificaciones toast ─────────────────────────────────────────────────
  // Los toasts son esos mensajitos que aparecen en la esquina y desaparecen solos

  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    container.appendChild(t);

    // Al hacer click en el toast también lo cerramos
    t.addEventListener('click', () => dismiss(t));

    // Se cierra automáticamente después de 4 segundos
    setTimeout(() => dismiss(t), 4000);

    function dismiss(el) {
      el.classList.add('exit'); // activamos la animación de salida
      setTimeout(() => el.remove(), 250); // borramos el elemento después de la animación
    }
  }

  // ─── Estado de carga en botones ───────────────────────────────────────────

  function setLoading(btn, loading) {
    if (!btn) return;
    const text    = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled  = loading;
    text?.classList.toggle('hidden', loading);
    spinner?.classList.toggle('hidden', !loading);
  }

  // ─── Información del usuario en la barra superior ─────────────────────────

  function populateTopbar(user) {
    currentUser = user;
    document.getElementById('greeting-time').textContent      = greeting();
    document.getElementById('greeting-name').textContent      = user.full_name.split(' ')[0]; // solo el primer nombre
    document.getElementById('topbar-account-num').textContent = user.account_number;
  }

  // ─── Animación del saldo ──────────────────────────────────────────────────
  // En lugar de que el número aparezca de golpe, lo animamos contando desde 0
  // Esto le da una sensación más dinámica al dashboard

  function animateBalance(targetAmount) {
    const el        = document.getElementById('balance-display');
    const duration  = 800; // duración de la animación en milisegundos
    const startTime = performance.now();

    function update(now) {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1); // va de 0 a 1
      // Easing ease-out-cubic: empieza rápido y frena al final
      const eased    = 1 - Math.pow(1 - progress, 3);
      el.textContent = fmtMoney(eased * targetAmount);
      // Seguimos animando mientras no lleguemos al 100%
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update); // arrancamos el loop de animación
  }

  // Llama a la API para obtener el saldo actualizado y lo muestra animado
  async function refreshBalance() {
    try {
      const res = await api.get('/account/profile');
      currentUser = res.data;
      animateBalance(res.data.balance);
      document.getElementById('balance-account').textContent = res.data.account_number;
      // Actualizamos también el usuario guardado en sessionStorage para que esté al día
      sessionStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ─── Renderizado de un ítem de transacción ────────────────────────────────

  function renderTxItem(tx, userId) {
    // Determinamos si esta transacción es un envío o una recepción para este usuario
    const isSent = tx.sender.id === userId;
    const party  = isSent ? tx.receiver : tx.sender; // la otra persona
    const sign   = isSent ? '-' : '+';
    const cls    = isSent ? 'sent' : 'received';
    const icon   = isSent ? '↑' : '↓';

    const item = document.createElement('div');
    item.className = 'tx-item';
    // Construimos el HTML del ítem de forma dinámica
    item.innerHTML = `
      <div class="tx-icon ${cls}">${icon}</div>
      <div class="tx-body">
        <p class="tx-name">${isSent ? 'Para: ' : 'De: '}${escapeHtml(party.full_name)}</p>
        ${tx.description ? `<p class="tx-desc">${escapeHtml(tx.description)}</p>` : ''}
        <p class="tx-date">${fmtDate(tx.created_at)}</p>
      </div>
      <span class="tx-amount ${cls}">${sign}${fmtMoney(tx.amount)}</span>
    `;
    return item;
  }

  // Escapamos el HTML para evitar ataques XSS (si alguien pone código en el nombre)
  // Creamos un elemento temporal, le asignamos como texto (no HTML) y leemos el innerHTML escapado
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Muestra un mensaje cuando no hay transacciones para mostrar
  function showEmptyState(container, message = 'Aún no hay transacciones.') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>${message}</p>
      </div>`;
  }

  // ─── Transacciones recientes en el Overview ───────────────────────────────

  async function loadRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    try {
      // Pedimos solo las últimas 5 transacciones para la pantalla principal
      const res = await api.get('/transactions/history?page=1&limit=5');
      const { transactions } = res.data;
      container.innerHTML = ''; // limpiamos los skeletons de carga

      if (!transactions.length) { showEmptyState(container); return; }

      // Creamos y agregamos un elemento visual por cada transacción
      transactions.forEach(tx => {
        container.appendChild(renderTxItem(tx, currentUser.id));
      });
    } catch (err) {
      container.innerHTML = '';
      toast(err.message, 'error');
    }
  }

  // ─── Vista de historial completo ──────────────────────────────────────────

  async function loadHistory(page = 1) {
    historyPage = page;
    const container  = document.getElementById('history-list');
    const pagination = document.getElementById('pagination');

    // Mientras carga, mostramos los skeletons animados
    container.innerHTML = `
      <div class="tx-skeleton"></div>
      <div class="tx-skeleton"></div>
      <div class="tx-skeleton"></div>`;

    try {
      const res = await api.get(`/transactions/history?page=${page}&limit=15`);
      const { transactions, pagination: pag } = res.data;
      container.innerHTML = '';

      // Filtramos las transacciones en el cliente si hay un texto de búsqueda activo
      const filtered = historySearch
        ? transactions.filter(tx =>
            tx.sender.full_name.toLowerCase().includes(historySearch) ||
            tx.receiver.full_name.toLowerCase().includes(historySearch) ||
            (tx.description || '').toLowerCase().includes(historySearch)
          )
        : transactions;

      if (!filtered.length) {
        showEmptyState(container, historySearch ? 'No se encontraron transacciones.' : 'Aún no hay transacciones.');
        pagination.innerHTML = '';
        return;
      }

      filtered.forEach(tx => container.appendChild(renderTxItem(tx, currentUser.id)));
      renderPagination(pagination, pag.page, pag.totalPages);
    } catch (err) {
      container.innerHTML = '';
      toast(err.message, 'error');
    }
  }

  // Construye los botones de paginación dinámicamente
  function renderPagination(container, current, total) {
    container.innerHTML = '';
    if (total <= 1) return; // si hay una sola página, no mostramos nada

    // Función interna para crear un botón de página
    const makeBtn = (label, page, disabled = false, active = false) => {
      const btn = document.createElement('button');
      btn.className = `page-btn${active ? ' active' : ''}`;
      btn.textContent = label;
      btn.disabled = disabled;
      if (!disabled) btn.addEventListener('click', () => loadHistory(page));
      return btn;
    };

    // Botón anterior
    container.appendChild(makeBtn('←', current - 1, current === 1));

    // Botones numerados (con "..." si hay muchas páginas)
    for (let i = 1; i <= total; i++) {
      if (total <= 7 || Math.abs(i - current) <= 2 || i === 1 || i === total) {
        container.appendChild(makeBtn(i, i, false, i === current));
      } else if (Math.abs(i - current) === 3) {
        // Mostramos puntos suspensivos en vez de todos los números
        const dots = document.createElement('span');
        dots.textContent = '…';
        dots.style.color = 'var(--text-muted)';
        container.appendChild(dots);
      }
    }

    // Botón siguiente
    container.appendChild(makeBtn('→', current + 1, current === total));
  }

  // ─── Flujo de transferencia en 3 pasos ───────────────────────────────────

  // Muestra solo el paso indicado y oculta los demás
  function showStep(stepId) {
    document.querySelectorAll('.transfer-step').forEach(s => s.classList.remove('active'));
    document.getElementById(stepId)?.classList.add('active');
  }

  function initTransferFlow() {
    const lookupBtn   = document.getElementById('lookup-btn');
    const reviewBtn   = document.getElementById('review-btn');
    const editBtn     = document.getElementById('edit-transfer-btn');
    const sendBtn     = document.getElementById('send-btn');
    const recipInput  = document.getElementById('transfer-recipient');
    const amountInput = document.getElementById('transfer-amount');

    // ── Paso 1: Buscar al destinatario ────────────────────────────────────
    lookupBtn?.addEventListener('click', async () => {
      const identifier = recipInput.value.trim();
      const errEl      = document.getElementById('recipient-err');
      errEl.textContent = '';

      if (!identifier) { errEl.textContent = 'Por favor ingresá un correo o número de cuenta.'; return; }

      setLoading(lookupBtn, true);
      try {
        // Llamamos a la API para buscar al destinatario
        const res = await api.get(`/account/find?identifier=${encodeURIComponent(identifier)}`);
        recipient = res.data;

        // No se puede enviar dinero a uno mismo
        if (recipient.id === currentUser.id) {
          errEl.textContent = 'No podés enviarte dinero a vos mismo.';
          recipient = null;
          return;
        }

        // Mostramos una tarjeta con los datos del destinatario para confirmar
        const preview = document.getElementById('recipient-preview');
        document.getElementById('rec-avatar').textContent      = recipient.full_name[0].toUpperCase(); // primera letra del nombre
        document.getElementById('rec-name').textContent        = recipient.full_name;
        document.getElementById('rec-account-num').textContent = recipient.account_number;
        preview.classList.remove('hidden');

        // Avanzamos automáticamente al paso 2 después de un momento
        setTimeout(() => showStep('step-amount'), 600);
        amountInput?.focus(); // ponemos el cursor en el campo del monto

      } catch (err) {
        recipient = null;
        document.getElementById('recipient-preview').classList.add('hidden');
        errEl.textContent = err.message;
      } finally {
        setLoading(lookupBtn, false);
      }
    });

    // También se puede buscar presionando Enter en el campo de destinatario
    recipInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookupBtn.click(); } });

    // ── Paso 2: Revisar el monto antes de confirmar ───────────────────────
    reviewBtn?.addEventListener('click', () => {
      const amount = parseFloat(amountInput.value);
      const errEl  = document.getElementById('amount-err');
      errEl.textContent = '';

      // Validamos el monto en el frontend antes de ir al siguiente paso
      if (!amount || amount <= 0) { errEl.textContent = 'Ingresá un monto mayor a $0.00.'; return; }
      if (amount > currentUser.balance) {
        errEl.textContent = `Saldo insuficiente. Tenés ${fmtMoney(currentUser.balance)}.`;
        return;
      }

      const description  = document.getElementById('transfer-desc').value.trim();
      const balanceAfter = currentUser.balance - amount; // calculamos el saldo que quedaría

      // Llenamos el resumen de confirmación con los datos de la transferencia
      document.getElementById('conf-name').textContent          = recipient.full_name;
      document.getElementById('conf-amount').textContent        = fmtMoney(amount);
      document.getElementById('conf-desc').textContent          = description || '—';
      document.getElementById('conf-balance-after').textContent = fmtMoney(balanceAfter);

      showStep('step-confirm'); // pasamos al paso de confirmación
    });

    // Botón para volver al paso del monto si queremos editar
    editBtn?.addEventListener('click', () => showStep('step-amount'));

    // ── Paso 3: Confirmar y enviar ────────────────────────────────────────
    sendBtn?.addEventListener('click', async () => {
      const amount      = parseFloat(amountInput.value);
      const description = document.getElementById('transfer-desc').value.trim();
      const errEl       = document.getElementById('transfer-error');
      errEl.classList.add('hidden'); // ocultamos errores anteriores

      setLoading(sendBtn, true);
      try {
        // Llamamos a la API para hacer la transferencia real
        const res = await api.post('/transactions/transfer', {
          recipientIdentifier: recipient.account_number,
          amount,
          description,
        });

        // Actualizamos el saldo y las transacciones recientes en el overview
        await refreshBalance();
        await loadRecentTransactions();

        // Mostramos el overlay de éxito con la animación del check
        document.getElementById('success-title').textContent   = '¡Transferencia enviada!';
        document.getElementById('success-message').textContent = res.message;
        document.getElementById('success-overlay').classList.remove('hidden');

        // Limpiamos el formulario para la próxima transferencia
        resetTransferForm();

      } catch (err) {
        // Si la transferencia falló, mostramos el error en el formulario
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        setLoading(sendBtn, false);
      }
    });
  }

  // Limpia todos los campos del formulario de transferencia para empezar de nuevo
  function resetTransferForm() {
    recipient = null;
    document.getElementById('transfer-recipient').value = '';
    document.getElementById('transfer-amount').value    = '';
    document.getElementById('transfer-desc').value      = '';
    document.getElementById('recipient-preview').classList.add('hidden');
    document.getElementById('recipient-err').textContent  = '';
    document.getElementById('amount-err').textContent     = '';
    document.getElementById('transfer-error').classList.add('hidden');
    showStep('step-recipient'); // volvemos al primer paso
  }

  // ─── Navegación entre vistas ──────────────────────────────────────────────

  function navigateTo(viewName) {
    // Ocultamos todas las vistas y links activos
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));

    // Mostramos la vista y el link de navegación correspondientes
    const view    = document.getElementById(`view-${viewName}`);
    const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    view?.classList.add('active');
    navItem?.classList.add('active');

    // Si el usuario va al historial, lo cargamos desde la página 1
    if (viewName === 'history') loadHistory(1);
  }

  function initNavigation() {
    // Ponemos listeners en todos los links de navegación
    document.querySelectorAll('.nav-item, .btn-action, .view-all-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault(); // prevenimos que el link recargue la página
        const view = el.dataset.view;
        if (view) navigateTo(view);
        // En móvil cerramos el menú lateral después de navegar
        document.querySelector('.sidebar')?.classList.remove('open');
      });
    });

    // Botón de hamburguesa para abrir/cerrar el menú en móvil
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('open');
    });
  }

  // ─── Búsqueda en el historial ─────────────────────────────────────────────

  function initSearch() {
    const input = document.getElementById('tx-search');
    if (!input) return;

    // Usamos debounce para no llamar a loadHistory en cada letra que se escribe
    // Esperamos 300ms desde el último cambio antes de filtrar
    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        historySearch = input.value.toLowerCase().trim();
        loadHistory(1); // volvemos a la primera página con el nuevo filtro
      }, 300);
    });
  }

  // ─── Overlay de éxito ────────────────────────────────────────────────────

  function initSuccessOverlay() {
    // Al presionar "Listo" cerramos el overlay y volvemos al overview
    document.getElementById('success-close')?.addEventListener('click', () => {
      document.getElementById('success-overlay').classList.add('hidden');
      navigateTo('overview');
    });
  }

  // ─── Botón de cerrar sesión ───────────────────────────────────────────────

  function initLogout() {
    document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());
  }

  // ─── Función de arranque del dashboard ───────────────────────────────────
  // Esta función se llama cuando el usuario se loguea exitosamente

  async function init(user) {
    populateTopbar(user);   // nombre y número de cuenta arriba
    initNavigation();       // links del sidebar
    initTransferFlow();     // formulario de transferencia en 3 pasos
    initSearch();           // búsqueda en el historial
    initSuccessOverlay();   // overlay de éxito
    initLogout();           // botón de cerrar sesión

    // Cargamos los datos iniciales del overview
    await refreshBalance();
    await loadRecentTransactions();
  }

  // Solo exponemos lo que necesitan los demás módulos
  return { init, refreshBalance, toast, navigateTo };

})();

window.Dashboard = Dashboard;
