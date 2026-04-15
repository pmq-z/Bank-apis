/**
 * @file        admin.js  (routes)
 * @project     NexBank — Sistema Bancario Académico
 * @description Rutas exclusivas del panel de administración.
 *              El middleware `requireAdmin` se aplica globalmente mediante
 *              `router.use()`, de modo que todos los endpoints del módulo
 *              requieren rol de administrador.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const router        = require('express').Router();
const { query }     = require('express-validator');
const { requireAdmin } = require('../middleware/adminAuth');
const { validate }     = require('../middleware/validate');
const ctrl             = require('../controllers/adminController');

// Aplica el middleware de autorización de administrador a todas las rutas del módulo.
router.use(requireAdmin);

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Estadísticas globales del sistema (solo administradores)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Totales de usuarios, transacciones y volumen transferido.
 *       403:
 *         description: Acceso denegado — se requiere rol de administrador.
 */
router.get('/stats', ctrl.getStats);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Listar todos los usuarios registrados (solo administradores)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filtro por nombre o correo electrónico
 *     responses:
 *       200:
 *         description: Lista paginada de usuarios.
 */
router.get(
  '/users',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('El número de página debe ser positivo.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100.'),
  ],
  validate,
  ctrl.getAllUsers,
);

/**
 * @swagger
 * /api/admin/transactions:
 *   get:
 *     summary: Listar todas las transacciones del sistema (solo administradores)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filtro por descripción de la transacción
 *     responses:
 *       200:
 *         description: Lista paginada de transacciones.
 */
router.get(
  '/transactions',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('El número de página debe ser positivo.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100.'),
  ],
  validate,
  ctrl.getAllTransactions,
);

module.exports = router;
