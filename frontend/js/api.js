/**
 * @file        api.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Cliente HTTP centralizado del frontend. Todas las peticiones a
 *              la API pasan por este módulo, el cual se encarga de:
 *              - Adjuntar automáticamente el token JWT Bearer en cada petición.
 *              - Detectar expiración del access token (HTTP 403) y renovarlo de
 *                forma transparente mediante el refresh token, sin interrumpir
 *                la sesión del usuario.
 *              - Encolar peticiones concurrentes mientras la renovación está en
 *                curso y reenviarlas con el nuevo token una vez obtenido.
 *              - Emitir el evento global `auth:logout` cuando la sesión no puede
 *                recuperarse, para que la aplicación redirija al login.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

// Leemos la URL base de la API desde el archivo de configuración
const API_BASE = window.APP_CONFIG?.apiBase || 'http://localhost:3001/api';

// Esta variable nos dice si ya hay un proceso de refresco en curso
// para no intentar refrescar dos veces al mismo tiempo
let _isRefreshing = false;

// Si llegan varias peticiones al mismo tiempo con el token vencido,
// las ponemos en espera hasta que tengamos un token nuevo
let _pendingQueue = [];

// Esta función resuelve o rechaza todas las peticiones que estaban esperando
function _processQueue(error, token = null) {
  _pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  // Vaciamos la cola después de procesarla
  _pendingQueue = [];
}

/**
 * Función principal de peticiones HTTP.
 *
 * @param {string}  endpoint - La ruta del endpoint, por ejemplo '/auth/login'
 * @param {object}  opts     - Opciones de fetch (method, body, etc.)
 * @param {boolean} auth     - Si es true, agrega el token JWT al header (por defecto true)
 * @param {boolean} _retry   - Flag interno para evitar loops infinitos al refrescar
 */
async function request(endpoint, opts = {}, auth = true, _retry = false) {
  // Preparamos los headers base con el tipo de contenido JSON
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };

  // Si la ruta necesita autenticación, agregamos el token del sessionStorage
  if (auth) {
    const token = sessionStorage.getItem('accessToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  // Hacemos la petición con fetch
  const response = await fetch(`${API_BASE}${endpoint}`, { ...opts, headers });

  // Si el servidor responde 403, significa que el access token venció
  // Intentamos renovarlo automáticamente con el refresh token
  if (response.status === 403 && !_retry) {

    if (_isRefreshing) {
      // Si ya hay un refresco en curso, ponemos esta petición en la cola
      // y esperamos a que llegue el nuevo token
      return new Promise((resolve, reject) => {
        _pendingQueue.push({ resolve, reject });
      }).then(newToken => {
        // Cuando llegue el nuevo token, reintentamos la petición original
        headers['Authorization'] = `Bearer ${newToken}`;
        return fetch(`${API_BASE}${endpoint}`, { ...opts, headers });
      }).then(r => _parseResponse(r));
    }

    _isRefreshing = true;
    try {
      const refreshToken = sessionStorage.getItem('refreshToken');
      if (!refreshToken) throw new Error('No hay refresh token guardado.');

      // Llamamos al endpoint de refresco con el refresh token
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!refreshRes.ok) throw new Error('No se pudo renovar la sesión.');

      // Guardamos los nuevos tokens en sessionStorage
      const { data } = await refreshRes.json();
      sessionStorage.setItem('accessToken',  data.accessToken);
      sessionStorage.setItem('refreshToken', data.refreshToken);

      // Liberamos todas las peticiones que estaban esperando
      _processQueue(null, data.accessToken);

      // Reintentamos la petición original con el nuevo token
      return request(endpoint, opts, auth, true);

    } catch (err) {
      // Si no se pudo refrescar, cerramos sesión y mandamos al login
      _processQueue(err);
      sessionStorage.clear();
      window.dispatchEvent(new CustomEvent('auth:logout'));
      throw new Error('La sesión expiró. Por favor volvé a iniciar sesión.');
    } finally {
      _isRefreshing = false;
    }
  }

  // Si el servidor responde 401, el usuario no está autenticado en absoluto
  // Lo mandamos al login
  if (response.status === 401) {
    sessionStorage.clear();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error('Se requiere autenticación.');
  }

  // Para cualquier otro caso, procesamos la respuesta normalmente
  return _parseResponse(response);
}

// Procesa la respuesta: convierte a JSON y lanza un error si el status no es 2xx
async function _parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error || data?.message || `La petición falló (${response.status})`;
    const err = new Error(msg);
    err.status  = response.status;
    err.details = data?.details; // detalles de validación del servidor si los hay
    throw err;
  }
  return data;
}

// ─── Métodos de conveniencia ──────────────────────────────────────────────────
// En lugar de llamar request() con todos los parámetros, usamos estos atajos

const api = {
  // GET: para obtener datos
  get: (url, opts) => request(url, { ...opts, method: 'GET' }),

  // POST: para enviar datos protegidos (necesita token)
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),

  // POST público: para login y registro que no necesitan token
  postPublic: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }, false),
};

// Lo ponemos en window para que todos los demás archivos JS lo puedan usar
window.api = api;
