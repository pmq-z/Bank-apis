/**
 * @file        accounts.js  (routes)
 * @project     NexBank — Sistema Bancario Académico
 * @description Rutas para la gestión del perfil de usuario y la búsqueda
 *              de destinatarios. Todos los endpoints requieren autenticación JWT.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const router       = require('express').Router();
const { query }    = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const ctrl             = require('../controllers/accountController');

/**
 * @swagger
 * /api/account/profile:
 *   get:
 *     summary: Obtener el perfil y saldo del usuario autenticado
 *     tags: [Account]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:    { $ref: '#/components/schemas/User' }
 *       401:
 *         description: No autenticado.
 */
router.get('/profile', authenticate, ctrl.getProfile);

/**
 * @swagger
 * /api/account/find:
 *   get:
 *     summary: Buscar destinatario por correo o número de cuenta
 *     tags: [Account]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: identifier
 *         required: true
 *         schema: { type: string }
 *         description: Correo electrónico o número de cuenta (ACC-XXXXXXXX)
 *     responses:
 *       200:
 *         description: Destinatario encontrado.
 *       404:
 *         description: Destinatario no encontrado.
 */
router.get(
  '/find',
  authenticate,
  [query('identifier').trim().notEmpty().withMessage('Proporcione un correo o número de cuenta.')],
  validate,
  ctrl.findRecipient,
);

module.exports = router;
