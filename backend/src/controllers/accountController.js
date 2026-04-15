/**
 * @file        accountController.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Controladores HTTP para el módulo de cuentas de usuario.
 *              Expone el perfil del usuario autenticado y la búsqueda de
 *              destinatarios para operaciones de transferencia.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const accountService = require('../services/accountService');

/**
 * Devuelve el perfil y saldo del usuario actualmente autenticado.
 *
 * @async
 * @param {import('express').Request}      req  - `req.user.id` provisto por `authenticate`.
 * @param {import('express').Response}     res  - Respuesta 200 con datos del usuario.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function getProfile(req, res, next) {
  try {
    const profile = await accountService.getProfile(req.user.id);
    return res.json({ success: true, data: profile });
  } catch (err) {
    return next(err);
  }
}

/**
 * Busca un usuario por correo electrónico o número de cuenta.
 * Utilizado en el paso de confirmación de destinatario del flujo de transferencia.
 *
 * @async
 * @param {import('express').Request}      req  - Query param: `identifier` (email o ACC-XXXXXXXX).
 * @param {import('express').Response}     res  - Respuesta 200 con datos básicos del destinatario.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function findRecipient(req, res, next) {
  try {
    const { identifier } = req.query;
    const recipient = await accountService.findRecipient(identifier);
    return res.json({ success: true, data: recipient });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getProfile, findRecipient };
