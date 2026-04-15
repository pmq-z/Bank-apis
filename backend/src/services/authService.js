/**
 * @file        authService.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Capa de servicios de autenticación. Implementa el registro,
 *              inicio de sesión, renovación y revocación de tokens JWT.
 *              Las contraseñas se almacenan como hash bcrypt (12 salt rounds).
 *              Los refresh tokens se persisten en BD con soporte de rotación.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');

/** Número de rondas de sal para bcrypt. Valor de 12 equilibra seguridad y rendimiento. */
const SALT_ROUNDS = 12;

// ─── Utilidades de token ─────────────────────────────────────────────────────

/**
 * Genera un access token JWT de corta duración.
 *
 * @param   {string} userId - UUID del usuario propietario del token.
 * @returns {string}          Access token firmado.
 */
function generateAccessToken(userId) {
  return jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
}

/**
 * Genera un refresh token JWT de larga duración.
 * Incluye el campo `type: 'refresh'` para distinguirlo del access token
 * durante la validación.
 *
 * @param   {string} userId - UUID del usuario propietario del token.
 * @returns {string}          Refresh token firmado.
 */
function generateRefreshToken(userId) {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );
}

/**
 * Genera un número de cuenta con formato `ACC-XXXXXXXX`.
 *
 * @returns {string} Número de cuenta único.
 */
function generateAccountNumber() {
  const digits = Math.random().toString().slice(2, 10);
  return `ACC-${digits}`;
}

// ─── Operaciones de autenticación ────────────────────────────────────────────

/**
 * Registra un nuevo usuario en el sistema.
 *
 * @async
 * @param   {object} params           - Datos del nuevo usuario.
 * @param   {string} params.email     - Dirección de correo electrónico.
 * @param   {string} params.password  - Contraseña en texto plano.
 * @param   {string} params.fullName  - Nombre completo.
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 * @throws  {Error} 409 si el correo ya está registrado.
 * @throws  {Error} 500 si falla la inserción en la base de datos.
 */
async function register({ email, password, fullName }) {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (existing) {
    const err = new Error('Ya existe una cuenta registrada con este correo electrónico.');
    err.status = 409;
    throw err;
  }

  const passwordHash  = await bcrypt.hash(password, SALT_ROUNDS);
  const accountNumber = generateAccountNumber();

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      email:          email.toLowerCase(),
      password_hash:  passwordHash,
      full_name:      fullName,
      account_number: accountNumber,
      balance:        1000.00,
      is_admin:       false,
    })
    .select('id, email, full_name, account_number, balance, is_admin, created_at')
    .single();

  if (error) throw new Error('No se pudo crear la cuenta. Intente de nuevo.');

  const accessToken  = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);

  return { user, accessToken, refreshToken };
}

/**
 * Autentica a un usuario existente con correo y contraseña.
 *
 * Se utiliza el mismo mensaje de error para credenciales incorrectas
 * (correo o contraseña) a fin de prevenir la enumeración de usuarios.
 *
 * @async
 * @param   {object} params          - Credenciales de acceso.
 * @param   {string} params.email    - Correo electrónico.
 * @param   {string} params.password - Contraseña en texto plano.
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 * @throws  {Error} 401 si las credenciales son incorrectas.
 */
async function login({ email, password }) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, password_hash, full_name, account_number, balance, is_admin')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !user) {
    const err = new Error('Correo electrónico o contraseña incorrectos.');
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Correo electrónico o contraseña incorrectos.');
    err.status = 401;
    throw err;
  }

  // Se excluye el hash de la respuesta antes de devolver el objeto al cliente.
  const { password_hash: _omit, ...safeUser } = user;

  const accessToken  = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);

  return { user: safeUser, accessToken, refreshToken };
}

/**
 * Renueva el par de tokens mediante un refresh token válido.
 *
 * Implementa rotación de tokens: el refresh token entrante es eliminado
 * y se emite un nuevo par. Esto limita la ventana de uso de un token robado.
 *
 * @async
 * @param   {string} incomingRefreshToken - Refresh token a validar.
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 * @throws  {Error} 401 si el token es inválido, expirado o no está en BD.
 */
async function refresh(incomingRefreshToken) {
  let payload;

  try {
    payload = jwt.verify(incomingRefreshToken, process.env.JWT_SECRET);
  } catch {
    const err = new Error('Refresh token inválido o expirado.');
    err.status = 401;
    throw err;
  }

  if (payload.type !== 'refresh') {
    const err = new Error('Tipo de token incorrecto.');
    err.status = 401;
    throw err;
  }

  // Verificación de existencia en BD: permite revocar tokens sin esperar expiración.
  const { data: stored } = await supabase
    .from('refresh_tokens')
    .select('id')
    .eq('token', incomingRefreshToken)
    .eq('user_id', payload.sub)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!stored) {
    const err = new Error('El refresh token no fue reconocido o ya fue utilizado.');
    err.status = 401;
    throw err;
  }

  // Rotación: eliminar el token usado y emitir uno nuevo.
  await supabase.from('refresh_tokens').delete().eq('id', stored.id);

  const newAccessToken  = generateAccessToken(payload.sub);
  const newRefreshToken = generateRefreshToken(payload.sub);
  await storeRefreshToken(payload.sub, newRefreshToken);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/**
 * Revoca todos los refresh tokens activos de un usuario (cierre de sesión).
 *
 * @async
 * @param   {string} userId - UUID del usuario a desautenticar.
 * @returns {Promise<void>}
 */
async function logout(userId) {
  await supabase.from('refresh_tokens').delete().eq('user_id', userId);
}

// ─── Función interna ─────────────────────────────────────────────────────────

/**
 * Persiste un refresh token en la base de datos con su fecha de expiración.
 *
 * @async
 * @param   {string} userId - UUID del propietario del token.
 * @param   {string} token  - Refresh token JWT a almacenar.
 * @returns {Promise<void>}
 */
async function storeRefreshToken(userId, token) {
  const decoded   = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();

  await supabase.from('refresh_tokens').insert({ user_id: userId, token, expires_at: expiresAt });
}

module.exports = { register, login, refresh, logout };
