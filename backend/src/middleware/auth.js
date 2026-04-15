/**
 * @file        auth.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Middleware de autenticación JWT para rutas protegidas.
 *              Verifica la firma y vigencia del access token Bearer,
 *              confirma la existencia del usuario en la base de datos
 *              y adjunta el objeto `user` al request para uso posterior.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');

/**
 * Middleware de autenticación.
 *
 * Flujo de validación:
 *   1. Extrae el token del header `Authorization: Bearer <token>`.
 *   2. Verifica la firma con `JWT_SECRET`.
 *   3. Consulta la existencia del usuario en la BD (previene tokens huérfanos).
 *   4. Adjunta el usuario a `req.user` y cede el control a `next()`.
 *
 * Códigos de respuesta:
 *   - 401 — token ausente, malformado o usuario no encontrado.
 *   - 403 — token válido pero expirado (el cliente debe renovarlo).
 *
 * @param {import('express').Request}  req  - Objeto de petición HTTP.
 * @param {import('express').Response} res  - Objeto de respuesta HTTP.
 * @param {import('express').NextFunction} next - Función de continuación.
 * @returns {Promise<void>}
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Autenticación requerida. Proporcione un token Bearer.',
    });
  }

  // Se elimina el prefijo "Bearer " (7 caracteres) para obtener el token puro.
  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Verificación secundaria: el usuario debe existir en la BD.
    // Esto invalida tokens de cuentas eliminadas sin esperar su expiración natural.
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, account_number, balance')
      .eq('id', payload.sub)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Cuenta de usuario no encontrada.' });
    }

    req.user = user;
    return next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        error: 'El access token ha expirado. Refresque sus credenciales.',
      });
    }
    return res.status(401).json({ success: false, error: 'Token inválido.' });
  }
}

module.exports = { authenticate };
