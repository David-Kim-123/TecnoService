import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDatos } from '../src/db/database.js';

// El test HTTP se ejecuta con Express instalado (npm install).
// Sin acceso a npm, se informa como OMITIDO en vez de simular un servidor.
const expressInstalado = await import('express').then(() => true).catch(() => false);

test('API HTTP real: salud, crear, listar, consultar, editar, validar y eliminar', {
  skip: expressInstalado ? false : 'Express no está instalado en este entorno; ejecutar npm install'
}, async () => {
  const { crearApp } = await import('../src/app.js');
  const db = abrirBaseDatos(':memory:');
  const server = crearApp(db).listen(0, '127.0.0.1');
  await new Promise((resolver) => server.once('listening', resolver));
  const base = `http://127.0.0.1:${server.address().port}`;
  const peticion = async (ruta, metodo = 'GET', datos) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: datos ? { 'Content-Type': 'application/json' } : {},
      body: datos ? JSON.stringify(datos) : undefined
    });
    return { estado: r.status, datos: await r.json() };
  };
  try {
    const salud = await peticion('/api/salud');
    assert.equal(salud.estado, 200);
    const cliente = {
      tipo: 'empresa', nombre: 'Hotel Ejemplo', documento: '900123456-7', telefono: '3001234567',
      correo: '', direccion: 'Calle 10 # 5-20', ciudad: 'Neiva', observaciones: ''
    };
    const nuevo = await peticion('/api/clientes', 'POST', cliente);
    assert.equal(nuevo.estado, 201);
    assert.equal(nuevo.datos.id, 1);
    assert.equal((await peticion('/api/clientes?buscar=Hotel')).datos.total, 1);
    assert.equal((await peticion('/api/clientes/1')).datos.nombre, 'Hotel Ejemplo');
    assert.equal((await peticion('/api/clientes', 'POST', cliente)).estado, 409);
    assert.equal((await peticion('/api/clientes', 'POST', { ...cliente, telefono: '1' })).estado, 422);
    const editado = await peticion('/api/clientes/1', 'PUT', { ...cliente, nombre: 'Hotel Central', activo: true });
    assert.equal(editado.estado, 200);
    assert.equal(editado.datos.nombre, 'Hotel Central');
    assert.equal((await peticion('/api/clientes/1', 'DELETE')).datos.resultado, 'eliminado');
    assert.equal((await peticion('/api/clientes/1')).estado, 404);
  } finally {
    await new Promise((resolver) => server.close(resolver));
    db.close();
  }
});
