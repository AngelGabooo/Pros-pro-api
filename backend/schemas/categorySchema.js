const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  descripcion: String,
  icono: String,
  color: String,
  fechaCreacion: { type: Date, default: Date.now },
  estado: { type: String, default: 'activo', enum: ['activo', 'inactivo'] }
});