const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  telefono: String,
  dni: { type: String, unique: true, sparse: true },
  cargo: { type: String, required: true, enum: ['Administrador', 'Gerente', 'Cajero', 'Almacén'] },
  usuario: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  databaseName: { type: String, unique: true, required: true },
  fechaRegistro: { type: Date, default: Date.now },
  sucursal: { type: String, default: 'Principal' },
  estado: { type: String, default: 'activo', enum: ['activo', 'inactivo', 'suspendido'] },
  banco: String,
  tipoCuenta: { type: String, enum: ['Ahorros', 'Corriente', 'Sueldo'] },
  numeroCuenta: String,
  cci: String,
  titularCuenta: String,
  monedaCuenta: { type: String, default: 'PEN' }
});