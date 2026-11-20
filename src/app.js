import express from 'express';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearRutasClientes } from './clientes/cliente.routes.js';
import { ErrorAplicacion } from './clientes/cliente.service.js';
import { crearRutasEquipos } from './equipos/equipo.routes.js';

const raizProyecto = fileURLToPath(new URL('../', import.meta.url));

export function crearApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/salud', (_req, res) => res.json({ estado: 'ok', version: '0.1.0' }));
  app.use('/api/clientes', crearRutasClientes(db));
  app.use('/api/equipos', crearRutasEquipos(db));
  app.use(express.static(join(raizProyecto, 'public')));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta API no encontrada.' }));
  app.use((error, _req, res, _next) => {
    if (error instanceof ErrorAplicacion) {
      return res.status(error.estado).json({ error: error.message, detalles: error.detalles });
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'JSON inválido.' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'La solicitud supera el tamaño permitido.' });
    }
    // La base también impone la restricción UNIQUE, incluso ante solicitudes simultáneas.
    if (String(error.message).includes('UNIQUE constraint failed: clientes.documento')) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese documento o NIT.' });
    }
    if (String(error.message).includes('UNIQUE constraint failed: equipos.codigo_interno')) {
      return res.status(409).json({ error: 'Ya existe un equipo con ese código interno.' });
    }
    console.error('Error interno:', error);
    return res.status(500).json({ error: 'No fue posible completar la operación.' });
  });
  return app;
}
