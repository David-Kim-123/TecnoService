# TecnoService — análisis técnico v0.1.0

## Resumen

Aplicación web monolítica, local, para gestionar clientes, equipos, órdenes, intervenciones, hojas de vida y cuentas de cobro.

## Requisitos funcionales y fases

1. **Primera entrega (implementada):** CRUD de clientes con búsqueda, filtros, detalle, validación, borrado seguro y persistencia.
2. Equipos: CRUD vinculado a cada cliente, ficha técnica y baja lógica.
3. Intervenciones: historial derivado de registros asociados a equipo y orden.
4. Órdenes: intervenciones de un mismo cliente y total calculado.
5. Cuentas de cobro: borradores, emisión con snapshots, numeración única, anulaciones y PDF desde impresión.
6. Mantenimientos: fecha explícita de equipo o última intervención no anulada; estados al día, próximo, vencido y sin programación.
7. Dashboard, pruebas integrales y documentación final.

## Arquitectura

- Frontend: HTML, CSS, JS nativo.
- REST: Express sobre Node.js.
- Persistencia: SQLite mediante `node:sqlite`; consultas parametrizadas.
- Alcance de red: `127.0.0.1` (sin autenticación en esta versión).

## Relaciones principales

- `clientes` 1:N `equipos`
- `clientes` 1:N `ordenes_servicio`
- `clientes` 1:N `cuentas_cobro`
- `equipos` 1:N `intervenciones`
- `ordenes_servicio` 1:N `intervenciones`
- `cuentas_cobro` 1:N `detalles_cobro`
- `intervenciones` 1:N `detalles_cobro` históricos (máximo 1 detalle con `cobro_vigente=1`)
- `configuracion_emisor`: registro único no dependiente.

La hoja de vida será una **consulta**, no una tabla independiente. Los totales de intervenciones y detalles son columnas generadas; los totales de órdenes y cuentas se calcularán desde los detalles pertinentes.

## Reglas importantes

- `ON DELETE RESTRICT`, sin cascadas destructivas.
- Si un cliente tiene equipos/órdenes/cuentas, `DELETE /api/clientes/:id` lo **desactiva**. Si no tiene referencias, se elimina físicamente.
- Una intervención solo puede vincularse con una orden del mismo cliente. Triggers evitan cambios de cliente que corrompan ese vínculo.
- Los importes monetarios se almacenan como enteros COP.
- `detalles_cobro` conserva concepto, equipo, cantidad, precio y descuento congelados al emitir.
- Un índice parcial único impide dos cobros vigentes para la misma intervención. En fase de cobros, la transición emitir/anular debe realizarse en una transacción y bloquear cambios de los documentos emitidos.
- Una cuenta de cobro no es una factura electrónica.

## Riesgos y decisiones pendientes

1. **Módulo de cobros no construido:** diseñar y probar las transacciones de emisión/anulación, consecutivos, inmovilidad de snapshots y coherencia de estados. La existencia de tablas no significa que esa lógica esté implementada.
2. **Sin autenticación:** solamente ejecutar en localhost; incorporar identidad y permisos antes de publicar en red.
3. **API `node:sqlite`:** depende de Node.js >= 22.13 y aún lleva advertencia de API experimental; evitar versiones previas.
4. **Migraciones futuras:** al evolucionar el modelo, usar scripts versionados; no editar esquemas de producción sin migración.
5. **Mantenimiento:** elegir precedencia entre programación manual y la última intervención que registre próxima fecha; definir qué sucede al anularla.
6. **Estado inactivo:** mantener los historiales, pero evitar crear nuevas órdenes para ese cliente desde los módulos futuros.
7. **Datos sensibles:** el archivo SQLite debe copiarse a respaldos externos apropiados y no subirlo a GitHub.

## Estructura de código

```text
TecnoService/
├── public/              # HTML, CSS y JS
├── src/
│   ├── app.js           # Express y errores
│   ├── server.js        # localhost
│   ├── db/              # conexión y schema.sql
│   └── clientes/        # rutas, servicio y repositorio
├── test/                # pruebas automáticas
├── docs/                # análisis técnico
├── package.json
└── README.md
```

## Dependencias estrictamente necesarias

- **Node.js:** entorno de ejecución y API SQLite incorporada.
- **Express:** rutas REST, JSON y archivos estáticos. Única dependencia npm.
- **SQLite:** almacenamiento local en archivo persistente.
- **HTML/CSS/JS:** interfaz nativa y responsive.

Git, VS Code y npm son herramientas de desarrollo, no dependencias en producción. No se utiliza ORM, frontend framework, Docker, librerías de PDF o servicios de pago.
