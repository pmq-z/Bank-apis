/**
 * @file        config.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Configuración global del frontend. Define la URL base de la API
 *              para que todos los demás módulos la consuman desde un único lugar.
 *              En producción, reemplazar el valor de `apiBase` por la URL del
 *              servidor desplegado (p.ej. Render, Railway, etc.).
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

// Acá definimos la URL base de la API para que todos los demás archivos la usen.
//
// En desarrollo apuntamos al servidor local.
// Cuando subamos el proyecto a producción, cambiamos esta URL por la de Render
// (por ejemplo: 'https://nexbank-api.onrender.com/api')
window.APP_CONFIG = {
  apiBase: 'http://localhost:3001/api',
};
