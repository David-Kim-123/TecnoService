const formulario = $('form-equipo');
const dialogo = $('dialog-equipo');
const detalle = $('dialog-detalle');
const selectorCliente = formulario.elements.namedItem('cliente_id');
const selectorEstado = formulario.elements.namedItem('estado');
const estados = { activo: 'Activo', fuera_servicio: 'Fuera de servicio', retirado: 'Retirado' };
let equipoEnEdicion;
let pagina = 1;
let solicitudActual = 0;
let temporizador;

async function cargarOpciones() {
  const clientes = await api('/api/equipos/opciones-clientes');
  selectorCliente.replaceChildren(new Option('Selecciona un cliente', ''));
  for (const cliente of clientes) {
    const nombre = [cliente.nombre, cliente.documento, cliente.activo ? '' : 'Inactivo'].filter(Boolean).join(' · ');
    selectorCliente.add(new Option(nombre, cliente.id));
    $('filtro-cliente').add(new Option(nombre, cliente.id));
  }
  const filtroInicial = new URLSearchParams(location.search).get('cliente_id');
  if (clientes.some(({ id }) => String(id) === filtroInicial)) $('filtro-cliente').value = filtroInicial;
  $('nuevo-equipo').disabled = clientes.length === 0;
  if (!clientes.length) $('ayuda-equipos').textContent = 'Registra un cliente en el módulo Clientes para agregar equipos.';
}

function dibujarTabla(equipos) {
  const tabla = $('tabla-equipos');
  tabla.replaceChildren();
  for (const equipo of equipos) {
    const fila = tabla.insertRow();
    agregarCelda(fila, crearNodo('strong', '', equipo.codigo_interno));
    agregarCelda(fila, equipo.tipo);
    agregarCelda(fila, equipo.cliente_nombre);
    agregarCelda(fila, crearNodo('span', equipo.estado === 'activo' ? 'status' : 'status off', estados[equipo.estado]));
    const acciones = crearNodo('div', 'row-actions');
    acciones.append(
      botonAccion('Ver ficha', '', () => consultar(equipo.id, mostrarFicha)),
      botonAccion('Editar', '', () => consultar(equipo.id, abrirFormulario))
    );
    if (!equipo.tiene_historial || equipo.estado !== 'retirado') {
      acciones.append(botonAccion(equipo.tiene_historial ? 'Retirar' : 'Eliminar', 'danger', (event) => {
        cambiarBaja(equipo, event.currentTarget);
      }));
    }
    agregarCelda(fila, acciones);
  }
  $('estado-vacio').hidden = equipos.length > 0;
}

async function cargarEquipos() {
  const solicitud = ++solicitudActual;
  const consulta = new URLSearchParams({ buscar: $('buscar').value, estado: $('filtro-estado').value, pagina });
  if ($('filtro-cliente').value) consulta.set('cliente_id', $('filtro-cliente').value);
  try {
    const resultado = await api('/api/equipos?' + consulta);
    if (solicitud !== solicitudActual) return;
    pagina = resultado.pagina;
    const paginas = Math.max(1, Math.ceil(resultado.total / resultado.limite));
    dibujarTabla(resultado.registros);
    $('coincidencias').textContent = resultado.total.toLocaleString('es-CO');
    $('rango-resultados').textContent = resultado.total
      ? `Mostrando ${(pagina - 1) * resultado.limite + 1}–${Math.min(pagina * resultado.limite, resultado.total)} de ${resultado.total}`
      : 'Sin registros';
    $('pagina-actual').textContent = `${pagina} / ${paginas}`;
    $('pagina-anterior').disabled = pagina <= 1;
    $('pagina-siguiente').disabled = pagina >= paginas;
  } catch (error) {
    if (solicitud === solicitudActual) notificar(error.message, true);
  }
}

async function consultar(id, presentar) {
  try {
    const equipo = await api('/api/equipos/' + id);
    if (!dialogo.open && !detalle.open) presentar(equipo);
  }
  catch (error) { notificar(error.message, true); }
}

function abrirFormulario(equipo = null) {
  if (dialogo.open) return;
  equipoEnEdicion = equipo;
  formulario.reset();
  $('errores-formulario').hidden = true;
  $('titulo-formulario').textContent = equipo ? 'Editar equipo' : 'Nuevo equipo';
  $('guardar-equipo').textContent = equipo ? 'Guardar cambios' : 'Guardar equipo';
  selectorCliente.disabled = Boolean(equipo?.tiene_historial);
  selectorEstado.disabled = equipo?.estado === 'retirado';
  if (equipo) {
    for (const campo of formulario.elements) {
      if (campo.name) campo.value = equipo[campo.name] ?? '';
    }
  } else {
    selectorCliente.value = $('filtro-cliente').value;
  }
  dialogo.showModal();
}

