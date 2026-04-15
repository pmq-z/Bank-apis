/**
 * @file        supabase.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Inicialización y exportación del cliente Supabase con la clave
 *              de servicio (service_role). Esta clave omite Row Level Security,
 *              por lo que toda la autorización se aplica en la capa de middleware.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  throw new Error(
    'Variables de entorno faltantes: SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridas.'
  );
}

/**
 * Cliente Supabase configurado con la clave de servicio.
 *
 * - `persistSession: false` — la API gestiona sus propios tokens JWT;
 *   no se requiere persistencia de sesión por parte del SDK.
 *
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

module.exports = supabase;
