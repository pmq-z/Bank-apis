/**
 * @file        swagger.js
 * @project     NexBank — Sistema Bancario Académico
 * @description Generación de la especificación OpenAPI 3.0 mediante swagger-jsdoc.
 *              Lee las anotaciones @swagger de los archivos de rutas y produce
 *              el objeto de especificación que consume swagger-ui-express.
 * @author      [Nombre del Autor]
 * @date        2026-04-15
 * @version     1.0.0
 */

'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

/** @type {import('swagger-jsdoc').Options} */
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'NexBank API',
      version:     '1.0.0',
      description: 'API REST bancaria con autenticación JWT, transferencias y historial de transacciones.',
      contact:     { name: 'Soporte', email: 'soporte@nexbank.dev' },
    },
    servers: [
      { url: 'http://localhost:3001',          description: 'Desarrollo local' },
      { url: 'https://your-app.onrender.com',  description: 'Producción'       },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type:        'http',
          scheme:      'bearer',
          bearerFormat: 'JWT',
          description: 'Ingrese el access token (sin el prefijo "Bearer ").',
        },
      },
      schemas: {
        // ── Modelos de datos ─────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid'       },
            email:          { type: 'string', format: 'email'      },
            full_name:      { type: 'string'                        },
            account_number: { type: 'string', example: 'ACC-12345678' },
            balance:        { type: 'number', example: 1000.00      },
            created_at:     { type: 'string', format: 'date-time'  },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid'                          },
            sender_id:   { type: 'string', format: 'uuid'                          },
            receiver_id: { type: 'string', format: 'uuid'                          },
            amount:      { type: 'number', example: 150.00                         },
            description: { type: 'string'                                           },
            status:      { type: 'string', enum: ['completed', 'failed']            },
            created_at:  { type: 'string', format: 'date-time'                     },
            sender:      { $ref: '#/components/schemas/User'                        },
            receiver:    { $ref: '#/components/schemas/User'                        },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error:   { type: 'string'                   },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string'                  },
          },
        },
      },
    },
  },
  // Rutas escaneadas en busca de anotaciones @swagger
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
