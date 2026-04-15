/**
 * @file        auth.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Módulo de autenticación del frontend. Implementa mediante el
 *              patrón IIFE (Immediately Invoked Function Expression) el manejo
 *              completo del ciclo de autenticación del usuario:
 *              - Inicio de sesión y registro con validación del lado del cliente.
 *              - Persistencia de tokens JWT en `sessionStorage`.
 *              - Medidor visual de fortaleza de contraseña.
 *              - Alternancia de pestañas Login / Registro sin recarga de página.
 *              - Emisión de eventos globales `auth:login` y `auth:logout` para
 *                comunicación entre módulos sin acoplamiento directo.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

const Auth = (() => {

  // ─── Manejo de sesión en sessionStorage ───────────────────────────────────
  // sessionStorage es como localStorage pero se borra al cerrar el navegador
  // Es más seguro para guardar tokens que localStorage

  // Guarda los tokens y los datos del usuario después de login/registro
  function saveSession({ accessToken, refreshToken, user }) {
    sessionStorage.setItem('accessToken',  accessToken);
    sessionStorage.setItem('refreshToken', refreshToken);
    // JSON.stringify convierte el objeto user a texto para guardarlo
    sessionStorage.setItem('user', JSON.stringify(user));
  }

  // Borra todo lo del sessionStorage (se usa al cerrar sesión)
  function clearSession() {
    sessionStorage.clear();
  }

  // Obtiene el usuario guardado. El try/catch es por si el JSON está corrupto
  function getUser() {
    try { return JSON.parse(sessionStorage.getItem('user')); } catch { return null; }
  }

  // Devuelve true si hay un token y un usuario guardados (usuario logueado)
  function isAuthenticated() {
    return !!sessionStorage.getItem('accessToken') && !!getUser();
  }

  // ─── Medidor de fortaleza de contraseña ───────────────────────────────────

  function evaluateStrength(password) {
    let score = 0;
    if (password.length >= 8)            score++; // longitud mínima
    if (password.length >= 12)           score++; // longitud buena
    if (/[A-Z]/.test(password))          score++; // tiene mayúscula
    if (/[0-9]/.test(password))          score++; // tiene número
    if (/[^A-Za-z0-9]/.test(password))   score++; // tiene símbolo especial

    // Colores del rojo (débil) al verde (fuerte)
    const colours = ['', '#f85149', '#d29922', '#2f81f7', '#3fb950', '#3fb950'];
    const widths  = ['0%', '20%', '40%', '60%', '80%', '100%'];
    return { width: widths[score], colour: colours[score] };
  }

  // ─── Validaciones del lado del cliente ───────────────────────────────────
  // Validamos antes de mandar al servidor para dar respuesta inmediata al usuario

  function validateLogin(email, password) {
    const errors = {};
    // Expresión regular básica para validar formato de email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Ingresá un correo válido.';
    if (!password) errors.password = 'La contraseña es requerida.';
    return errors;
  }

  function validateRegister(fullName, email, password) {
    const errors = {};
    if (!fullName || fullName.trim().length < 2) errors.fullName = 'El nombre debe tener al menos 2 caracteres.';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Ingresá un correo válido.';
    if (!password || password.length < 8)      errors.password = 'La contraseña debe tener al menos 8 caracteres.';
    else if (!/[A-Z]/.test(password))           errors.password = 'La contraseña necesita al menos una mayúscula.';
    else if (!/[0-9]/.test(password))           errors.password = 'La contraseña necesita al menos un número.';
    return errors;
  }

  // Muestra los mensajes de error debajo de cada campo del formulario
  // prefix es el prefijo del id, por ejemplo 'login' o 'reg'
  function showFieldErrors(errors, prefix) {
    // Primero limpiamos todos los errores anteriores del formulario
    document.querySelectorAll(`[id^="${prefix}-"][id$="-err"]`).forEach(el => {
      el.textContent = '';
      const input = document.getElementById(el.id.replace('-err', ''));
      input?.classList.remove('input-error'); // quitamos el borde rojo
    });

    // Luego mostramos los nuevos errores en cada campo correspondiente
    Object.entries(errors).forEach(([field, msg]) => {
      const errEl   = document.getElementById(`${prefix}-${field}-err`);
      const inputEl = document.getElementById(`${prefix}-${field}`);
      if (errEl)   { errEl.textContent = msg; }
      if (inputEl) { inputEl.classList.add('input-error'); } // borde rojo en el campo
    });
  }

  // Activa o desactiva el estado de carga en un botón
  // Muestra un spinner y deshabilita el botón mientras espera la respuesta
  function setLoading(btn, loading) {
    const text    = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled  = loading;
    text?.classList.toggle('hidden', loading);
    spinner?.classList.toggle('hidden', !loading);
  }

  // Muestra un mensaje de error general debajo del formulario
  // Se oculta automáticamente después de 6 segundos
  function showFormError(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 6000);
  }

  // ─── Cambio de pestaña (Login / Crear cuenta) ────────────────────────────

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab; // leemos qué pestaña se clickeó

        // Desactivamos todas las pestañas y formularios
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

        // Activamos solo la pestaña y formulario que se clickeó
        btn.classList.add('active');
        document.getElementById(`${tab}-form`)?.classList.add('active');
      });
    });
  }

  // ─── Botón para mostrar/ocultar contraseña ───────────────────────────────

  function initEyeToggles() {
    document.querySelectorAll('.eye-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Buscamos el input de contraseña al que pertenece este botón
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        // Alternamos entre 'password' (oculto) y 'text' (visible)
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
      });
    });
  }

  // ─── Barra de fortaleza de contraseña ────────────────────────────────────

  function initStrengthMeter() {
    const input = document.getElementById('reg-password');
    const bar   = document.getElementById('strength-bar');
    if (!input || !bar) return;

    // Cada vez que el usuario escribe, actualizamos el ancho y color de la barra
    input.addEventListener('input', () => {
      const { width, colour } = evaluateStrength(input.value);
      bar.style.width           = width;
      bar.style.backgroundColor = colour;
    });
  }

  // ─── Formulario de login ──────────────────────────────────────────────────

  function initLoginForm() {
    const form = document.getElementById('login-form');
    const btn  = document.getElementById('login-btn');
    if (!form) return;

    // Interceptamos el submit del formulario para manejarlo con JS (sin recargar la página)
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); // evitamos que el formulario recargue la página

      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      // Validamos antes de llamar a la API
      const errors = validateLogin(email, password);
      if (Object.keys(errors).length) { showFieldErrors(errors, 'login'); return; }
      showFieldErrors({}, 'login'); // limpiamos errores anteriores si la validación pasó

      setLoading(btn, true); // mostramos el spinner
      try {
        // Llamamos a la API de login (sin token porque todavía no estamos logueados)
        const res = await api.postPublic('/auth/login', { email, password });

        // Guardamos los tokens y datos del usuario en sessionStorage
        saveSession(res.data);

        // Emitimos un evento personalizado para que app.js sepa que el login fue exitoso
        window.dispatchEvent(new CustomEvent('auth:login', { detail: res.data.user }));
      } catch (err) {
        showFormError('login-error', err.message);
      } finally {
        setLoading(btn, false); // ocultamos el spinner siempre, haya éxito o error
      }
    });
  }

  // ─── Formulario de registro ───────────────────────────────────────────────

  function initRegisterForm() {
    const form = document.getElementById('register-form');
    const btn  = document.getElementById('register-btn');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullName = document.getElementById('reg-name').value.trim();
      const email    = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;

      const errors = validateRegister(fullName, email, password);
      if (Object.keys(errors).length) { showFieldErrors(errors, 'reg'); return; }
      showFieldErrors({}, 'reg');

      setLoading(btn, true);
      try {
        const res = await api.postPublic('/auth/register', { email, password, fullName });
        saveSession(res.data);
        window.dispatchEvent(new CustomEvent('auth:login', { detail: res.data.user }));
      } catch (err) {
        // Si el servidor mandó detalles de validación (campo por campo), los mostramos en cada input
        if (err.details) {
          const mapped = {};
          err.details.forEach(d => { mapped[d.field] = d.message; });
          showFieldErrors(mapped, 'reg');
        } else {
          // Si fue un error genérico (como email duplicado), lo mostramos abajo del formulario
          showFormError('register-error', err.message);
        }
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // ─── Cerrar sesión ────────────────────────────────────────────────────────

  async function logout() {
    // Intentamos notificar al servidor para que invalide los refresh tokens
    // Si falla no importa mucho, igual borramos la sesión local
    try { await api.post('/auth/logout', {}); } catch { /* no hacemos nada si falla */ }

    clearSession();
    // Avisamos a app.js que el usuario cerró sesión para que muestre el login
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  // ─── Inicialización ───────────────────────────────────────────────────────
  // Esta función configura todos los listeners del módulo de autenticación

  function init() {
    initTabs();
    initEyeToggles();
    initStrengthMeter();
    initLoginForm();
    initRegisterForm();
  }

  // Solo exponemos las funciones que necesitan los demás archivos
  return { init, logout, isAuthenticated, getUser, clearSession };

})();

// Hacemos que Auth sea accesible desde cualquier otro archivo JS
window.Auth = Auth;
