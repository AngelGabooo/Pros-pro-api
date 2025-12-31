const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: String,
  tipoDocumento: { type: String, enum: ['DNI', 'RUC', 'CE', 'Pasaporte'] },
  numeroDocumento: { type: String, unique: true, sparse: true },
  telefono: String,
  email: { type: String, unique: true, sparse: true },
  direccion: String,
  fechaRegistro: { type: Date, default: Date.now },
  comprasTotales: { type: Number, default: 0 },
  montoTotalCompras: { type: Number, default: 0 },
  ultimaCompra: Date,
  tipoCliente: { type: String, default: 'ocasional', enum: ['ocasional', 'frecuente', 'premium', 'corporativo'] },
  notas: String
});