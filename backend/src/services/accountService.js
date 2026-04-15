/**
 * @file        accountService.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Capa de servicios para la gestión de cuentas de usuario.
 *              Provee consulta de perfil y búsqueda de destinatarios para
 *              el flujo de transferencias.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const supabase = require('../config/supabase');

/**
 * Recupera el perfil completo de un usuario a partir de su ID.
 *
 * @async
 * @param   {string} userId - UUID del usuario autenticado.
 * @returns {Promise<object>} Datos del usuario (sin password_hash).
 * @throws  {Error} Si la consulta a la base de datos falla.
 */
async function getProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, account_number, balance, created_at')
    .eq('id', userId)
    .single();

  if (error) throw new Error('No se pudo recuperar el perfil del usuario.');
  return data;
}

/**
 * Busca un usuario destinatario por correo electrónico o número de cuenta.
 * Nunca devuelve el campo `password_hash`.
 *
 * La detección del tipo de identificador se realiza comprobando si el valor
 * comienza con el prefijo `ACC-` (número de cuenta) o se trata de un email.
 *
 * @async
 * @param   {string} identifier - Correo electrónico o número de cuenta (ej. `ACC-12345678`).
 * @returns {Promise<{id: string, full_name: string, account_number: string, email: string}>}
 * @throws  {Error} 404 si el destinatario no existe en el sistema.
 */
async function findRecipient(identifier) {
  const isAccountNumber = identifier.toUpperCase().startsWith('ACC-');

  const query = supabase
    .from('users')
    .select('id, full_name, account_number, email');

  const { data, error } = isAccountNumber
    ? await query.eq('account_number', identifier.toUpperCase()).single()
    : await query.eq('email', identifier.toLowerCase()).single();

  if (error || !data) {
    const err = new Error('Destinatario no encontrado.');
    err.status = 404;
    throw err;
  }

  return data;
}

module.exports = { getProfile, findRecipient };
