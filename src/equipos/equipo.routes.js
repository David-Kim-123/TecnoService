import { Router } from 'express';
import { ErrorAplicacion } from '../clientes/cliente.service.js';

const textos = {
  codigo_interno: [60, true], tipo: [100, true], marca: [100], modelo: [100],
  numero_serie: [100], capacidad: [100], ubicacion: [250, true], observaciones: [1000]
};
const fechas = ['fecha_instalacion', 'proximo_mantenimiento_programado'];
const estados = ['activo', 'fuera_servicio', 'retirado'];
const columnas = [...Object.keys(textos), ...fechas, 'estado'];
const origen = 'FROM equipos e JOIN clientes c ON c.id = e.cliente_id';
const ficha = `SELECT e.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento,
  c.telefono AS cliente_telefono, c.direccion AS cliente_direccion, c.ciudad AS cliente_ciudad,
  EXISTS (SELECT 1 FROM intervenciones i WHERE i.equipo_id = e.id) AS tiene_historial`;

function identificador(valor, mensaje, estado = 400) {
  const id = typeof valor === 'string' || typeof valor === 'number' ? Number(valor) : NaN;
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== String(valor)) {
    throw new ErrorAplicacion(estado, mensaje);
  }
  return id;
}

function validar(entrada, anterior) {
  if (!entrada || Array.isArray(entrada) || typeof entrada !== 'object') {
    throw new ErrorAplicacion(422, 'Debes enviar un objeto JSON válido.');
  }
  const errores = {};
  const datos = {};
  for (const [clave, [maximo, obligatorio]] of Object.entries(textos)) {
    const valor = entrada[clave];
    const limpio = typeof valor === 'string' ? valor.trim() : '';
    if (valor != null && typeof valor !== 'string') errores[clave] = 'Ingresa un texto.';
    else if (obligatorio && !limpio) errores[clave] = 'Este campo es obligatorio.';
    else if (limpio.length > maximo) errores[clave] = `Máximo ${maximo} caracteres.`;
    datos[clave] = limpio || (clave === 'observaciones' ? '' : null);
  }
  for (const clave of fechas) {
    const fecha = entrada[clave];
    if (fecha != null && fecha !== '') {
      const parsed = new Date(typeof fecha === 'string' ? fecha : NaN);
      if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== fecha || fecha.startsWith('0000')) {
        errores[clave] = 'Ingresa una fecha válida (AAAA-MM-DD).';
      }
    }
    datos[clave] = fecha || null;
  }
  datos.estado = entrada.estado ?? anterior?.estado ?? 'activo';
  const permitidos = anterior?.estado === 'retirado' ? ['retirado'] : ['activo', 'fuera_servicio'];
  if (!permitidos.includes(datos.estado)) errores.estado = 'Selecciona un estado permitido.';
  if (Object.keys(errores).length) throw new ErrorAplicacion(422, 'Revisa los campos del formulario.', errores);
  datos.cliente_id = identificador(entrada.cliente_id, 'Selecciona un cliente válido.', 422);
  return datos;
}

