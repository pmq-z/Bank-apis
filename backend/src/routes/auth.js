/**
 * @file        auth.js  (routes)
 * @project     NexBank — Sistema Bancario Académico
 * @description Definición de rutas del módulo de autenticación.
 *              Aplica rate limiting estricto en los endpoints sensibles,
 *              cadenas de validación con express-validator y el middleware
 *              de autenticación JWT donde corresponde.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const router    = require('express').Router();
const { body }  = require('express-validator');
const rateLimit = require('express-rate-limit');

const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const ctrl             = require('../controllers/authController');

/**
 * Rate limiter reforzado para endpoints de autenticación.
 * Permite 5 intentos fallidos por IP cada 15 minutos.
 * Las peticiones exitosas no cuentan contra el límite.
 */
const authLimiter = rateLimit({
  windowMs:              15 * 60 * 1000,
  max:                   5,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
});

// ─── Cadenas de validación ────────────────────────────────────────────────────

/** Reglas aplicadas al endpoint de registro de usuario. */
const registerRules = [
  body('email')
    .isEmail().normalizeEmail()
    .withMessage('Proporcione una dirección de correo electrónico válida.'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe contener al menos 8 caracteres.')
    .matches(/[A-Z]/)
    .withMessage('La contraseña debe incluir al menos una letra mayúscula.')
    .matches(/[0-9]/)
    .withMessage('La contraseña debe incluir al menos un número.'),
  body('fullName')
    .trim().isLength({ min: 2, max: 100 })
    .withMessage('El nombre completo debe tener entre 2 y 100 caracteres.'),
];

/** Reglas aplicadas al endpoint de inicio de sesión. */
const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Proporcione un correo electrónico válido.'),
  body('password').notEmpty().withMessage('La contraseña es obligatoria.'),
];

/** Regla aplicada al endpoint de renovación de tokens. */
const refreshRules = [
  body('refreshToken').notEmpty().withMessage('El refresh token es obligatorio.'),
];

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registrar un nuevo usuario
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string, minLength: 8, example: "Segura123" }
 *               fullName: { type: string, example: "María García" }
 *     responses:
 *       201:
 *         description: Cuenta creada. Devuelve perfil de usuario y par de tokens JWT.
 *       409:
 *         description: El correo electrónico ya está registrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         description: Error de validación de datos.
 */
router.post('/register', authLimiter, registerRules, validate, ctrl.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Autenticación exitosa. Devuelve usuario y par de tokens JWT.
 *       401:
 *         description: Credenciales incorrectas.
 */
router.post('/login', authLimiter, loginRules, validate, ctrl.login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renovar el par de tokens mediante un refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Nuevo par de tokens emitido.
 *       401:
 *         description: Refresh token inválido o expirado.
 */
router.post('/refresh', refreshRules, validate, ctrl.refresh);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión y revocar todos los refresh tokens
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente.
 *       401:
 *         description: Token de acceso ausente o inválido.
 */
router.post('/logout', authenticate, ctrl.logout);

module.exports = router;
