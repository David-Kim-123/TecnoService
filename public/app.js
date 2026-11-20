const tabla = $('tabla-clientes');
const formulario = $('form-cliente');
const dialogCliente = $('dialog-cliente');
const dialogDetalle = $('dialog-detalle');
let pagina = 1;
let paginas = 1;
let solicitudActual = 0;
let clienteEnDetalle = null;
let temporizadorBusqueda;
function dibujarTabla(clientes) {
  tabla.replaceChildren();
  for (const cliente of clientes) {
    const fila = document.createElement('tr');
    const identidad = crearNodo('div', 'client-cell');
    const iniciales = cliente.nombre.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('');
    identidad.append(crearNodo('span', 'client-initials', iniciales));
    const nombre = crearNodo('div');
    nombre.append(crearNodo('strong', '', cliente.nombre));
    nombre.append(crearNodo('small', '', cliente.tipo === 'empresa' ? 'Empresa / institución' : 'Persona natural'));
    identidad.append(nombre);
    agregarCelda(fila, identidad);
    agregarCelda(fila, cliente.documento);
    agregarCelda(fila, cliente.telefono);
    agregarCelda(fila, cliente.ciudad);
    const estado = crearNodo('span', `status ${cliente.activo ? '' : 'off'}`, cliente.activo ? 'Activo' : 'Inactivo');
    agregarCelda(fila, estado);
    const acciones = crearNodo('div', 'row-actions');
    acciones.append(
      botonAccion('Ver', '', () => verCliente(cliente.id)),
      botonAccion('Editar', '', () => editarCliente(cliente.id)),
      botonAccion('Eliminar', 'danger', () => eliminarCliente(cliente.id, cliente.nombre))
    );
    agregarCelda(fila, acciones);
    tabla.append(fila);
  }
  $('estado-vacio').hidden = clientes.length > 0;
}

async function cargarClientes() {
  const solicitud = ++solicitudActual;
  const buscar = $('buscar').value.trim();
  const estado = $('filtro-estado').value;
  try {
    const consulta = new URLSearchParams({ buscar, estado, pagina: String(pagina) });
    const respuesta = await api(`/api/clientes?${consulta}`);
    if (solicitud !== solicitudActual) return;
    paginas = Math.max(1, Math.ceil(respuesta.total / respuesta.limite));
    if (pagina > paginas) { pagina = paginas; return cargarClientes(); }
    dibujarTabla(respuesta.registros);
    $('coincidencias').textContent = respuesta.total.toLocaleString('es-CO');
    $('rango-resultados').textContent = respuesta.total === 0 ? 'Sin registros' :
      `Mostrando ${(pagina - 1) * respuesta.limite + 1}–${Math.min(pagina * respuesta.limite, respuesta.total)} de ${respuesta.total}`;
    $('pagina-actual').textContent = `${pagina} / ${paginas}`;
    $('pagina-anterior').disabled = pagina <= 1;
    $('pagina-siguiente').disabled = pagina >= paginas;
  } catch (error) {
    if (solicitud === solicitudActual) notificar(error.message, true);
  }
}

async function cargarResumen() {
  try {
    const resumen = await api('/api/clientes/resumen');
    $('total-clientes').textContent = resumen.total.toLocaleString('es-CO');
    $('activos-clientes').textContent = resumen.activos.toLocaleString('es-CO');
    $('inactivos-clientes').textContent = resumen.inactivos.toLocaleString('es-CO');
  } catch (error) { notificar(error.message, true); }
}

async function refrescar() { await Promise.all([cargarClientes(), cargarResumen()]); }

function abrirFormulario(cliente = null) {
  formulario.reset();
  $('errores-formulario').hidden = true;
  $('cliente-id').value = cliente?.id ?? '';
  $('titulo-formulario').textContent = cliente ? 'Editar cliente' : 'Nuevo cliente';
  $('guardar-cliente').textContent = cliente ? 'Guardar cambios' : 'Guardar cliente';
  $('campo-activo').disabled = !cliente;
  if (cliente) {
    for (const clave of ['tipo', 'nombre', 'documento', 'telefono', 'correo', 'direccion', 'ciudad', 'observaciones']) {
      formulario.elements.namedItem(clave).value = cliente[clave] ?? '';
    }
    $('campo-activo').value = cliente.activo ? '1' : '0';
  }
  dialogCliente.showModal();
}

