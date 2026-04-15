/**
 * @file        app.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Punto de entrada de la Single Page Application (SPA) del usuario.
 *              Responsabilidades principales:
 *              - Guardia de ruta: verifica si existe una sesión activa en
 *                `sessionStorage` al cargar la página y muestra la pantalla
 *                correspondiente (login o dashboard).
 *              - Coordinación de transiciones animadas entre pantallas mediante
 *                `requestAnimationFrame` para garantizar que el navegador
 *                aplique las transiciones CSS correctamente.
 *              - Escucha de los eventos globales `auth:login` y `auth:logout`
 *                emitidos por `auth.js` y `api.js` para reaccionar a cambios
 *                en el estado de sesión sin acoplamiento directo entre módulos.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

// Si por alguna razón config.js no se cargó, ponemos una URL por defecto
// El operador || asigna el valor de la derecha solo si el de la izquierda es falso/null
window.APP_CONFIG = window.APP_CONFIG || {
  apiBase: 'http://localhost:3001/api',
};

// ─── Función para cambiar de pantalla ────────────────────────────────────────
// Las pantallas son los divs con la clase "screen" (auth-screen y dashboard-screen)

function showScreen(id) {
  // Primero quitamos la clase 'active' de todas las pantallas
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  const target = document.getElementById(id);
  if (target) {
    // Usamos dos requestAnimationFrame anidados para que el navegador pinte primero
    // el estado sin la clase 'active' y luego aplique la transición de entrada.
    // Si lo hacemos en el mismo frame, no habría animación.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => target.classList.add('active'));
    });
  }
}

// ─── Arranque de la aplicación ────────────────────────────────────────────────
// DOMContentLoaded espera a que el HTML esté listo antes de ejecutar el código

document.addEventListener('DOMContentLoaded', () => {

  // Siempre inicializamos los formularios de autenticación aunque el usuario ya esté logueado
  Auth.init();

  // Revisamos si hay una sesión activa guardada en sessionStorage
  if (Auth.isAuthenticated()) {
    // Si ya hay sesión, mostramos el dashboard directamente
    const user = Auth.getUser();
    showScreen('dashboard-screen');
    Dashboard.init(user);
  } else {
    // Si no hay sesión, mostramos la pantalla de login
    showScreen('auth-screen');
  }

  // ─── Escuchamos los eventos de autenticación ──────────────────────────────
  // Estos eventos los emiten auth.js y api.js cuando el estado de sesión cambia

  // Cuando el usuario se loguea exitosamente
  window.addEventListener('auth:login', (e) => {
    const user = e.detail; // los datos del usuario vienen en el evento
    showScreen('dashboard-screen');
    Dashboard.init(user);
  });

  // Cuando el usuario cierra sesión (o la sesión expira sin poder renovarse)
  window.addEventListener('auth:logout', () => {
    Auth.clearSession();
    showScreen('auth-screen');

    // Reseteamos la navegación del dashboard al overview para la próxima sesión
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-overview')?.classList.add('active');
  });

});
