export class ErrorAplicacion extends Error {
  constructor(estado, mensaje, detalles = undefined) {
    super(mensaje);
    this.estado = estado;
    this.detalles = detalles;
  }
}

const texto = (valor) => typeof valor === 'string' ? valor.trim() : '';
const campo = (valor, minimo, maximo, obligatorio, errores, nombre) => {
  const v = texto(valor);
  if (obligatorio && v.length < minimo) errores[nombre] = `Debe tener al menos ${minimo} caracteres.`;
  else if (v.length > maximo) errores[nombre] = `Máximo ${maximo} caracteres.`;
  return v;
};

export function validarCliente(entrada, { creando = false } = {}) {
  if (!entrada || Array.isArray(entrada) || typeof entrada !== 'object') {
    throw new ErrorAplicacion(422, 'Debes enviar un objeto JSON válido.');
  }
  const errores = {};
  const tipo = texto(entrada.tipo).toLowerCase();
  if (!['persona', 'empresa'].includes(tipo)) errores.tipo = 'Selecciona persona o empresa.';
  const nombre = campo(entrada.nombre, 2, 150, true, errores, 'nombre');
  const documento = campo(entrada.documento, 0, 40, false, errores, 'documento') || null;
  const telefono = campo(entrada.telefono, 7, 30, true, errores, 'telefono');
  const correo = campo(entrada.correo, 0, 150, false, errores, 'correo') || null;
  const direccion = campo(entrada.direccion, 4, 250, true, errores, 'direccion');
  const ciudad = campo(entrada.ciudad, 2, 100, true, errores, 'ciudad');
  const observaciones = campo(entrada.observaciones, 0, 1000, false, errores, 'observaciones');
  if (telefono && !/^[0-9+().\-\s]{7,30}$/.test(telefono)) {
    errores.telefono = 'Utiliza números, espacios o caracteres telefónicos válidos.';
  }
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    errores.correo = 'Correo electrónico inválido.';
  }
  let activo = 1;
  if (!creando) {
    if (entrada.activo === true || entrada.activo === 1) activo = 1;
    else if (entrada.activo === false || entrada.activo === 0) activo = 0;
    else errores.activo = 'El estado debe ser verdadero o falso.';
  }
  if (Object.keys(errores).length) {
    throw new ErrorAplicacion(422, 'Revisa los campos del formulario.', errores);
  }
  return { tipo, nombre, documento, telefono, correo, direccion, ciudad, observaciones, activo };
}

function idValido(valor) {
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n <= 0 || String(n) !== String(valor)) {
    throw new ErrorAplicacion(400, 'Identificador de cliente inválido.');
  }
  return n;
}

export function crearClienteServicio(repositorio) {
  const existente = (id) => {
    const cliente = repositorio.obtener(idValido(id));
    if (!cliente) throw new ErrorAplicacion(404, 'Cliente no encontrado.');
    return cliente;
  };
  const verificarDocumento = (documento, id = 0) => {
    if (repositorio.documentoEnUso(documento, id)) {
      throw new ErrorAplicacion(409, 'Ya existe un cliente con ese documento o NIT.', { documento: 'Documento ya registrado.' });
    }
  };
  return {
    obtener: existente,
    resumen: () => repositorio.resumen(),
    listar(query = {}) {
      const buscar = texto(query.buscar);
      if (buscar.length > 100) throw new ErrorAplicacion(400, 'La búsqueda es demasiado larga.');
      const estado = query.estado ?? 'todos';
      if (!['todos', 'activos', 'inactivos'].includes(estado)) {
        throw new ErrorAplicacion(400, 'Filtro de estado inválido.');
      }
      const pagina = query.pagina === undefined ? 1 : Number(query.pagina);
      if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 1000000) {
        throw new ErrorAplicacion(400, 'Página inválida.');
      }
      return repositorio.listar({ buscar, estado, pagina, limite: 20 });
    },
    crear(entrada) {
      const datos = validarCliente(entrada, { creando: true });
      verificarDocumento(datos.documento);
      return repositorio.crear(datos);
    },
    actualizar(idOriginal, entrada) {
      const cliente = existente(idOriginal);
      const datos = validarCliente(entrada);
      verificarDocumento(datos.documento, cliente.id);
      return repositorio.actualizar(cliente.id, datos);
    },
    eliminar(idOriginal) {
      const cliente = existente(idOriginal);
      if (repositorio.dependencias(cliente.id) > 0) {
        const desactivado = repositorio.desactivar(cliente.id);
        return { resultado: 'desactivado', cliente: desactivado };
      }
      repositorio.eliminar(cliente.id);
      return { resultado: 'eliminado', clienteId: cliente.id };
    }
  };
}