async function editarCliente(id) {
  try { abrirFormulario(await api(`/api/clientes/${id}`)); }
  catch (error) { notificar(error.message, true); }
}

async function verCliente(id) {
  try {
    clienteEnDetalle = await api(`/api/clientes/${id}`);
    $('equipos-del-cliente').href = '/equipos.html?cliente_id=' + clienteEnDetalle.id;
    const contenedor = $('detalle-cliente');
    contenedor.replaceChildren();
    const campos = [
      ['Nombre / Razón social', clienteEnDetalle.nombre, true],
      ['Tipo de cliente', clienteEnDetalle.tipo === 'empresa' ? 'Empresa / institución' : 'Persona natural'],
      ['Estado', clienteEnDetalle.activo ? 'Activo' : 'Inactivo'],
      ['Documento / NIT', clienteEnDetalle.documento],
      ['Teléfono', clienteEnDetalle.telefono],
      ['Correo electrónico', clienteEnDetalle.correo],
      ['Dirección', clienteEnDetalle.direccion],
      ['Ciudad', clienteEnDetalle.ciudad],
      ['Fecha de registro', new Date(clienteEnDetalle.creado_en).toLocaleDateString('es-CO')],
      ['Observaciones', clienteEnDetalle.observaciones || 'Sin observaciones', true]
    ];
    for (const [etiqueta, valor, ancho] of campos) {
      const item = crearNodo('div', ancho ? 'wide' : '');
      item.append(crearNodo('dt', '', etiqueta), crearNodo('dd', '', valor || '—'));
      contenedor.append(item);
    }
    dialogDetalle.showModal();
  } catch (error) { notificar(error.message, true); }
}

async function eliminarCliente(id, nombre) {
  if (!confirm(`¿Deseas eliminar a "${nombre}"?\n\nSi ya tiene equipos u otros registros relacionados, se desactivará para conservar su historial.`)) return;
  try {
    const resultado = await api(`/api/clientes/${id}`, { method: 'DELETE' });
    notificar(resultado.resultado === 'desactivado'
      ? 'El cliente se desactivó. Se conservaron sus registros relacionados.'
      : 'Cliente eliminado correctamente.');
    await refrescar();
  } catch (error) { notificar(error.message, true); }
}

formulario.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('cliente-id').value;
  const datos = Object.fromEntries(new FormData(formulario).entries());
  delete datos.id;
  if (id) datos.activo = datos.activo === '1';
  const boton = $('guardar-cliente');
  boton.disabled = true;
  $('errores-formulario').hidden = true;
  try {
    await api(id ? `/api/clientes/${id}` : '/api/clientes', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(datos)
    });
    dialogCliente.close();
    pagina = 1;
    notificar(id ? 'Cliente actualizado correctamente.' : 'Cliente registrado correctamente.');
    await refrescar();
  } catch (error) {
    $('errores-formulario').textContent = error.message;
    $('errores-formulario').hidden = false;
  } finally { boton.disabled = false; }
});

$('nuevo-cliente').addEventListener('click', () => abrirFormulario());
$('cerrar-formulario').addEventListener('click', () => dialogCliente.close());
$('cancelar-formulario').addEventListener('click', () => dialogCliente.close());
$('cerrar-detalle').addEventListener('click', () => dialogDetalle.close());
$('cerrar-detalle-pie').addEventListener('click', () => dialogDetalle.close());
$('editar-desde-detalle').addEventListener('click', () => {
  const cliente = clienteEnDetalle;
  dialogDetalle.close();
  abrirFormulario(cliente);
});
$('buscar').addEventListener('input', () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => { pagina = 1; cargarClientes(); }, 250);
});
$('filtro-estado').addEventListener('change', () => { pagina = 1; cargarClientes(); });
$('pagina-anterior').addEventListener('click', () => { if (pagina > 1) { pagina--; cargarClientes(); } });
$('pagina-siguiente').addEventListener('click', () => { if (pagina < paginas) { pagina++; cargarClientes(); } });

refrescar();
