/**
 * @file        validate.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Middleware centralizador de errores de validación producidos
 *              por las cadenas de `express-validator`. Se coloca después de
 *              los esquemas de validación en cada ruta.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const { validationResult } = require('express-validator');

/**
 * Recolecta los errores generados por `express-validator` y responde con
 * HTTP 422 si existen, o cede el control al siguiente middleware si no.
 *
 * El cuerpo de la respuesta de error incluye un array `details` con el
 * campo afectado y el mensaje descriptivo de cada falla de validación.
 *
 * @param {import('express').Request}      req  - Objeto de petición HTTP.
 * @param {import('express').Response}     res  - Objeto de respuesta HTTP.
 * @param {import('express').NextFunction} next - Función de continuación.
 * @returns {import('express').Response|void}
 */
function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      error:   'La validación de los datos falló.',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }

  return next();
}

module.exports = { validate };