export function crearRutasEquipos(db) {
  const router = Router();
  const consultar = db.prepare(`${ficha} ${origen} WHERE e.id = ?`);
  const obtener = (valor) => {
    const equipo = consultar.get(identificador(valor, 'Identificador de equipo inválido.'));
    if (!equipo) throw new ErrorAplicacion(404, 'Equipo no encontrado.');
    return equipo;
  };
  const verificarCliente = db.prepare('SELECT 1 FROM clientes WHERE id = ?');
  const insertar = db.prepare(`INSERT INTO equipos (cliente_id, ${columnas.join(', ')})
    VALUES (?, ${columnas.map(() => '?').join(', ')})`);
  const asignaciones = columnas.map((columna) => `${columna} = ?`).join(', ');
  const actualizar = db.prepare(`UPDATE equipos SET ${asignaciones} WHERE id = ?`);
  const actualizarCliente = db.prepare(`UPDATE equipos SET ${asignaciones}, cliente_id = ? WHERE id = ?`);
  const eliminar = db.prepare('DELETE FROM equipos WHERE id = ?');
  const retirar = db.prepare("UPDATE equipos SET estado = 'retirado' WHERE id = ?");

  const escribir = (operacion) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const resultado = operacion();
      db.exec('COMMIT');
      return resultado;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };

  router.get('/opciones-clientes', (_req, res) => {
    res.json(db.prepare('SELECT id, nombre, documento, activo FROM clientes ORDER BY nombre COLLATE NOCASE, id').all());
  });

  router.get('/', (req, res) => {
    const { buscar = '', estado = 'todos', cliente_id, pagina = '1' } = req.query;
    if (typeof buscar !== 'string' || buscar.length > 100) throw new ErrorAplicacion(400, 'Búsqueda inválida.');
    if (estado !== 'todos' && !estados.includes(estado)) throw new ErrorAplicacion(400, 'Filtro de estado inválido.');
    const numero = identificador(pagina, 'Página inválida.');
    const cliente = cliente_id === undefined ? null : identificador(cliente_id, 'Identificador de cliente inválido.');
    const patron = buscar.trim().toLocaleLowerCase('es-CO').replace(/[!%_]/g, '!$&');
    const condiciones = `WHERE (? IS NULL OR e.cliente_id = ?) AND (? = 'todos' OR e.estado = ?)
      AND buscar_equipo(e.codigo_interno, e.tipo, e.marca, e.modelo, e.numero_serie, e.ubicacion, c.nombre)
      LIKE ? ESCAPE '!'`;
    const parametros = [cliente, cliente, estado, estado, `%${patron}%`];
    const limite = 20;
    const { total } = db.prepare(`SELECT COUNT(*) AS total ${origen} ${condiciones}`).get(...parametros);
    const paginaActual = Math.min(numero, Math.max(1, Math.ceil(total / limite)));
    const registros = db.prepare(`${ficha} ${origen} ${condiciones}
      ORDER BY e.codigo_interno COLLATE NOCASE, e.id LIMIT ? OFFSET ?`)
      .all(...parametros, limite, (paginaActual - 1) * limite);
    res.json({ registros, total, limite, pagina: paginaActual });
  });

  db.function('buscar_equipo', { varargs: true, deterministic: true },
    (...campos) => campos.join('\n').toLocaleLowerCase('es-CO'));

  router.get('/:id', (req, res) => res.json(obtener(req.params.id)));
  router.post('/', (req, res) => {
    const datos = validar(req.body);
    const equipo = escribir(() => {
      if (!verificarCliente.get(datos.cliente_id)) throw new ErrorAplicacion(422, 'El cliente seleccionado no existe.');
      return consultar.get(insertar.run(datos.cliente_id, ...columnas.map((clave) => datos[clave])).lastInsertRowid);
    });
    res.status(201).json(equipo);
  });
  router.put('/:id', (req, res) => {
    res.json(escribir(() => {
      const equipo = obtener(req.params.id);
      const datos = validar(req.body, equipo);
      const valores = columnas.map((clave) => datos[clave]);
      if (datos.cliente_id === equipo.cliente_id) actualizar.run(...valores, equipo.id);
      else {
        if (equipo.tiene_historial) throw new ErrorAplicacion(409, 'El equipo con historial conserva su cliente.');
        if (!verificarCliente.get(datos.cliente_id)) throw new ErrorAplicacion(422, 'El cliente seleccionado no existe.');
        actualizarCliente.run(...valores, datos.cliente_id, equipo.id);
      }
      return consultar.get(equipo.id);
    }));
  });
  router.delete('/:id', (req, res) => {
    res.json(escribir(() => {
      const equipo = obtener(req.params.id);
      if (equipo.tiene_historial) throw new ErrorAplicacion(409, 'El equipo tiene historial. Usa la opción Retirar.');
      eliminar.run(equipo.id);
      return { resultado: 'eliminado', equipoId: equipo.id };
    }));
  });
  router.patch('/:id/retirar', (req, res) => {
    res.json(escribir(() => {
      const equipo = obtener(req.params.id);
      if (!equipo.tiene_historial) throw new ErrorAplicacion(409, 'El retiro se aplica a equipos con historial.');
      retirar.run(equipo.id);
      return consultar.get(equipo.id);
    }));
  });
  return router;
}
