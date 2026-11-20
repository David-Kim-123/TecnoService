import { Router } from 'express';
import { crearClienteRepositorio } from './cliente.repository.js';
import { crearClienteServicio } from './cliente.service.js';

export function crearRutasClientes(db) {
  const router = Router();
  const servicio = crearClienteServicio(crearClienteRepositorio(db));

  router.get('/resumen', (_req, res) => res.json(servicio.resumen()));
  router.get('/', (req, res) => res.json(servicio.listar(req.query)));
  router.get('/:id', (req, res) => res.json(servicio.obtener(req.params.id)));
  router.post('/', (req, res) => res.status(201).json(servicio.crear(req.body)));
  router.put('/:id', (req, res) => res.json(servicio.actualizar(req.params.id, req.body)));
  router.delete('/:id', (req, res) => res.json(servicio.eliminar(req.params.id)));

  return router;
}
