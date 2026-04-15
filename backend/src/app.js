/**
 * @file        app.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Configuración central de la aplicación Express. Registra
 *              middlewares de seguridad, CORS, parsing, rate-limiting,
 *              documentación Swagger y todas las rutas de la API.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const swaggerUi  = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authRoutes        = require('./routes/auth');
const accountRoutes     = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const adminRoutes       = require('./routes/admin');

const app   = express();
const isDev = process.env.NODE_ENV !== 'production';

// ─── Seguridad HTTP ──────────────────────────────────────────────────────────
// Helmet establece cabeceras HTTP que mitigan ataques comunes (XSS, clickjacking,
// MIME-sniffing, etc.) sin requerir configuración adicional.
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
// Lista blanca de orígenes cargada desde la variable de entorno ALLOWED_ORIGINS.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  /**
   * Función de validación de origen.
   * En desarrollo se permiten todos los orígenes locales (incluyendo `null`,
   * que aparece cuando el cliente abre archivos con el protocolo file://).
   * En producción sólo se aceptan los orígenes de la lista blanca.
   *
   * @param {string|undefined} origin - Origen de la petición.
   * @param {Function}         cb     - Callback de CORS (error, permitido).
   */
  origin(origin, cb) {
    if (isDev) {
      const localOrigins = !origin || origin === 'null'
        || origin.startsWith('http://localhost')
        || origin.startsWith('http://127.0.0.1');

      if (localOrigins || allowedOrigins.includes(origin)) return cb(null, true);
    }

    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);

    console.warn(`[CORS] Bloqueado: ${origin}`);
    cb(new Error(`CORS bloqueado para el origen: ${origin}`));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Parsing del cuerpo de la petición ──────────────────────────────────────
// Límite de 10 KB para prevenir ataques de payload excesivo.
app.use(express.json({ limit: '10kb' }));

// ─── Rate limiting global ────────────────────────────────────────────────────
// Máximo 100 peticiones por IP en una ventana de 15 minutos.
app.use(rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            100,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { success: false, error: 'Demasiadas peticiones. Intente de nuevo más tarde.' },
}));

// ─── Documentación interactiva ───────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'NexBank API Docs',
}));

// ─── Rutas de la API ─────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/account',      accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin',        adminRoutes);

// ─── Health check ────────────────────────────────────────────────────────────
// Endpoint de disponibilidad utilizado por plataformas de despliegue (Render, etc.).
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Banking API funcionando', timestamp: new Date().toISOString() });
});

// ─── Manejo de rutas no encontradas (404) ───────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint no encontrado.' });
});

// ─── Manejador global de errores ─────────────────────────────────────────────
// Express reconoce este middleware por su aridad (4 parámetros).
// En producción se oculta el detalle del error para no exponer internos.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: isDev ? err.message : 'Error interno del servidor.',
  });
});

module.exports = app;
