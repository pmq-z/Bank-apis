/**
 * @file        transactionService.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Capa de servicios para operaciones de transacción.
 *              Las transferencias se delegan a la función PostgreSQL `process_transfer`,
 *              que garantiza atomicidad mediante una transacción de base de datos
 *              con bloqueo optimista (`SELECT ... FOR UPDATE`).
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const supabase = require('../config/supabase');

/**
 * Ejecuta una transferencia de fondos entre dos usuarios de forma atómica.
 *
 * La operación se delega a la función RPC `process_transfer` definida en
 * `schema.sql`, la cual aplica `SELECT ... FOR UPDATE` sobre la fila del
 * remitente para prevenir condiciones de carrera en transferencias concurrentes.
 *
 * @async
 * @param   {object} params               - Parámetros de la transferencia.
 * @param   {string} params.senderId      - UUID del usuario remitente.
 * @param   {string} params.receiverId    - UUID del usuario destinatario.
 * @param   {number} params.amount        - Importe a transferir (> 0).
 * @param   {string} [params.description] - Descripción opcional de la operación.
 * @returns {Promise<object>} Registro de transacción creado.
 * @throws  {Error} 400 si el remitente y destinatario son el mismo usuario.
 * @throws  {Error} 400 si el saldo del remitente es insuficiente.
 */
async function transfer({ senderId, receiverId, amount, description }) {
  if (senderId === receiverId) {
    const err = new Error('No es posible realizar una transferencia al mismo titular de la cuenta.');
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase.rpc('process_transfer', {
    p_sender_id:   senderId,
    p_receiver_id: receiverId,
    p_amount:      amount,
    p_description: description || '',
  });

  if (error) {
    const msg = error.message || 'La transferencia no pudo completarse.';
    const err = new Error(msg.includes('Insufficient') ? 'Saldo insuficiente para realizar la transferencia.' : msg);
    err.status = 400;
    throw err;
  }

  return data;
}

/**
 * Recupera el historial de transacciones paginado de un usuario.
 * Incluye tanto las operaciones enviadas como las recibidas.
 *
 * @async
 * @param   {string} userId             - UUID del usuario consultante.
 * @param   {object} [options]          - Opciones de paginación.
 * @param   {number} [options.page=1]   - Número de página (base 1).
 * @param   {number} [options.limit=20] - Cantidad de registros por página.
 * @returns {Promise<{transactions: object[], pagination: object}>}
 * @throws  {Error} Si la consulta a la base de datos falla.
 */
async function getHistory(userId, { page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const { data, error, count } = await supabase
    .from('transactions')
    .select(`
      id, amount, description, status, created_at,
      sender:sender_id   ( id, full_name, account_number ),
      receiver:receiver_id ( id, full_name, account_number )
    `, { count: 'exact' })
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error('No se pudo recuperar el historial de transacciones.');

  return {
    transactions: data,
    pagination: {
      page,
      limit,
      total:      count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

module.exports = { transfer, getHistory };
