import test from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/app.js';
import { abrirBaseDatos } from '../src/db/database.js';

test('Equipos: CRUD, búsquedas y conservación de intervenciones', async () => {
  const db = abrirBaseDatos(':memory:');
  const server = crearApp(db).listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function pedir(ruta, estado, method = 'GET', datos) {
      const respuesta = await fetch(base + ruta, {
        method,
        headers: datos ? { 'Content-Type': 'application/json' } : {},
        body: datos ? JSON.stringify(datos) : undefined
      });
      const cuerpo = await respuesta.json();
      assert.equal(respuesta.status, estado, JSON.stringify(cuerpo));
      return cuerpo;
    }

    const cliente = { tipo: 'empresa', nombre: 'Clínica Central', telefono: '3001234567', direccion: 'Calle 10', ciudad: 'Neiva' };
    const { id: clienteId } = await pedir('/api/clientes', 201, 'POST', cliente);
    const { id: otroId } = await pedir('/api/clientes', 201, 'POST', { ...cliente, nombre: 'Otro cliente' });
    const api = '/api/equipos';
    const datos = { cliente_id: clienteId, codigo_interno: 'A%_001', tipo: 'Aire acondicionado', ubicacion: 'Segundo piso', fecha_instalacion: '2024-02-29' };
    assert.equal((await pedir(api + '/opciones-clientes', 200)).length, 2);
    await pedir(api, 422, 'POST', { ...datos, cliente_id: 999 });
    await pedir(api, 422, 'POST', { ...datos, fecha_instalacion: '2026-02-29' });
    const equipo = await pedir(api, 201, 'POST', datos);
    assert.equal(equipo.cliente_nombre, cliente.nombre);
    await pedir(api, 409, 'POST', datos);
    await pedir(api, 201, 'POST', { ...datos, codigo_interno: 'AXX001' });
    assert.equal((await pedir(api + '?buscar=%25_', 200)).total, 1);
    assert.equal((await pedir(api + '?buscar=CL%C3%8DNICA', 200)).total, 2);
    assert.equal((await pedir(api + '?cliente_id=' + otroId, 200)).total, 0);
    const ruta = api + '/' + equipo.id;
    assert.equal((await pedir(ruta, 200)).fecha_instalacion, '2024-02-29');
    assert.equal((await pedir(ruta, 200, 'PUT', { ...datos, cliente_id: otroId })).cliente_id, otroId);
    await pedir(ruta + '/retirar', 409, 'PATCH');
    assert.equal((await pedir(ruta, 200, 'DELETE')).resultado, 'eliminado');
    await pedir(ruta, 404);

    const conHistorial = await pedir(api, 201, 'POST', datos);
    const rutaHistorial = api + '/' + conHistorial.id;
    const orden = db.prepare("INSERT INTO ordenes_servicio (numero, cliente_id, fecha_servicio) VALUES ('T-01', ?, '2026-01-01')")
      .run(clienteId).lastInsertRowid;
    db.prepare(`INSERT INTO intervenciones (equipo_id, orden_id, fecha_intervencion, tipo)
      VALUES (?, ?, '2026-01-01', 'diagnostico')`).run(conHistorial.id, orden);
    assert.equal((await pedir(rutaHistorial, 200)).tiene_historial, 1);
    await pedir(rutaHistorial, 409, 'DELETE');
    await pedir(rutaHistorial, 409, 'PUT', { ...datos, cliente_id: otroId });
    assert.equal((await pedir(rutaHistorial, 200, 'PUT', { ...datos, marca: 'Marca de prueba' })).marca, 'Marca de prueba');
    assert.equal((await pedir(rutaHistorial + '/retirar', 200, 'PATCH')).estado, 'retirado');
    assert.equal((await pedir(api + '?estado=retirado', 200)).total, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM intervenciones').get().total, 1);
    assert.equal((await pedir('/api/clientes/' + clienteId, 200, 'DELETE')).resultado, 'desactivado');
    assert.equal((await pedir(rutaHistorial, 200)).cliente_id, clienteId);
    assert.match(await (await fetch(base + '/equipos.html')).text(), /Imprimir ficha/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
