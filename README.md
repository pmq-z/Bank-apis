# NexBank — Sistema Bancario Academico

> Proyecto academico de desarrollo full-stack. API REST segura con Node.js/Express
> y Supabase (PostgreSQL), consumida por una Single Page Application en Vanilla JS.

---

## Tabla de contenidos

1. [Descripcion general](#1-descripcion-general)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Estructura de directorios](#3-estructura-de-directorios)
4. [Base de datos](#4-base-de-datos)
5. [Backend — API REST](#5-backend--api-rest)
   - 5.1 [Dependencias](#51-dependencias)
   - 5.2 [Variables de entorno](#52-variables-de-entorno)
   - 5.3 [Modulos de configuracion](#53-modulos-de-configuracion)
   - 5.4 [Middlewares](#54-middlewares)
   - 5.5 [Servicios](#55-servicios)
   - 5.6 [Controladores](#56-controladores)
   - 5.7 [Rutas](#57-rutas)
   - 5.8 [Referencia de endpoints](#58-referencia-de-endpoints)
6. [Frontend — SPA Vanilla JS](#6-frontend--spa-vanilla-js)
   - 6.1 [Modulos JavaScript](#61-modulos-javascript)
   - 6.2 [Flujo de transferencia](#62-flujo-de-transferencia)
7. [Seguridad](#7-seguridad)
8. [Puesta en marcha](#8-puesta-en-marcha)

---

## 1. Descripcion general

NexBank es un sistema bancario academico de tres capas:

```
[ Navegador ]  <-->  [ API REST (Express) ]  <-->  [ Supabase / PostgreSQL ]
```

| Caracteristica          | Detalle                                                |
|-------------------------|--------------------------------------------------------|
| Autenticacion           | JWT con access token (15 min) + refresh token (7 dias) |
| Persistencia            | Supabase — PostgreSQL gestionado en la nube            |
| Hashing de contrasenas  | bcrypt con 12 rondas de sal                            |
| Transferencias atomicas | RPC PL/pgSQL con `SELECT ... FOR UPDATE`               |
| Documentacion API       | Swagger UI disponible en `/api/docs`                   |
| Panel de administracion | SPA separada en `admin.html`                           |

---

## 2. Arquitectura del sistema

```
NexBank/
|
+-- backend/                 <-- Servidor Node.js / Express
|   +-- server.js            <-- Punto de entrada: carga .env e inicia listener
|   +-- src/
|       +-- app.js           <-- Configuracion central: middlewares, rutas, Swagger
|       +-- config/
|       |   +-- supabase.js  <-- Cliente Supabase (service_role, sin sesion)
|       |   +-- swagger.js   <-- Definicion OpenAPI 3.0
|       +-- middleware/
|       |   +-- auth.js      <-- Verificacion JWT para usuarios normales
|       |   +-- adminAuth.js <-- Verificacion JWT + flag is_admin
|       |   +-- validate.js  <-- Colector de errores de express-validator
|       +-- services/
|       |   +-- authService.js         <-- Registro, login, refresco, logout
|       |   +-- accountService.js      <-- Perfil, busqueda de destinatarios
|       |   +-- transactionService.js  <-- Transferencias, historial
|       +-- controllers/
|       |   +-- authController.js
|       |   +-- accountController.js
|       |   +-- transactionController.js
|       |   +-- adminController.js
|       +-- routes/
|           +-- auth.js
|           +-- accounts.js
|           +-- transactions.js
|           +-- admin.js
|
+-- frontend/                <-- Cliente web estatico
    +-- index.html           <-- SPA de usuario
    +-- admin.html           <-- SPA de administrador
    +-- css/
    |   +-- style.css        <-- Tema oscuro, variables CSS, animaciones
    |   +-- admin.css        <-- Estilos del panel admin (acento violeta)
    +-- js/
        +-- config.js        <-- URL base de la API
        +-- api.js           <-- Cliente HTTP con refresco silencioso de tokens
        +-- auth.js          <-- Login, registro, gestion de sesion (IIFE)
        +-- dashboard.js     <-- Panel de usuario: saldo, transferencia, historial (IIFE)
        +-- app.js           <-- Punto de entrada SPA usuario
        +-- admin.js         <-- Panel de administrador completo
```

El backend sigue una separacion estricta de responsabilidades:

- **Rutas** (`routes/`): definen paths, aplican validaciones con `express-validator` y delegan al controlador.
- **Controladores** (`controllers/`): capa HTTP delgada; parsean la request, llaman al servicio y formatean la respuesta.
- **Servicios** (`services/`): contienen toda la logica de negocio e interactuan directamente con Supabase.

---

## 3. Estructura de directorios

```
Bnk/
+-- backend/
|   +-- .env                 <-- Variables de entorno (NO subir al repositorio)
|   +-- .gitignore
|   +-- package.json
|   +-- server.js
|   +-- schema.sql           <-- DDL completo: tablas, indices, funcion RPC, RLS
|   +-- src/  (ver seccion 2)
|
+-- frontend/
|   +-- index.html
|   +-- admin.html
|   +-- css/
|   +-- js/
|
+-- README.md
```

---

## 4. Base de datos

El esquema completo se encuentra en `backend/schema.sql`. Debe ejecutarse
una sola vez en el **SQL Editor de Supabase** antes de iniciar el servidor.

### 4.1 Tabla `users`

| Columna          | Tipo            | Restriccion / Nota                        |
|------------------|-----------------|-------------------------------------------|
| `id`             | UUID PK         | `gen_random_uuid()` — generado por Postgres |
| `email`          | TEXT UNIQUE     | Normalizado a minusculas antes de guardar |
| `password_hash`  | TEXT            | Hash bcrypt (12 rondas), nunca la clave en texto plano |
| `full_name`      | TEXT            | Nombre completo del usuario               |
| `account_number` | TEXT UNIQUE     | Formato `ACC-XXXXXXXX`, generado en el servicio |
| `balance`        | NUMERIC(15,2)   | Saldo en dolares; inicia en `1000.00`     |
| `is_admin`       | BOOLEAN         | `DEFAULT FALSE`; `TRUE` solo para admins  |
| `created_at`     | TIMESTAMPTZ     | `DEFAULT NOW()`                           |

Restriccion CHECK: `balance >= 0` — el saldo nunca puede ser negativo.

Indices: `idx_users_email`, `idx_users_account_number`.

### 4.2 Tabla `refresh_tokens`

| Columna      | Tipo        | Nota                                               |
|--------------|-------------|-----------------------------------------------------|
| `id`         | UUID PK     |                                                     |
| `user_id`    | UUID FK     | `ON DELETE CASCADE` — se eliminan con el usuario    |
| `token`      | TEXT        | El string JWT del refresh token                     |
| `expires_at` | TIMESTAMPTZ | Decodificado del claim `exp` del JWT                |
| `created_at` | TIMESTAMPTZ |                                                     |

En cada operacion de refresco se elimina el token usado y se emite uno nuevo
(rotacion de tokens). En el logout se eliminan **todos** los tokens del usuario.

### 4.3 Tabla `transactions`

| Columna       | Tipo          | Nota                                          |
|---------------|---------------|-----------------------------------------------|
| `id`          | UUID PK       |                                               |
| `sender_id`   | UUID FK       | `ON DELETE RESTRICT`                          |
| `receiver_id` | UUID FK       | `ON DELETE RESTRICT`                          |
| `amount`      | NUMERIC(15,2) | CHECK `amount > 0`                            |
| `description` | TEXT          | Nota opcional; `DEFAULT ''`                   |
| `status`      | TEXT          | `'completed'` o `'failed'` (CHECK constraint) |
| `created_at`  | TIMESTAMPTZ   |                                               |

Restriccion CHECK: `sender_id <> receiver_id` — no se puede transferir a uno mismo.

Indices compuestos: `(sender_id, created_at DESC)`, `(receiver_id, created_at DESC)`.

### 4.4 Funcion RPC `process_transfer`

```sql
SELECT * FROM process_transfer(
  p_sender_id   UUID,
  p_receiver_id UUID,
  p_amount      NUMERIC,
  p_description TEXT
);
```

Ejecuta la transferencia de forma **atomica** dentro de una transaccion PostgreSQL:

```
1. SELECT balance FROM users WHERE id = p_sender_id FOR UPDATE
   --> Bloquea la fila del emisor para evitar condiciones de carrera.

2. IF balance < p_amount --> RAISE EXCEPTION 'Insufficient balance.'

3. UPDATE users SET balance = balance - p_amount WHERE id = p_sender_id
4. UPDATE users SET balance = balance + p_amount WHERE id = p_receiver_id
5. INSERT INTO transactions (...) RETURNING *
```

Si cualquier paso falla, PostgreSQL hace rollback automaticamente. La funcion
usa `SECURITY DEFINER`, lo que le permite ejecutarse con los permisos del
propietario del esquema aunque el cliente conectado sea anonimo.

### 4.5 Row Level Security (RLS)

RLS esta habilitado en las tres tablas como capa de defensa en profundidad.
La API usa la `service_role` key, que omite el RLS por diseno; sin embargo,
si alguien obtuviera la `anon` key y accediera directamente, no podria leer
ni modificar datos sin politicas explicitas.

---

## 5. Backend — API REST

### 5.1 Dependencias

| Paquete                | Version  | Uso                                              |
|------------------------|----------|--------------------------------------------------|
| `express`              | ^4.18    | Framework HTTP                                   |
| `@supabase/supabase-js`| ^2.39    | Cliente oficial de Supabase                      |
| `jsonwebtoken`         | ^9.0     | Firma y verificacion de tokens JWT               |
| `bcryptjs`             | ^2.4     | Hashing de contrasenas                           |
| `express-validator`    | ^7.0     | Validacion y sanitizacion de datos de entrada    |
| `express-rate-limit`   | ^7.1     | Limite de tasa de peticiones por IP              |
| `helmet`               | ^7.1     | Headers HTTP de seguridad                        |
| `cors`                 | ^2.8     | Politica de origen cruzado configurable          |
| `dotenv`               | ^16.3    | Carga de variables desde `.env`                  |
| `swagger-jsdoc`        | ^6.2     | Generacion de spec OpenAPI desde comentarios JSDoc |
| `swagger-ui-express`   | ^5.0     | UI interactiva para explorar la API              |
| `uuid`                 | ^9.0     | Generacion de numeros de cuenta (`ACC-XXXXXXXX`) |
| `nodemon` (dev)        | ^3.0     | Reinicio automatico del servidor en desarrollo   |

### 5.2 Variables de entorno

Crear el archivo `backend/.env` con el siguiente contenido:

```env
# URL del proyecto Supabase
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co

# Clave service_role (comienza con eyJ...)
# Supabase Dashboard -> Project Settings -> Data API -> service_role
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Clave secreta para firmar los tokens JWT de la aplicacion
# Debe ser una cadena larga y aleatoria (minimo 32 caracteres)
JWT_SECRET=una_clave_secreta_muy_larga_y_aleatoria_aqui

# Puerto en el que escucha el servidor
PORT=3001

# Entorno de ejecucion ('development' o 'production')
NODE_ENV=development

# Origenes permitidos para CORS (separados por coma)
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

> [!IMPORTANT]
> El archivo `.env` esta incluido en `.gitignore`. Nunca debe subirse
> al repositorio. La `service_role` key tiene acceso total a la base de datos.

### 5.3 Modulos de configuracion

#### `src/config/supabase.js`

Crea y exporta el cliente de Supabase usando la `service_role` key. La opcion
`persistSession: false` es obligatoria en entornos de servidor para evitar
que el SDK intente persistir la sesion del administrador de Supabase en memoria.

Si alguna de las variables de entorno requeridas esta ausente, el modulo lanza
un `Error` en el arranque para evitar fallos silenciosos en tiempo de ejecucion.

#### `src/config/swagger.js`

Define la especificacion OpenAPI 3.0 del proyecto:

- **Servidor**: `http://localhost:3001`
- **Esquemas**: `User`, `Transaction`, `ErrorResponse`, `SuccessResponse`
- **Seguridad**: esquema `bearerAuth` (JWT en header `Authorization: Bearer <token>`)
- **Ruta de documentacion**: `/api/docs`

### 5.4 Middlewares

#### `src/middleware/auth.js` — Autenticacion JWT

```
Request --> Extrae header Authorization: Bearer <token>
        --> jwt.verify(token, JWT_SECRET)
        --> Consulta users en Supabase para confirmar que el usuario existe
        --> Adjunta req.user = { id, email, full_name, is_admin, ... }
        --> next()
```

Respuestas de error:

| Situacion                        | Status | Mensaje                          |
|----------------------------------|--------|----------------------------------|
| Header Authorization ausente     | 401    | Se requiere autenticacion.       |
| Token malformado o firma invalida | 401   | Token invalido.                  |
| Token expirado                   | 403    | Token expirado.                  |
| Usuario no encontrado en DB      | 401    | Usuario no encontrado.           |

#### `src/middleware/adminAuth.js` — Autorizacion de administrador

Extiende la logica de `auth.js`: ademas de verificar el JWT, comprueba que
`req.user.is_admin === true`. Si el usuario esta autenticado pero no es admin,
responde con `403 Forbidden`.

#### `src/middleware/validate.js` — Colector de errores de validacion

Ejecuta `validationResult(req)` de `express-validator`. Si hay errores, responde
con `422 Unprocessable Entity` y el siguiente esquema:

```json
{
  "success": false,
  "error": "Error de validacion.",
  "details": [
    { "field": "email", "message": "Proporcione un correo valido." }
  ]
}
```

### 5.5 Servicios

#### `src/services/authService.js`

| Funcion            | Descripcion                                                              |
|--------------------|--------------------------------------------------------------------------|
| `register()`       | Verifica unicidad del email, hashea la contrasena con bcrypt (12 rounds), genera `account_number`, inserta en `users`, emite par de tokens JWT. |
| `login()`          | Compara la contrasena con `bcrypt.compare`. El mismo mensaje de error para email incorrecto y contrasena incorrecta (evita enumeracion de usuarios). |
| `refresh()`        | Verifica que el JWT sea de tipo `refresh`, que exista en la tabla `refresh_tokens` y no haya expirado. Elimina el token usado y emite un nuevo par (rotacion). |
| `logout()`         | Elimina todos los registros en `refresh_tokens` para el usuario autenticado. |
| `storeRefreshToken()` | Persiste el refresh token en la base de datos junto con su fecha de expiracion (decodificada del claim `exp`). |

**Estructura del payload JWT:**

```json
// Access token
{ "sub": "uuid-del-usuario", "type": "access",  "iat": 0, "exp": 0 }

// Refresh token
{ "sub": "uuid-del-usuario", "type": "refresh", "iat": 0, "exp": 0 }
```

#### `src/services/accountService.js`

| Funcion           | Descripcion                                                      |
|-------------------|------------------------------------------------------------------|
| `getProfile()`    | Retorna todos los campos del usuario excepto `password_hash`.    |
| `findRecipient()` | Detecta si el identificador tiene prefijo `ACC-` (numero de cuenta) o es un email. Consulta el campo correspondiente. Devuelve solo `id`, `full_name`, `account_number` para no exponer datos sensibles. |

#### `src/services/transactionService.js`

| Funcion        | Descripcion                                                         |
|----------------|---------------------------------------------------------------------|
| `transfer()`   | Valida que `sender_id !== receiver_id`. Llama a `supabase.rpc('process_transfer', {...})`. Si el RPC lanza una excepcion PostgreSQL, la captura y la relanza como error HTTP legible. |
| `getHistory()` | Consulta paginada con `.or('sender_id.eq.X,receiver_id.eq.X')`. Incluye join a `users` para obtener el nombre del emisor y receptor. Retorna estructura `{ transactions, pagination }`. |

### 5.6 Controladores

Los controladores son capas HTTP delgadas sin logica de negocio propia.
Su unica responsabilidad es:

1. Extraer parametros de `req.body`, `req.query` o `req.user`.
2. Llamar al servicio correspondiente.
3. Formatear y enviar la respuesta HTTP.
4. Pasar cualquier excepcion no controlada a `next(err)`.

Todos los errores no capturados son manejados por el **error handler global**
en `src/app.js`, que responde con `500 Internal Server Error` en produccion
sin exponer el stack trace.

### 5.7 Rutas

#### `src/routes/auth.js`

Rate limiter reforzado: **5 intentos por IP cada 15 minutos** (`skipSuccessfulRequests: true`).
Aplica unicamente a `POST /register` y `POST /login`.

| Reglas de validacion — registro |
|---------------------------------|
| `email`: formato email valido, normalizado |
| `password`: minimo 8 caracteres, al menos 1 mayuscula y 1 numero |
| `fullName`: entre 2 y 100 caracteres |

#### `src/routes/accounts.js`

Aplica `authenticate` en todas las rutas. El parametro `identifier` en
`GET /find` es obligatorio y se normaliza con `.trim()`.

#### `src/routes/transactions.js`

Aplica `authenticate` en todas las rutas. El cuerpo de `POST /transfer`
valida `recipientIdentifier` (no vacio), `amount` (float positivo con
maximo 2 decimales) y `description` (opcional, maximo 200 caracteres).

#### `src/routes/admin.js`

Aplica `router.use(requireAdmin)` de forma global: **todos** los endpoints
del modulo requieren token valido con `is_admin = true`. Los parametros de
paginacion `page` y `limit` son validados (enteros positivos, maximo 100).

### 5.8 Referencia de endpoints

#### Autenticacion — `/api/auth`

| Metodo | Ruta        | Autenticacion | Descripcion                           |
|--------|-------------|---------------|---------------------------------------|
| POST   | `/register` | Publica       | Registrar nuevo usuario               |
| POST   | `/login`    | Publica       | Iniciar sesion                        |
| POST   | `/refresh`  | Publica       | Renovar par de tokens                 |
| POST   | `/logout`   | Bearer JWT    | Cerrar sesion y revocar refresh tokens |

**POST /register — Request body:**
```json
{
  "email":    "usuario@ejemplo.com",
  "password": "Contrasena123",
  "fullName": "Maria Garcia"
}
```

**POST /register — Response 201:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "usuario@ejemplo.com",
      "full_name": "Maria Garcia",
      "account_number": "ACC-12345678",
      "balance": 1000.00,
      "is_admin": false
    },
    "accessToken":  "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**POST /refresh — Request body:**
```json
{ "refreshToken": "eyJ..." }
```

#### Cuenta — `/api/account`

| Metodo | Ruta       | Autenticacion | Descripcion                            |
|--------|------------|---------------|----------------------------------------|
| GET    | `/profile` | Bearer JWT    | Obtener perfil y saldo del usuario     |
| GET    | `/find`    | Bearer JWT    | Buscar destinatario por email o ACC-   |

**GET /find — Query param:** `?identifier=juan@ejemplo.com` o `?identifier=ACC-87654321`

#### Transacciones — `/api/transactions`

| Metodo | Ruta        | Autenticacion | Descripcion                          |
|--------|-------------|---------------|--------------------------------------|
| POST   | `/transfer` | Bearer JWT    | Realizar transferencia a otro usuario |
| GET    | `/history`  | Bearer JWT    | Historial paginado del usuario       |

**POST /transfer — Request body:**
```json
{
  "recipientIdentifier": "ACC-87654321",
  "amount": 150.00,
  "description": "Pago de alquiler"
}
```

**GET /history — Query params:** `?page=1&limit=20`

#### Administracion — `/api/admin`

| Metodo | Ruta             | Autenticacion  | Descripcion                             |
|--------|------------------|----------------|-----------------------------------------|
| GET    | `/stats`         | Bearer + Admin | Totales del sistema                     |
| GET    | `/users`         | Bearer + Admin | Lista paginada de usuarios con busqueda |
| GET    | `/transactions`  | Bearer + Admin | Lista paginada de transacciones         |

**GET /stats — Response 200:**
```json
{
  "success": true,
  "data": {
    "totalUsers":        42,
    "totalTransactions": 157,
    "totalVolume":       24800.50
  }
}
```

---

## 6. Frontend — SPA Vanilla JS

Las dos SPA (`index.html` y `admin.html`) son documentos HTML estaticos que
**no requieren servidor web**: pueden abrirse directamente desde el sistema
de archivos (`file://`). El CORS del backend esta configurado para permitir
el origen `null` en entorno de desarrollo.

### 6.1 Modulos JavaScript

Los archivos JS se cargan en orden en cada HTML. Todos son globales;
`Auth` y `Dashboard` usan el patron **IIFE** para encapsular estado interno.

```
index.html carga:
  config.js  -->  api.js  -->  auth.js  -->  dashboard.js  -->  app.js

admin.html carga:
  config.js  -->  admin.js
```

#### `config.js`

Define `window.APP_CONFIG = { apiBase: 'http://localhost:3001/api' }`.
Es el unico lugar donde se debe cambiar la URL al desplegar a produccion.

#### `api.js`

Cliente HTTP centralizado. Todos los modulos lo usan a traves de `window.api`.

```
api.get(url)          --> GET autenticado (agrega Bearer token)
api.post(url, body)   --> POST autenticado
api.postPublic(url, body) --> POST sin token (login, registro)
```

**Mecanismo de refresco silencioso:**

```
Peticion A con token expirado
  --> status 403
  --> _isRefreshing = false?
        SI: inicia refresco, encola A
        NO: encola A, espera

Refresco completado
  --> nuevo accessToken guardado en sessionStorage
  --> _processQueue(): desencola y reintenta todas las peticiones en cola
  --> _isRefreshing = false
```

Si el refresco falla (refresh token expirado o revocado), se dispara
`window.dispatchEvent(new CustomEvent('auth:logout'))` para limpiar la
sesion y redirigir al login.

#### `auth.js` — Modulo `window.Auth`

| Funcion publica       | Descripcion                                             |
|-----------------------|---------------------------------------------------------|
| `Auth.init()`         | Registra todos los event listeners del modulo           |
| `Auth.logout()`       | Llama a `POST /auth/logout`, limpia sessionStorage, emite `auth:logout` |
| `Auth.isAuthenticated()` | Retorna `true` si hay accessToken y datos de usuario en sessionStorage |
| `Auth.getUser()`      | Retorna el objeto usuario parseado desde sessionStorage |
| `Auth.clearSession()` | Limpia sessionStorage                                   |

El medidor de fortaleza de contrasena evalua 5 criterios (longitud >= 8,
longitud >= 12, mayuscula, numero, caracter especial) y actualiza el ancho
y color de una barra CSS en tiempo real.

#### `dashboard.js` — Modulo `window.Dashboard`

| Funcion publica           | Descripcion                                     |
|---------------------------|-------------------------------------------------|
| `Dashboard.init(user)`    | Inicializa el dashboard con los datos del usuario |
| `Dashboard.refreshBalance()` | Reconsulta el perfil y anima el contador de saldo |
| `Dashboard.toast(msg, type)` | Muestra una notificacion flotante (info/success/error) |
| `Dashboard.navigateTo(view)` | Cambia la vista activa del panel                |

**Animacion del saldo:**
Usa `requestAnimationFrame` con easing ease-out-cubic para contar desde
el valor anterior hasta el nuevo saldo en 800 ms:

```
eased = 1 - (1 - progress)^3
```

#### `app.js`

Punto de entrada de la SPA de usuario. En `DOMContentLoaded`:

1. Llama a `Auth.init()`.
2. Si `Auth.isAuthenticated()` => muestra dashboard.
3. Si no => muestra pantalla de login.
4. Escucha `auth:login` y `auth:logout` para transiciones entre pantallas.

La funcion `showScreen(id)` usa doble `requestAnimationFrame` para asegurar
que el navegador procese el estado inicial antes de aplicar la clase CSS que
dispara la transicion de entrada.

#### `admin.js`

Modulo completamente autonomo que no depende de `auth.js` ni `dashboard.js`.

- Usa **`localStorage`** (no `sessionStorage`) para que la sesion del admin
  persista entre cierres de pestaña.
- Tiene su propio cliente HTTP (`adminFetch`) con logica de refresco de tokens.
- Verifica `data.user.is_admin === true` despues del login para rechazar
  cuentas normales aunque las credenciales sean correctas.

### 6.2 Flujo de transferencia

El formulario de transferencia en el panel de usuario opera en **3 pasos**
sin recargar la pagina:

```
Paso 1 — Buscar destinatario
  Usuario ingresa email o ACC-XXXXXXXX
  --> GET /api/account/find?identifier=...
  --> Se muestra tarjeta con nombre y numero de cuenta del destinatario
  --> Transicion automatica al paso 2 (600 ms)

Paso 2 — Ingresar monto
  Usuario ingresa monto y descripcion opcional
  --> Validacion en cliente: monto > 0, monto <= saldo disponible
  --> Se calcula saldo resultante y se muestra en el resumen

Paso 3 — Confirmar
  Se muestra resumen: destinatario, monto, descripcion, saldo resultante
  --> POST /api/transactions/transfer
  --> Exito: overlay animado con checkmark SVG
  --> Error: mensaje inline en el formulario
  --> Se actualiza saldo y transacciones recientes en el overview
```

---

## 7. Seguridad

### 7.1 Medidas implementadas

| Categoria              | Medida                                                       |
|------------------------|--------------------------------------------------------------|
| Autenticacion          | JWT firmado con HS256; access token de corta vida (15 min)   |
| Gestion de sesion      | Refresh tokens almacenados en BD con fecha de expiracion; rotacion en cada uso |
| Contrasenas            | bcrypt con 12 rondas de sal; nunca se almacena en texto plano |
| Enumeracion de usuarios | Login devuelve el mismo mensaje para email y contrasena incorrectos |
| Inyeccion SQL          | Todas las consultas usan el SDK de Supabase con parametros enlazados; nunca se concatenan strings |
| XSS                    | Todo contenido dinamico insertado en el DOM se sanitiza con `escapeHtml()` (asignacion via `textContent`, no `innerHTML`) |
| Headers HTTP           | `helmet` aplica Content-Security-Policy, X-Frame-Options, HSTS y otros |
| CORS                   | Lista blanca explicita de origenes; origen `null` permitido solo en desarrollo |
| Rate limiting          | Global: 100 peticiones/15 min por IP; Auth: 5 intentos/15 min por IP |
| Autorizacion           | Middleware `requireAdmin` verifica `is_admin` en cada peticion al panel admin |
| Defense in depth       | RLS habilitado en Supabase como barrera secundaria           |
| Condiciones de carrera | `SELECT ... FOR UPDATE` en la funcion RPC evita doble gasto  |

### 7.2 Consideraciones para produccion

- Cambiar `NODE_ENV=production` en `.env`.
- Usar HTTPS (Render, Railway y similares lo proveen automaticamente).
- Remover el origen `null` del CORS (solo presente en desarrollo para `file://`).
- Rotar `JWT_SECRET` periodicamente.
- Considerar almacenar el refresh token en una cookie `HttpOnly; Secure; SameSite=Strict`
  en lugar de `sessionStorage` para mayor proteccion contra XSS.

---

## 8. Puesta en marcha

### Requisitos previos

- Node.js >= 18
- Cuenta en [Supabase](https://supabase.com) (plan gratuito es suficiente)

### Paso 1 — Configurar la base de datos

1. Crear un nuevo proyecto en Supabase.
2. Ir a **SQL Editor** y ejecutar el contenido de `backend/schema.sql`.
3. Verificar que las tres tablas y la funcion `process_transfer` aparezcan
   en **Table Editor** y **Database > Functions**.

### Paso 2 — Configurar el backend

```bash
cd backend
npm install
cp .env.example .env   # Si existe, o crear .env manualmente (ver seccion 5.2)
```

Completar el archivo `.env` con los valores reales obtenidos desde
**Supabase Dashboard > Project Settings > Data API**.

### Paso 3 — Iniciar el servidor

```bash
# Produccion
npm start

# Desarrollo (reinicio automatico con nodemon)
npm run dev
```

El servidor queda disponible en `http://localhost:3001`.
La documentacion Swagger estara en `http://localhost:3001/api/docs`.

### Paso 4 — Abrir el frontend

Abrir `frontend/index.html` directamente en el navegador (doble click o
arrastrar al navegador). No se requiere servidor web adicional.

Para el panel de administrador, abrir `frontend/admin.html`.

### Paso 5 — Crear la primera cuenta de administrador

1. Registrar un usuario normal desde `index.html`.
2. En **Supabase > Table Editor > users**, localizar el usuario por email.
3. Editar la fila y cambiar `is_admin` de `false` a `true`.
4. Guardar. El usuario ahora puede acceder a `admin.html` con sus mismas credenciales.

### Verificacion rapida

```
GET http://localhost:3001/api/docs   --> Swagger UI debe cargar correctamente
POST http://localhost:3001/api/auth/register  --> Debe crear un usuario y devolver tokens
```

---

*NexBank — Sistema Bancario Academico  |  v1.0.0  |  2026*
