-- TecnoService: esquema relacional inicial (estructura preparada, solo clientes tiene CRUD en v0.1.0).
-- Los montos son ENTEROS en pesos colombianos.

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('persona', 'empresa')),
  nombre TEXT NOT NULL CHECK (length(trim(nombre)) BETWEEN 2 AND 150),
  documento TEXT UNIQUE,
  telefono TEXT NOT NULL,
  correo TEXT,
  direccion TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  observaciones TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_activo ON clientes(activo);

CREATE TABLE IF NOT EXISTS equipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  codigo_interno TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  numero_serie TEXT,
  capacidad TEXT,
  ubicacion TEXT NOT NULL,
  fecha_instalacion TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'retirado', 'fuera_servicio')),
  observaciones TEXT NOT NULL DEFAULT '',
  proximo_mantenimiento_programado TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_equipos_cliente ON equipos(cliente_id);

CREATE TABLE IF NOT EXISTS ordenes_servicio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  fecha_servicio TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada', 'anulada')),
  observaciones TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON ordenes_servicio(cliente_id);

CREATE TABLE IF NOT EXISTS intervenciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE RESTRICT,
  orden_id INTEGER NOT NULL REFERENCES ordenes_servicio(id) ON DELETE RESTRICT,
  fecha_intervencion TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('preventivo', 'correctivo', 'reparacion', 'instalacion', 'diagnostico', 'otro')),
  diagnostico TEXT NOT NULL DEFAULT '',
  trabajo_realizado TEXT NOT NULL DEFAULT '',
  repuestos_utilizados TEXT NOT NULL DEFAULT '',
  mano_obra_cop INTEGER NOT NULL DEFAULT 0 CHECK (mano_obra_cop >= 0),
  repuestos_cop INTEGER NOT NULL DEFAULT 0 CHECK (repuestos_cop >= 0),
  total_cop INTEGER GENERATED ALWAYS AS (mano_obra_cop + repuestos_cop) VIRTUAL,
  estado TEXT NOT NULL DEFAULT 'registrada' CHECK (estado IN ('registrada', 'anulada')),
  proximo_mantenimiento TEXT,
  observaciones TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_intervenciones_equipo ON intervenciones(equipo_id, fecha_intervencion);
CREATE INDEX IF NOT EXISTS idx_intervenciones_orden ON intervenciones(orden_id);

-- Integridad inter-tablas: no asociar a una orden un equipo de otro cliente.
CREATE TRIGGER IF NOT EXISTS trg_intervencion_cliente_insert
BEFORE INSERT ON intervenciones
BEGIN
  SELECT RAISE(ABORT, 'El equipo y la orden deben pertenecer al mismo cliente')
  WHERE (SELECT cliente_id FROM equipos WHERE id = NEW.equipo_id)
     <> (SELECT cliente_id FROM ordenes_servicio WHERE id = NEW.orden_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_intervencion_cliente_update
BEFORE UPDATE OF equipo_id, orden_id ON intervenciones
BEGIN
  SELECT RAISE(ABORT, 'El equipo y la orden deben pertenecer al mismo cliente')
  WHERE (SELECT cliente_id FROM equipos WHERE id = NEW.equipo_id)
     <> (SELECT cliente_id FROM ordenes_servicio WHERE id = NEW.orden_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_equipo_cliente_inmutable
BEFORE UPDATE OF cliente_id ON equipos
WHEN EXISTS (SELECT 1 FROM intervenciones WHERE equipo_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'No se puede cambiar de cliente un equipo con historial');
END;
CREATE TRIGGER IF NOT EXISTS trg_orden_cliente_inmutable
BEFORE UPDATE OF cliente_id ON ordenes_servicio
WHEN EXISTS (SELECT 1 FROM intervenciones WHERE orden_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'No se puede cambiar el cliente de una orden con historial');
END;

CREATE TABLE IF NOT EXISTS configuracion_emisor (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nombre TEXT NOT NULL,
  documento TEXT,
  telefono TEXT,
  correo TEXT,
  direccion TEXT,
  ciudad TEXT,
  informacion_pago TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cuentas_cobro (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  fecha_expedicion TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'emitida', 'anulada')),
  observaciones TEXT NOT NULL DEFAULT '',
  -- Snapshot del documento emitido: preserva nombres/datos aunque cambien después.
  emisor_snapshot TEXT,
  cliente_snapshot TEXT,
  informacion_pago_snapshot TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (estado <> 'emitida' OR (numero IS NOT NULL AND fecha_expedicion IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_cuentas_cliente ON cuentas_cobro(cliente_id);

CREATE TABLE IF NOT EXISTS detalles_cobro (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_cobro(id) ON DELETE RESTRICT,
  intervencion_id INTEGER NOT NULL REFERENCES intervenciones(id) ON DELETE RESTRICT,
  concepto_snapshot TEXT NOT NULL,
  equipo_snapshot TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  valor_unitario_cop INTEGER NOT NULL CHECK (valor_unitario_cop >= 0),
  descuento_cop INTEGER NOT NULL DEFAULT 0 CHECK (descuento_cop >= 0 AND descuento_cop <= cantidad * valor_unitario_cop),
  subtotal_cop INTEGER GENERATED ALWAYS AS (cantidad * valor_unitario_cop - descuento_cop) VIRTUAL,
  -- Se marcará 1 solamente al EMITIR. Al ANULAR vuelve a 0 sin borrar el detalle.
  cobro_vigente INTEGER NOT NULL DEFAULT 0 CHECK (cobro_vigente IN (0,1)),
  UNIQUE (cuenta_id, intervencion_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_intervencion_cobro_vigente
ON detalles_cobro(intervencion_id) WHERE cobro_vigente = 1;
CREATE INDEX IF NOT EXISTS idx_detalles_cuenta ON detalles_cobro(cuenta_id);

CREATE TRIGGER IF NOT EXISTS trg_detalle_mismo_cliente_insert
BEFORE INSERT ON detalles_cobro
BEGIN
  SELECT RAISE(ABORT, 'La intervención y la cuenta deben pertenecer al mismo cliente')
  WHERE (SELECT cliente_id FROM cuentas_cobro WHERE id = NEW.cuenta_id)
     <> (SELECT e.cliente_id FROM intervenciones i JOIN equipos e ON e.id = i.equipo_id
         WHERE i.id = NEW.intervencion_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_detalle_mismo_cliente_update
BEFORE UPDATE OF cuenta_id, intervencion_id ON detalles_cobro
BEGIN
  SELECT RAISE(ABORT, 'La intervención y la cuenta deben pertenecer al mismo cliente')
  WHERE (SELECT cliente_id FROM cuentas_cobro WHERE id = NEW.cuenta_id)
     <> (SELECT e.cliente_id FROM intervenciones i JOIN equipos e ON e.id = i.equipo_id
         WHERE i.id = NEW.intervencion_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_cuenta_cliente_inmutable
BEFORE UPDATE OF cliente_id ON cuentas_cobro
WHEN EXISTS (SELECT 1 FROM detalles_cobro WHERE cuenta_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'No se puede cambiar el cliente de una cuenta con detalles');
END;
