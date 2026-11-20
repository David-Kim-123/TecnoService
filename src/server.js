import { abrirBaseDatos } from './db/database.js';
import { crearApp } from './app.js';

const db = abrirBaseDatos();
const app = crearApp(db);
const puerto = Number(process.env.PORT || 3000);
// Sin autenticación, únicamente accesible desde la propia computadora.
const host = '127.0.0.1';
const servidor = app.listen(puerto, host, () => {
  console.log(`TecnoService disponible en http://${host}:${puerto}`);
});
function cerrar() {
  servidor.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
