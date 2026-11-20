// La capa de acceso a datos recibe la conexión para facilitar pruebas sin mocks.
export function crearClienteRepositorio(db) {
  const columnas = `id, tipo, nombre, documento, telefono, correo, direccion,
    ciudad, observaciones, activo, creado_en, actualizado_en`;

  return {
    obtener(id) {
      return db.prepare(`SELECT ${columnas} FROM clientes WHERE id = ?`).get(id) ?? null;
    },
    documentoEnUso(documento, excluirId = 0) {
      if (!documento) return false;
      return !!db.prepare('SELECT 1 FROM clientes WHERE documento = ? AND id <> ?').get(documento, excluirId);
    },
    listar({ buscar, estado, limite, pagina }) {
      const condiciones = [];
      const params = [];
      if (buscar) {
        // Escape LIKE evita que % y _ del usuario se interpreten como comodines.
        const literal = buscar.replace(/[!%_]/g, caracter => '!' + caracter);
        condiciones.push(`(nombre LIKE ? ESCAPE '!' COLLATE NOCASE
          OR documento LIKE ? ESCAPE '!' COLLATE NOCASE
          OR telefono LIKE ? ESCAPE '!' COLLATE NOCASE)`);
        params.push(`%${literal}%`, `%${literal}%`, `%${literal}%`);
      }
      if (estado !== 'todos') {
        condiciones.push('activo = ?');
        params.push(estado === 'activos' ? 1 : 0);
      }
      const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
      const total = db.prepare(`SELECT COUNT(*) AS total FROM clientes ${where}`).get(...params).total;
      const registros = db.prepare(`SELECT ${columnas} FROM clientes ${where}
        ORDER BY actualizado_en DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limite, (pagina - 1) * limite);
      return { registros, total, pagina, limite };
    },
    resumen() {
      return db.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END),0) AS activos,
        COALESCE(SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END),0) AS inactivos
        FROM clientes`).get();
    },
    crear(datos) {
      const resultado = db.prepare(`INSERT INTO clientes
        (tipo, nombre, documento, telefono, correo, direccion, ciudad, observaciones, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        datos.tipo, datos.nombre, datos.documento, datos.telefono, datos.correo,
        datos.direccion, datos.ciudad, datos.observaciones, datos.activo
      );
      return this.obtener(Number(resultado.lastInsertRowid));
    },
    actualizar(id, datos) {
      db.prepare(`UPDATE clientes SET tipo=?, nombre=?, documento=?, telefono=?, correo=?,
        direccion=?, ciudad=?, observaciones=?, activo=?,
        actualizado_en=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(
        datos.tipo, datos.nombre, datos.documento, datos.telefono, datos.correo,
        datos.direccion, datos.ciudad, datos.observaciones, datos.activo, id
      );
      return this.obtener(id);
    },
    dependencias(id) {
      return db.prepare(`SELECT
        (SELECT COUNT(*) FROM equipos WHERE cliente_id = ?) +
        (SELECT COUNT(*) FROM ordenes_servicio WHERE cliente_id = ?) +
        (SELECT COUNT(*) FROM cuentas_cobro WHERE cliente_id = ?) AS total`).get(id, id, id).total;
    },
    desactivar(id) {
      db.prepare(`UPDATE clientes SET activo=0,
        actualizado_en=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(id);
      return this.obtener(id);
    },
    eliminar(id) {
      return db.prepare('DELETE FROM clientes WHERE id=?').run(id).changes;
    }
  };
}
