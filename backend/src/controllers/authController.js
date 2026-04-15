/**
 * @file        authController.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Controladores HTTP para el módulo de autenticación.
 *              Actúan como capa delgada entre las rutas y los servicios:
 *              extraen datos del request, invocan el servicio correspondiente
 *              y formatean la respuesta HTTP.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const authService = require('../services/authService');

/**
 * Registra un nuevo usuario en el sistema.
 *
 * @async
 * @param {import('express').Request}      req  - Body: `{ email, password, fullName }`.
 * @param {import('express').Response}     res  - Respuesta 201 con usuario y tokens.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function register(req, res, next) {
  try {
    const { email, password, fullName } = req.body;
    const result = await authService.register({ email, password, fullName });

    return res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente.',
      data:    result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Autentica a un usuario existente y emite un par de tokens JWT.
 *
 * @async
 * @param {import('express').Request}      req  - Body: `{ email, password }`.
 * @param {import('express').Response}     res  - Respuesta 200 con usuario y tokens.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    return res.json({
      success: true,
      message: 'Inicio de sesión exitoso.',
      data:    result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Renueva el access token a partir de un refresh token válido.
 *
 * @async
 * @param {import('express').Request}      req  - Body: `{ refreshToken }`.
 * @param {import('express').Response}     res  - Respuesta 200 con nuevo par de tokens.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refresh(refreshToken);

    return res.json({
      success: true,
      message: 'Tokens renovados correctamente.',
      data:    tokens,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Revoca todos los refresh tokens del usuario autenticado (cierre de sesión).
 *
 * @async
 * @param {import('express').Request}      req  - `req.user` poblado por el middleware `authenticate`.
 * @param {import('express').Response}     res  - Respuesta 200 confirmando el cierre.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function logout(req, res, next) {
  try {
    await authService.logout(req.user.id);
    return res.json({ success: true, message: 'Sesión cerrada exitosamente.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, refresh, logout };
