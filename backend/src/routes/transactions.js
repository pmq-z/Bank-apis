/**
 * @file        transactions.js  (routes)
 * @project     NexBank — Sistema Bancario Académico
 * @description Rutas para la ejecución de transferencias y consulta del
 *              historial de transacciones. Requieren autenticación JWT.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const router         = require('express').Router();
const { body, query} = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const ctrl             = require('../controllers/transactionController');

/**
 * @swagger
 * /api/transactions/transfer:
 *   post:
 *     summary: Transferir dinero a otro usuario
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientIdentifier, amount]
 *             properties:
 *               recipientIdentifier:
 *                 type: string
 *                 description: Correo o número de cuenta del destinatario
 *                 example: "juan@ejemplo.com"
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 150.00
 *               description:
 *                 type: string
 *                 maxLength: 200
 *                 example: "Pago de alquiler"
 *     responses:
 *       201:
 *         description: Transferencia completada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:    { $ref: '#/components/schemas/Transaction' }
 *       400:
 *         description: Saldo insuficiente o solicitud inválida.
 *       401:
 *         description: No autenticado.
 *       404:
 *         description: Destinatario no encontrado.
 */
router.post(
  '/transfer',
  authenticate,
  [
    body('recipientIdentifier')
      .trim().notEmpty()
      .withMessage('El correo o número de cuenta del destinatario es obligatorio.'),
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('El monto debe ser mayor a $0.00.')
      .custom(v => Number(parseFloat(v).toFixed(2)) === parseFloat(v) || true)
      .withMessage('El monto admite como máximo 2 decimales.'),
    body('description')
      .optional().trim().isLength({ max: 200 })
      .withMessage('La descripción no puede superar los 200 caracteres.'),
  ],
  validate,
  ctrl.transfer,
);

/**
 * @swagger
 * /api/transactions/history:
 *   get:
 *     summary: Obtener el historial de transacciones del usuario autenticado
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Lista paginada de transacciones.
 *       401:
 *         description: No autenticado.
 */
router.get(
  '/history',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('El número de página debe ser un entero positivo.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100.'),
  ],
  validate,
  ctrl.getHistory,
);

module.exports = router;
