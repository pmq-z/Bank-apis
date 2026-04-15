-- ═══════════════════════════════════════════════════════════════════════════
-- @file        schema.sql
-- @project     NexBank — Sistema Bancario Académico
-- @description Definición completa del esquema de base de datos PostgreSQL
--              para el sistema bancario académico. Incluye:
--              - Tabla `users`: perfil, credenciales y saldo de cada cliente.
--              - Tabla `refresh_tokens`: almacenamiento de tokens de refresco
--                con expiración, para la rotación segura de sesiones JWT.
--              - Tabla `transactions`: registro histórico inmutable de todas
--                las transferencias realizadas en el sistema.
--              - Función RPC `process_transfer`: operación atómica PL/pgSQL
--                con bloqueo `SELECT ... FOR UPDATE` para prevenir condiciones
--                de carrera en transferencias concurrentes.
--              - Habilitación de Row Level Security (RLS) en todas las tablas
--                como defensa en profundidad ante accesos directos.
--
--              Modo de uso: pegar y ejecutar en el SQL Editor de Supabase.
--
-- @author      [Nombre del Autor]
-- @date        2026-04-15
-- @version     1.0.0
-- ═══════════════════════════════════════════════════════════════════════════

-- Activamos la extensión pgcrypto que nos da la función gen_random_uuid()
-- para generar IDs únicos automáticamente
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Tabla de usuarios ───────────────────────────────────────────────────────
-- Aquí guardamos la información de cada persona registrada en el banco
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID único generado automáticamente
  email           TEXT UNIQUE NOT NULL,                       -- el email no puede repetirse
  password_hash   TEXT NOT NULL,                              -- nunca guardamos la contraseña, solo el hash
  full_name       TEXT NOT NULL,
  account_number  TEXT UNIQUE NOT NULL,                       -- número de cuenta tipo ACC-XXXXXXXX
  balance         NUMERIC(15, 2) NOT NULL DEFAULT 1000.00,    -- saldo con 2 decimales, empieza en $1000
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),         -- fecha de registro

  -- Restricción: el saldo nunca puede ser negativo
  CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

-- Los índices aceleran las búsquedas por email y por número de cuenta
-- (los usamos mucho en el login y en la búsqueda de destinatarios)
CREATE INDEX IF NOT EXISTS idx_users_email          ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_account_number ON users (account_number);

-- ─── Tabla de refresh tokens ─────────────────────────────────────────────────
-- Guardamos aquí los refresh tokens activos de cada usuario
-- Si cerramos sesión, borramos todos los tokens de ese usuario
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- si se borra el usuario, se borran sus tokens
  token       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL, -- fecha en la que vence el token
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para buscar tokens rápidamente por usuario y por valor del token
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens (token);

-- ─── Tabla de transacciones ──────────────────────────────────────────────────
-- Registro histórico de todas las transferencias realizadas
CREATE TABLE IF NOT EXISTS transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,   -- quien envía
  receiver_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,   -- quien recibe
  amount       NUMERIC(15, 2) NOT NULL,
  description  TEXT NOT NULL DEFAULT '',  -- nota opcional del usuario
  status       TEXT NOT NULL DEFAULT 'completed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validamos que el monto sea positivo
  CONSTRAINT amount_positive  CHECK (amount > 0),
  -- Solo estos dos estados son válidos
  CONSTRAINT valid_status     CHECK (status IN ('completed', 'failed')),
  -- No se puede hacer una transferencia a uno mismo
  CONSTRAINT no_self_transfer CHECK (sender_id <> receiver_id)
);

-- Índices para que las consultas del historial sean rápidas
CREATE INDEX IF NOT EXISTS idx_transactions_sender   ON transactions (sender_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver ON transactions (receiver_id, created_at DESC);

-- ─── Función process_transfer (RPC atómica) ──────────────────────────────────
-- Esta función hace la transferencia de forma atómica dentro de Postgres.
-- "Atómica" significa que o pasan TODAS las operaciones o no pasa NINGUNA.
-- Así evitamos que el dinero desaparezca si algo falla a la mitad.
CREATE OR REPLACE FUNCTION process_transfer(
  p_sender_id   UUID,
  p_receiver_id UUID,
  p_amount      NUMERIC,
  p_description TEXT
)
RETURNS SETOF transactions
LANGUAGE plpgsql
SECURITY DEFINER -- la función corre con los permisos del dueño, no del que la llama
AS $$
DECLARE
  v_sender_balance NUMERIC;
  v_tx             transactions;
BEGIN
  -- Bloqueamos la fila del que envía para evitar condiciones de carrera
  -- (que dos transferencias simultáneas usen el mismo saldo)
  SELECT balance INTO v_sender_balance
  FROM users
  WHERE id = p_sender_id
  FOR UPDATE; -- FOR UPDATE bloquea la fila hasta que terminemos

  -- Si no encontramos al usuario, lanzamos un error
  IF v_sender_balance IS NULL THEN
    RAISE EXCEPTION 'Sender not found.';
  END IF;

  -- Verificamos que tenga suficiente saldo para la transferencia
  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %', v_sender_balance;
  END IF;

  -- Le restamos el dinero al que envía
  UPDATE users SET balance = balance - p_amount WHERE id = p_sender_id;

  -- Le sumamos el dinero al que recibe
  UPDATE users SET balance = balance + p_amount WHERE id = p_receiver_id;

  -- Guardamos el registro de la transacción
  INSERT INTO transactions (sender_id, receiver_id, amount, description, status)
  VALUES (p_sender_id, p_receiver_id, p_amount, p_description, 'completed')
  RETURNING * INTO v_tx;

  -- Devolvemos la transacción recién creada
  RETURN NEXT v_tx;
END;
$$;

-- ─── Row Level Security (RLS) ────────────────────────────────────────────────
-- Activamos RLS como capa extra de seguridad.
-- Nuestra API usa la service_role key que pasa por encima del RLS,
-- pero si alguien accediera directamente con una clave anónima, no podría ver datos.

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- La service_role key salta el RLS automáticamente, no necesita políticas extra.
