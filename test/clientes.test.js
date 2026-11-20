import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { abrirBaseDatos } from '../src/db/database.js';
import { crearClienteRepositorio } from '../src/clientes/cliente.repository.js';
import { crearClienteServicio, ErrorAplicacion } from '../src/clientes/cliente.service.js';

const ejemplo = (nombre = 'Hotel Ejemplo') => ({
  tipo: 'empresa', nombre, documento: '900123456-7', telefono: '300 123 4567',
  correo: 'contacto@hotel.test', direccion: 'Calle 10 # 5-20', ciudad: 'Neiva',
  observaciones: 'Servicio institucional'
});

function entorno() {
  const db = abrirBaseDatos(':memory:');
  const repo = crearClienteRepositorio(db);
  return { db, repo, servicio: crearClienteServicio(repo) };
}

test('SQLite habilita claves foráneas y crea las siete entidades', (t) => {
  const { db } = entorno();
  t.after(() => db.close());
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(f => f.name);
  for (const tabla of ['clientes', 'equipos', 'ordenes_servicio', 'intervenciones', 'cuentas_cobro', 'detalles_cobro', 'configuracion_emisor']) {
    assert.ok(tablas.includes(tabla), `No existe ${tabla}`);
  }
});

test('CRUD de clientes: crear, consultar, listar, editar y eliminar', (t) => {
  const { db, servicio } = entorno(); t.after(() => db.close());
  const creado = servicio.crear(ejemplo());
  assert.equal(creado.id, 1);
  assert.equal(creado.activo, 1);
  assert.equal(servicio.obtener(1).nombre, 'Hotel Ejemplo');
  assert.equal(servicio.listar({ buscar: 'Hotel' }).total, 1);
  assert.equal(servicio.resumen().activos, 1);
  const actualizado = servicio.actualizar(1, { ...ejemplo('Hotel Actualizado'), activo: false });
  assert.equal(actualizado.nombre, 'Hotel Actualizado');
  assert.equal(actualizado.activo, 0);
  assert.equal(servicio.listar({ estado: 'inactivos' }).total, 1);
  assert.equal(servicio.eliminar(1).resultado, 'eliminado');
  assert.equal(servicio.resumen().total, 0);
  assert.throws(() => servicio.obtener(1), { estado: 404 });
});

test('Documento duplicado y entradas inválidas se rechazan', (t) => {
  const { db, servicio } = entorno(); t.after(() => db.close());
  servicio.crear(ejemplo());
  assert.throws(() => servicio.crear({ ...ejemplo('Otro Hotel') }), (e) => e.estado === 409);
  assert.throws(() => servicio.crear({ ...ejemplo(), nombre: 'X' }), (e) => e.estado === 422);
  assert.throws(() => servicio.crear({ ...ejemplo(), correo: 'correo-invalido' }), (e) => e.estado === 422);
  assert.throws(() => servicio.crear({ ...ejemplo(), telefono: '1' }), (e) => e.estado === 422);
  assert.throws(() => servicio.actualizar(1, { ...ejemplo(), activo: 'no' }), (e) => e.estado === 422);
  assert.throws(() => servicio.obtener('1 OR 1=1'), (e) => e.estado === 400);
});

test('Búsquedas parametrizadas: el carácter % se interpreta literalmente', (t) => {
  const { db, servicio } = entorno(); t.after(() => db.close());
  servicio.crear(ejemplo());
  assert.equal(servicio.listar({ buscar: '%' }).total, 0);
  assert.equal(servicio.listar({ buscar: "' OR 1=1 --" }).total, 0);
  assert.equal(servicio.listar({ buscar: '300' }).total, 1);
});

test('Eliminación con equipos relacionados desactiva al cliente y preserva historial', (t) => {
  const { db, servicio } = entorno(); t.after(() => db.close());
  const cliente = servicio.crear(ejemplo());
  db.prepare(`INSERT INTO equipos(cliente_id, codigo_interno, tipo, ubicacion)
    VALUES (?, ?, ?, ?)`).run(cliente.id, 'AA-301', 'Aire acondicionado', 'Habitación 301');
  const resultado = servicio.eliminar(cliente.id);
  assert.equal(resultado.resultado, 'desactivado');
  assert.equal(servicio.obtener(cliente.id).activo, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM equipos').get().n, 1);
  assert.throws(() => db.prepare('DELETE FROM clientes WHERE id=?').run(cliente.id), /FOREIGN KEY constraint failed/);
});

test('La base de datos conserva información tras cerrar y reabrir', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tecnoservice-'));
  let db2;
  t.after(() => {
    db2?.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const path = join(dir, 'clientes.sqlite');
  const db1 = abrirBaseDatos(path);
  const creado = crearClienteServicio(crearClienteRepositorio(db1)).crear(ejemplo());
  db1.close();
  db2 = abrirBaseDatos(path);
  assert.equal(crearClienteRepositorio(db2).obtener(creado.id).nombre, 'Hotel Ejemplo');
});

test('Equipo e intervención deben coincidir con el cliente de la orden', (t) => {
  const { db, servicio } = entorno(); t.after(() => db.close());
  const primero = servicio.crear(ejemplo());
  const segundo = servicio.crear({ ...ejemplo('Segundo Hotel'), documento: '900123456-8' });
  db.prepare('INSERT INTO equipos(cliente_id,codigo_interno,tipo,ubicacion) VALUES(?,?,?,?)')
    .run(primero.id, 'AA-301', 'Aire acondicionado', '301');
  db.prepare('INSERT INTO ordenes_servicio(numero,cliente_id,fecha_servicio) VALUES(?,?,?)')
    .run('OS-001', segundo.id, '2026-11-20');
  assert.throws(() => db.prepare(`INSERT INTO intervenciones(equipo_id,orden_id,fecha_intervencion,tipo)
    VALUES (1,1,'2026-11-20','preventivo')`).run(), /mismo cliente/);
});

test('La base impide cobros vigentes duplicados de una intervención', (t) => {
  const { db, servicio } = entorno(); t.after(() => db.close());
  servicio.crear(ejemplo());
  db.prepare("INSERT INTO equipos(cliente_id,codigo_interno,tipo,ubicacion) VALUES (1,'AA-301','Aire','301')").run();
  db.prepare("INSERT INTO ordenes_servicio(numero,cliente_id,fecha_servicio) VALUES ('OS-001',1,'2026-11-20')").run();
  db.prepare(`INSERT INTO intervenciones(equipo_id,orden_id,fecha_intervencion,tipo,mano_obra_cop)
    VALUES (1,1,'2026-11-20','preventivo',90000)`).run();
  db.prepare('INSERT INTO cuentas_cobro(cliente_id) VALUES (1)').run();
  db.prepare('INSERT INTO cuentas_cobro(cliente_id) VALUES (1)').run();
  const statement = db.prepare(`INSERT INTO detalles_cobro(cuenta_id,intervencion_id,concepto_snapshot,equipo_snapshot,
    cantidad,valor_unitario_cop,cobro_vigente) VALUES (?,1,'Mantenimiento','AA-301',1,90000,1)`);
  statement.run(1);
  assert.throws(() => statement.run(2), /UNIQUE constraint failed/);
  db.prepare('UPDATE detalles_cobro SET cobro_vigente=0 WHERE cuenta_id=1').run();
  statement.run(2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM detalles_cobro').get().n, 2);
});