function mostrarFicha(equipo) {
  const titulo = `${equipo.codigo_interno} · ${equipo.tipo}`;
  $('titulo-detalle').textContent = titulo;
  $('titulo-impresion').textContent = 'TecnoService · Ficha técnica · ' + titulo;
  const campos = [
    ['Código interno', equipo.codigo_interno], ['Tipo de equipo', equipo.tipo],
    ['Cliente', equipo.cliente_nombre], ['Documento / NIT', equipo.cliente_documento],
    ['Teléfono', equipo.cliente_telefono], ['Dirección del cliente', equipo.cliente_direccion],
    ['Ciudad', equipo.cliente_ciudad], ['Ubicación del equipo', equipo.ubicacion],
    ['Marca', equipo.marca], ['Modelo', equipo.modelo],
    ['Número de serie', equipo.numero_serie], ['Capacidad', equipo.capacidad],
    ['Fecha de instalación', equipo.fecha_instalacion],
    ['Próximo mantenimiento', equipo.proximo_mantenimiento_programado],
    ['Estado', estados[equipo.estado]], ['Historial técnico', equipo.tiene_historial ? 'Con intervenciones' : 'Sin intervenciones'],
    ['Observaciones', equipo.observaciones, true]
  ];
  for (const id of ['detalle-equipo', 'detalle-impresion']) {
    const contenedor = $(id);
    contenedor.replaceChildren();
    for (const [etiqueta, valor, ancho] of campos) {
      const item = crearNodo('div', ancho ? 'wide' : '');
      item.append(crearNodo('dt', '', etiqueta), crearNodo('dd', '', valor || '—'));
      contenedor.append(item);
    }
  }
  if (!detalle.open) detalle.showModal();
}

async function cambiarBaja(equipo, boton) {
  const retirar = Boolean(equipo.tiene_historial);
  const accion = retirar ? 'retirar' : 'eliminar de forma permanente';
  const aviso = retirar ? '\n\nSe conservará su historial.' : '';
  if (!confirm(`¿Deseas ${accion} el equipo "${equipo.codigo_interno}"?${aviso}`)) return;
  boton.disabled = true;
  try {
    await api(`/api/equipos/${equipo.id}${retirar ? '/retirar' : ''}`, { method: retirar ? 'PATCH' : 'DELETE' });
    notificar(retirar ? 'Equipo retirado. Se conservó su historial.' : 'Equipo eliminado.');
  } catch (error) {
    notificar(error.message, true);
  } finally {
    await cargarEquipos();
    boton.disabled = false;
  }
}

formulario.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = equipoEnEdicion?.id;
  const boton = $('guardar-equipo');
  if (boton.disabled) return;
  const datos = Object.fromEntries(new FormData(formulario));
  datos.cliente_id = selectorCliente.value;
  datos.estado = selectorEstado.value;
  boton.disabled = true;
  $('errores-formulario').hidden = true;
  try {
    const equipo = await api(id ? '/api/equipos/' + id : '/api/equipos', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(datos)
    });
    dialogo.close();
    $('buscar').value = equipo.codigo_interno.slice(0, 100);
    $('filtro-cliente').value = '';
    $('filtro-estado').value = 'todos';
    pagina = 1;
    notificar(id ? 'Equipo actualizado.' : 'Equipo registrado.');
    await cargarEquipos();
  } catch (error) {
    $('errores-formulario').textContent = error.message;
    $('errores-formulario').hidden = false;
  } finally { boton.disabled = false; }
});

$('nuevo-equipo').addEventListener('click', () => abrirFormulario());
for (const id of ['cerrar-formulario', 'cancelar-formulario']) {
  $(id).addEventListener('click', () => { if (!$('guardar-equipo').disabled) dialogo.close(); });
}
dialogo.addEventListener('cancel', (event) => { if ($('guardar-equipo').disabled) event.preventDefault(); });
$('cerrar-detalle').addEventListener('click', () => detalle.close());
$('imprimir-ficha').addEventListener('click', () => window.print());
window.addEventListener('beforeprint', () => {
  const ficha = detalle.open;
  document.body.classList.toggle('imprimir-equipo', ficha);
  $('ficha-impresion').hidden = !ficha;
});
window.addEventListener('afterprint', () => {
  document.body.classList.remove('imprimir-equipo');
  $('ficha-impresion').hidden = true;
});
$('buscar').addEventListener('input', () => {
  ++solicitudActual;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { pagina = 1; cargarEquipos(); }, 250);
});
for (const id of ['filtro-cliente', 'filtro-estado']) {
  $(id).addEventListener('change', () => { pagina = 1; cargarEquipos(); });
}
$('pagina-anterior').addEventListener('click', () => { pagina--; cargarEquipos(); });
$('pagina-siguiente').addEventListener('click', () => { pagina++; cargarEquipos(); });

cargarOpciones().catch((error) => notificar(error.message, true)).finally(cargarEquipos);
