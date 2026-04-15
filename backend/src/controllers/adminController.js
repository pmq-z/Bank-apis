/**
 * @file        adminController.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Controladores HTTP para el panel de administración.
 *              Expone estadísticas globales del sistema, listado completo
 *              de usuarios y listado completo de transacciones con soporte
 *              de paginación y búsqueda. Requiere rol de administrador.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const supabase = require('../config/supabase');

/**
 * Devuelve estadísticas agregadas del sistema bancario.
 * Las consultas se ejecutan en paralelo para minimizar la latencia.
 *
 * @async
 * @param {import('express').Request}      req  - Petición HTTP (no requiere parámetros).
 * @param {import('express').Response}     res  - Respuesta 200 con `{ totalUsers, totalTransactions, totalVolume }`.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function getStats(req, res, next) {
  try {
    const [usersRes, txRes, volumeRes] = await Promise.all([
      supabase.from('users').select('count', { count: 'exact', head: true }),
      supabase.from('transactions').select('count', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('transactions').select('amount').eq('status', 'completed'),
    ]);

    const totalVolume = (volumeRes.data || [])
      .reduce((acc, tx) => acc + parseFloat(tx.amount), 0);

    return res.json({
      success: true,
      data: {
        totalUsers:        usersRes.count ?? 0,
        totalTransactions: txRes.count    ?? 0,
        totalVolume:       parseFloat(totalVolume.toFixed(2)),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Lista todos los usuarios registrados con soporte de paginación y búsqueda.
 *
 * @async
 * @param {import('express').Request}      req  - Query params opcionales: `page`, `limit`, `search`.
 * @param {import('express').Response}     res  - Respuesta 200 con lista paginada de usuarios.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function getAllUsers(req, res, next) {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = (req.query.search || '').trim();

    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    let query = supabase
      .from('users')
      .select('id, email, full_name, account_number, balance, is_admin, created_at', { count: 'exact' });

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error('No se pudo recuperar la lista de usuarios.');

    return res.json({
      success: true,
      data: {
        users: data,
        pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Lista todas las transacciones del sistema con soporte de paginación y búsqueda.
 *
 * @async
 * @param {import('express').Request}      req  - Query params opcionales: `page`, `limit`, `search`.
 * @param {import('express').Response}     res  - Respuesta 200 con lista paginada de transacciones.
 * @param {import('express').NextFunction} next - Función de error.
 */
async function getAllTransactions(req, res, next) {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = (req.query.search || '').trim();

    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    let query = supabase
      .from('transactions')
      .select(`
        id, amount, description, status, created_at,
        sender:sender_id     ( id, full_name, email, account_number ),
        receiver:receiver_id ( id, full_name, email, account_number )
      `, { count: 'exact' });

    if (search) {
      query = query.ilike('description', `%${search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error('No se pudo recuperar el historial de transacciones.');

    return res.json({
      success: true,
      data: {
        transactions: data,
        pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getStats, getAllUsers, getAllTransactions };
