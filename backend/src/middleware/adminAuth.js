/**
 * @file        adminAuth.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Middleware de autenticación exclusivo para rutas administrativas.
 *              Extiende la verificación JWT estándar comprobando que el usuario
 *              autenticado tenga el flag `is_admin = true` en la base de datos.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');

/**
 * Middleware de autorización para administradores.
 *
 * Además de validar la firma y vigencia del JWT, recupera el registro del
 * usuario y rechaza la petición con 403 si `is_admin` no es `true`.
 *
 * Códigos de respuesta:
 *   - 401 — token ausente, inválido o usuario inexistente.
 *   - 403 — token expirado, o usuario autenticado sin rol de administrador.
 *
 * @param {import('express').Request}      req  - Objeto de petición HTTP.
 * @param {import('express').Response}     res  - Objeto de respuesta HTTP.
 * @param {import('express').NextFunction} next - Función de continuación.
 * @returns {Promise<void>}
 */
async function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Autenticación de administrador requerida.',
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, account_number, balance, is_admin')
      .eq('id', payload.sub)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado.' });
    }

    // El usuario existe pero no posee privilegios de administrador.
    if (!user.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. Se requieren privilegios de administrador.',
      });
    }

    req.user = user;
    return next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        error: 'Token expirado. Refresque sus credenciales.',
      });
    }
    return res.status(401).json({ success: false, error: 'Token inválido.' });
  }
}

module.exports = { requireAdmin };
