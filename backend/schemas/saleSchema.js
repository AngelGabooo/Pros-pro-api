const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true },
  usuarioId: { type: mongoose.Schema.Types.ObjectId, required: true },
  usuarioNombre: { type: String, required: true },
  cliente: String,
  clienteTelefono: String,
  clienteEmail: String,
  items: [{
    productoId: { type: mongoose.Schema.Types.ObjectId },
    nombre: String,
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 }
  }],
  subtotal: { type: Number, required: true, min: 0 },
  descuento: { type: Number, default: 0, min: 0 },
  impuestos: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  metodoPago: {
    type: String,
    enum: ['efectivo', 'tarjeta', 'transferencia', 'mixto', 'yape', 'plin'],
    required: true
  },
  estado: {
    type: String,
    enum: ['pendiente', 'completada', 'cancelada', 'reembolsada'],
    default: 'completada'
  },
  fechaVenta: { type: Date, default: Date.now },
  sucursal: { type: String, default: 'Principal' },
  notas: String,
  cambio: { type: Number, default: 0 },
  referenciaPago: String
});