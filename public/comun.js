const $ = (id) => document.getElementById(id);
let temporizadorMensaje;

async function api(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      ...opciones,
      headers: { ...(opciones.body ? { 'Content-Type': 'application/json' } : {}), ...opciones.headers }
    });
  } catch {
    throw new Error('No se puede conectar con el servidor local.');
  }
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const campos = cuerpo.detalles ? '\n' + Object.entries(cuerpo.detalles).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
    throw new Error((cuerpo.error || 'Ocurrió un error inesperado.') + campos);
  }
  return cuerpo;
}

function notificar(texto, error = false) {
  clearTimeout(temporizadorMensaje);
  const elemento = $('mensaje');
  elemento.textContent = texto;
  elemento.classList.toggle('error', error);
  elemento.hidden = false;
  temporizadorMensaje = setTimeout(() => { elemento.hidden = true; }, 4800);
}

function crearNodo(etiqueta, clase, valor) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (valor !== undefined && valor !== null) nodo.textContent = String(valor);
  return nodo;
}

function agregarCelda(fila, contenido) {
  const celda = document.createElement('td');
  if (contenido instanceof Node) celda.append(contenido);
  else celda.textContent = contenido || '—';
  fila.append(celda);
  return celda;
}

function botonAccion(etiqueta, clase, accion) {
  const b = crearNodo('button', `row-button ${clase || ''}`, etiqueta);
  b.type = 'button';
  b.addEventListener('click', accion);
  return b;
}
