/**
 * @file        server.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Punto de entrada del servidor. Carga variables de entorno,
 *              importa la aplicación Express configurada e inicia la escucha
 *              en el puerto definido.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

require('dotenv').config();

const app  = require('./src/app');
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\nBanking API corriendo en el puerto ${PORT}`);
  console.log(`Documentación Swagger: http://localhost:${PORT}/api/docs`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});
