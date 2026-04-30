const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: String,
  precio: { type: Number, required: true, min: 0 },
  costo: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  stockMinimo: { type: Number, default: 5 },
  categoria: { type: String, required: true },
  codigoBarra: { 
    type: String, 
    unique: true, 
    sparse: true,
    default: null
  },
  codigoInterno: { 
    type: String, 
    unique: true, 
    sparse: true
  },
  imagen: String,
  proveedor: String,
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now },
  estado: { type: String, default: 'activo', enum: ['activo', 'inactivo', 'agotado'] }
});