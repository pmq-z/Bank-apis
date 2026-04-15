/**
 * @file        transactionController.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Controladores HTTP para el módulo de transacciones.
 *              Orquesta la búsqueda del destinatario y la ejecución de
 *              transferencias, además de exponer el historial paginado.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const transactionService = require('../services/transactionService');
const accountService     = require('../services/accountService');

/**
 * Procesa una transferencia de dinero entre el usuario autenticado y un destinatario.
 *
 * Flujo:
 *   1. Resolución del destinatario a partir del identificador proporcionado.
 *   2. Ejecución atómica de la transferencia en la base de datos.
 *   3. Respuesta 201 con el registro de transacción generado.
 *
 * @async
 * @param {import('express').Request}      req  - Body: `{ recipientIdentifier, amount, description? }`.
 * @param {import('express').Response}     res  - Respuesta 201 con la transacción creada.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function transfer(req, res, next) {
  try {
    const { recipientIdentifier, amount, description } = req.body;

    const recipient = await accountService.findRecipient(recipientIdentifier);

    const transaction = await transactionService.transfer({
      senderId:   req.user.id,
      receiverId: recipient.id,
      amount:     parseFloat(amount),
      description,
    });

    return res.status(201).json({
      success: true,
      message: `$${amount} enviados a ${recipient.full_name} exitosamente.`,
      data:    transaction,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Recupera el historial de transacciones del usuario autenticado con paginación.
 *
 * @async
 * @param {import('express').Request}      req  - Query params opcionales: `page`, `limit`.
 * @param {import('express').Response}     res  - Respuesta 200 con lista paginada.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function getHistory(req, res, next) {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const result = await transactionService.getHistory(req.user.id, { page, limit });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

module.exports = { transfer, getHistory };
