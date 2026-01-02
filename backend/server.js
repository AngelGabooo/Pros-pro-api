// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
// ==================== CONEXIÓN PRINCIPAL (usuarios) ====================
let mainConnection;
try {
  mainConnection = mongoose.createConnection(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  mainConnection.on('connected', () => {
    console.log('✅ Conectado a la base principal de usuarios');
  });
  mainConnection.on('error', (err) => {
    console.error('❌ Error en base principal:', err);
  });
} catch (error) {
  console.error('No se pudo conectar a MongoDB Atlas:', error);
  process.exit(1);
}
// ==================== MODELO DE USUARIO (CON CAMPOS DE TIENDA) ====================
const userSchema = new mongoose.Schema({
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
  monedaCuenta: { type: String, default: 'PEN' },
  // === AÑADIDOS CAMPOS DE TIENDA ===
  tiendaNombre: { type: String, default: 'Mi Tienda' },
  tiendaDireccion: String,
  tiendaTelefono: String,
  tiendaRFC: String,
  tiendaMensajeTicket: { type: String, default: '¡Gracias por su compra! Vuelva pronto :)' }
});
const User = mainConnection.model('User', userSchema);
// Cache de conexiones por tienda
global.userConnections = {};
// ==================== OBTENER MODELOS DE LA TIENDA DEL USUARIO ====================
const getUserModels = async (databaseName) => {
  console.log(`🔍 Buscando modelos para tienda: ${databaseName}`);
  if (!databaseName) {
    throw new Error('Nombre de base de datos no proporcionado');
  }
  if (global.userConnections[databaseName]) {
    console.log(`🔄 Usando conexión en cache para: ${databaseName}`);
    return global.userConnections[databaseName];
  }
  console.log(`🚀 Creando nueva conexión para: ${databaseName}`);
  const dbURI = process.env.MONGODB_URI.replace(/(mongodb\+srv:\/\/[^/]+\/)[^?]*/, `$1${databaseName}`);
 
  try {
    const connection = mongoose.createConnection(dbURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await new Promise((resolve, reject) => {
      connection.once('open', resolve);
      connection.on('error', reject);
      setTimeout(() => reject(new Error(`Timeout al conectar a ${databaseName}`)), 10000);
    });
    console.log(`✅ Conectado exitosamente a la tienda: ${databaseName}`);
    // Definir esquemas
    const productSchema = new mongoose.Schema({
      nombre: { type: String, required: true },
      descripcion: String,
      precio: { type: Number, required: true, min: 0 },
      costo: { type: Number, required: true, min: 0 },
      stock: { type: Number, required: true, min: 0, default: 0 },
      stockMinimo: { type: Number, default: 5 },
      categoria: { type: String, required: true },
      codigoBarra: { type: String, unique: true, sparse: true },
      codigoInterno: { type: String, unique: true, sparse: true },
      imagen: String,
      proveedor: String,
      fechaCreacion: { type: Date, default: Date.now },
      fechaActualizacion: { type: Date, default: Date.now },
      estado: { type: String, default: 'activo', enum: ['activo', 'inactivo', 'agotado'] }
    });
    productSchema.index({ nombre: 'text', descripcion: 'text' });
    productSchema.index({ codigoInterno: 1 });
    productSchema.index({ codigoBarra: 1 });
    productSchema.index({ categoria: 1 });
    const saleSchema = new mongoose.Schema({
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
    const clientSchema = new mongoose.Schema({
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
    const categorySchema = new mongoose.Schema({
      nombre: { type: String, required: true, unique: true },
      descripcion: String,
      icono: String,
      color: String,
      fechaCreacion: { type: Date, default: Date.now },
      estado: { type: String, default: 'activo', enum: ['activo', 'inactivo'] }
    });
    // Crear modelos
    const models = {
      connection,
      Product: connection.model('Product', productSchema),
      Sale: connection.model('Sale', saleSchema),
      Client: connection.model('Client', clientSchema),
      Category: connection.model('Category', categorySchema)
    };
    global.userConnections[databaseName] = models;
    console.log(`💾 Modelos guardados en cache para: ${databaseName}`);
    return models;
  } catch (error) {
    console.error(`❌ Error fatal al crear modelos para ${databaseName}:`, error);
    throw error;
  }
};
// ==================== REGISTRO ====================
app.post('/api/register', async (req, res) => {
  try {
    const { nombre, apellido, email = '', telefono = '', cargo, usuario, password } = req.body;
    // LOG 1: Mostrar datos recibidos
    console.log('📥 Datos recibidos en registro:', { nombre, apellido, email, telefono, cargo, usuario });
    if (!nombre || !apellido || !cargo || !usuario || !password) {
      console.log('❌ Faltan campos obligatorios');
      return res.status(400).json({
        success: false,
        error: 'Faltan campos obligatorios: nombre, apellido, cargo, usuario y password'
      });
    }
    // Verificar si usuario o email ya existen
    console.log(`🔍 Verificando si ya existe usuario "${usuario}" o email "${email || 'no-email'}"`);
    const exists = await User.findOne({
      $or: [{ usuario }, { email: email || 'no-email' }]
    }).catch(err => {
      console.error('❌ Error buscando usuario existente:', err);
      return null;
    });
    if (exists) {
      console.log('⚠️ Usuario o email ya existe:', exists.usuario || exists.email);
      return res.status(400).json({
        success: false,
        error: 'Usuario o email ya existe'
      });
    }
    // Crear hash de password
    console.log('🔑 Generando hash de contraseña...');
    const hashedPassword = await bcrypt.hash(password, 12);
    // Crear nombre de base de datos único
    const databaseName = `tienda_${usuario.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}`;
    console.log(`📦 Nombre de tienda generado: ${databaseName}`);
    // Crear usuario
    const newUser = new User({
      nombre,
      apellido,
      email: email || `usuario_${Date.now()}@tienda.com`,
      telefono,
      cargo,
      usuario,
      password: hashedPassword,
      databaseName
    });
    // LOG CLAVE: Antes y después del save()
    console.log('💾 Intentando guardar usuario en la base principal...');
    try {
      await newUser.save();
      console.log(`✅ Usuario guardado exitosamente en base principal: ${usuario} (ID: ${newUser._id})`);
    } catch (saveError) {
      console.error('❌ ERROR CRÍTICO al guardar usuario en base principal:', saveError);
      return res.status(500).json({
        success: false,
        error: 'No se pudo crear el usuario. Problema de conexión o permisos en la base de datos.',
        details: process.env.NODE_ENV === 'development' ? saveError.message : undefined
      });
    }
    // === CREAR LA BASE DE DATOS FÍSICAMENTE ===
    const dbURI = process.env.MONGODB_URI.replace(/(mongodb\+srv:\/\/[^/]+\/)[^?]*/, `$1${databaseName}`);
    console.log(`🚀 Intentando conectar a nueva base de datos: ${dbURI}`);
    try {
      const tempConn = mongoose.createConnection(dbURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout al conectar a la nueva base de datos (10s)'));
        }, 10000);
        tempConn.once('open', async () => {
          clearTimeout(timeout);
          console.log(`✅ Conexión exitosa a la nueva base: ${databaseName}`);
          try {
            // Crear categoría General
            const Category = tempConn.model('Category', new mongoose.Schema({
              nombre: { type: String, required: true, unique: true },
              descripcion: String,
              icono: String,
              color: String,
              fechaCreacion: { type: Date, default: Date.now },
              estado: { type: String, default: 'activo', enum: ['activo', 'inactivo'] }
            }));
            const categoriaExiste = await Category.findOne({ nombre: 'General' });
            if (!categoriaExiste) {
              await Category.create({
                nombre: 'General',
                descripcion: 'Categoría por defecto',
                estado: 'activo'
              });
              console.log('✅ Categoría "General" creada');
            }
            // Registrar esquema de productos
           // Registrar esquema de productos
const productSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: String,
  precio: { type: Number, required: true, min: 0 },
  costo: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  stockMinimo: { type: Number, default: 5 },
  categoria: { type: String, required: true },
  codigoBarra: { type: String, unique: true, sparse: true },
  codigoInterno: { type: String, unique: true, sparse: true },
  imagen: String,
  proveedor: String,
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now },
  estado: { type: String, default: 'activo', enum: ['activo', 'inactivo', 'agotado'] }
});
// AÑADE LOS ÍNDICES AQUÍ TAMBIÉN:
productSchema.index({ nombre: 'text', descripcion: 'text' });
productSchema.index({ codigoInterno: 1 });
productSchema.index({ codigoBarra: 1 });
productSchema.index({ categoria: 1 });
productSchema.index({ estado: 1 });
tempConn.model('Product', productSchema);
console.log('✅ Esquema de productos registrado');
            // Documento de inicialización
            const Init = tempConn.model('Init', new mongoose.Schema({
              tienda: String,
              usuario: String,
              fechaCreacion: { type: Date, default: Date.now },
              version: { type: String, default: '1.0.0' }
            }));
            await Init.create({
              tienda: databaseName,
              usuario: usuario,
              fechaCreacion: new Date(),
              version: '1.0.0'
            });
            console.log(`✅ Tienda inicializada completamente: ${databaseName}`);
            tempConn.close();
            resolve();
          } catch (initError) {
            console.error('❌ Error inicializando colecciones:', initError);
            tempConn.close();
            reject(initError);
          }
        });
        tempConn.on('error', (err) => {
          clearTimeout(timeout);
          console.error('❌ Error de conexión a nueva base de datos:', err.message);
          reject(err);
        });
      });
      console.log(`🏪 ¡Tienda creada exitosamente para ${usuario}!`);
      res.status(201).json({
        success: true,
        message: '¡Cuenta y tienda creadas exitosamente!',
        user: {
          usuario: newUser.usuario,
          nombre: newUser.nombre,
          databaseName: newUser.databaseName
        }
      });
    } catch (dbError) {
      console.error('❌ Error grave al crear la base de datos de la tienda:', dbError.message || dbError);
      // Rollback: eliminar usuario creado
      await User.deleteOne({ _id: newUser._id }).catch(err => {
        console.error('❌ Error en rollback (eliminando usuario):', err);
      });
      res.status(500).json({
        success: false,
        error: 'Error al crear la tienda. Se revirtió la creación del usuario.'
      });
    }
  } catch (error) {
    console.error('❌ Error inesperado en registro:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// ==================== LOGIN (ACTUALIZADO CON DATOS DE TIENDA) ====================
// ==================== LOGIN CORREGIDO ====================
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`🔐 Intento de login para: ${username || 'undefined'}`);
    console.log('📥 Datos recibidos:', req.body);
    // Validación básica de entrada
    if (!username || !password) {
      console.log('❌ Faltan credenciales en la solicitud');
      return res.status(400).json({
        success: false,
        error: 'Usuario y contraseña son requeridos'
      });
    }
    // BUSQUEDA MÁS DETALLADA
    console.log(`🔍 Buscando usuario con: ${username}`);
   
    // Buscar de todas las formas posibles
    const user = await User.findOne({
      $or: [
        { usuario: username.trim() },
        { email: username.trim() },
        { nombre: username.trim() }
      ]
    });
    if (!user) {
      console.log(`❌ Usuario NO encontrado: ${username}`);
      console.log('🔍 Buscando todos los usuarios en la base de datos...');
     
      // Listar todos los usuarios para debug
      const allUsers = await User.find({}).select('usuario email nombre');
      console.log('📋 Todos los usuarios registrados:', allUsers);
     
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas - Usuario no encontrado'
      });
    }
    console.log(`✅ Usuario encontrado: ${user.usuario} (Email: ${user.email})`);
    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log(`❌ Contraseña incorrecta para: ${user.usuario}`);
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas'
      });
    }
    // Verificar estado del usuario
    if (user.estado !== 'activo') {
      console.log(`🚫 Usuario inactivo/suspendido: ${user.usuario} (${user.estado})`);
      return res.status(403).json({
        success: false,
        error: 'Usuario inactivo o suspendido'
      });
    }
    // Verificar que tenga databaseName
    if (!user.databaseName) {
      console.log(`⚠️ Usuario sin databaseName: ${user.usuario}`);
      return res.status(500).json({
        success: false,
        error: 'Error en la configuración de la cuenta'
      });
    }
    // Generar token JWT
    const token = jwt.sign(
      {
        userId: user._id,
        usuario: user.usuario,
        databaseName: user.databaseName
      },
      process.env.JWT_SECRET || 'fallback_secret_key_for_development',
      { expiresIn: '24h' }
    );
    console.log(`✅ Login exitoso: ${user.usuario} (Tienda: ${user.databaseName})`);
    // Respuesta exitosa con datos del usuario
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        apellido: user.apellido,
        usuario: user.usuario,
        cargo: user.cargo,
        email: user.email || '',
        telefono: user.telefono || '',
        databaseName: user.databaseName,
        sucursal: user.sucursal || 'Principal',
        // Datos bancarios
        banco: user.banco || '',
        tipoCuenta: user.tipoCuenta || '',
        numeroCuenta: user.numeroCuenta || '',
        cci: user.cci || '',
        titularCuenta: user.titularCuenta || '',
        monedaCuenta: user.monedaCuenta || 'PEN',
        // Datos de la tienda
        tiendaNombre: user.tiendaNombre || 'Mi Tienda',
        tiendaDireccion: user.tiendaDireccion || '',
        tiendaTelefono: user.tiendaTelefono || '',
        tiendaRFC: user.tiendaRFC || '',
        tiendaMensajeTicket: user.tiendaMensajeTicket || '¡Gracias por su compra! Vuelva pronto :)'
      }
    });
  } catch (error) {
    console.error('❌ Error inesperado en login:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});
// ==================== RUTA TEMPORAL PARA DEPURACIÓN ====================
app.get('/api/debug/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({
      success: true,
      total: users.length,
      users
    });
  } catch (error) {
    console.error('❌ Error obteniendo usuarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno'
    });
  }
});
app.post('/api/debug/create-user', async (req, res) => {
  try {
    const { usuario, password, nombre = 'Test', apellido = 'User', cargo = 'Administrador' } = req.body;
   
    if (!usuario || !password) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y contraseña requeridos'
      });
    }
   
    const hashedPassword = await bcrypt.hash(password, 12);
    const databaseName = `tienda_${usuario.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}`;
   
    const newUser = new User({
      nombre,
      apellido,
      email: `${usuario}@test.com`,
      cargo,
      usuario,
      password: hashedPassword,
      databaseName,
      tiendaNombre: 'Tienda de Prueba'
    });
   
    await newUser.save();
   
    // Crear la base de datos
    const dbURI = process.env.MONGODB_URI.replace(/(mongodb\+srv:\/\/[^/]+\/)[^?]*/, `$1${databaseName}`);
    const tempConn = mongoose.createConnection(dbURI);
   
    await new Promise((resolve) => {
      tempConn.once('open', () => {
        console.log(`✅ Base de datos creada: ${databaseName}`);
        tempConn.close();
        resolve();
      });
    });
   
    res.json({
      success: true,
      message: 'Usuario creado para pruebas',
      user: {
        usuario: newUser.usuario,
        password: password, // Solo para pruebas
        databaseName: newUser.databaseName
      }
    });
   
  } catch (error) {
    console.error('❌ Error creando usuario de prueba:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno'
    });
  }
});
// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const authenticateAndLoadModels = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autorización requerido'
      });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }
    console.log(`🔐 Verificando token...`);
    // Verificar token JWT
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback_secret_key_for_development'
    );
    // Buscar usuario en la base de datos principal
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    // Verificar estado del usuario
    if (user.estado !== 'activo') {
      return res.status(403).json({
        success: false,
        error: 'Usuario inactivo o suspendido'
      });
    }
    console.log(`👤 Usuario autenticado: ${user.usuario} (${user.databaseName})`);
    // Obtener modelos de la tienda del usuario
    try {
      req.models = await getUserModels(user.databaseName);
      req.user = {
        id: user._id,
        usuario: user.usuario,
        nombre: user.nombre,
        databaseName: user.databaseName
      };
      console.log(`✅ Middleware completado para tienda: ${user.databaseName}`);
      next();
    } catch (dbError) {
      console.error(`❌ Error al conectar a la tienda ${user.databaseName}:`, dbError);
      return res.status(500).json({
        success: false,
        error: 'Error al conectar a la tienda del usuario'
      });
    }
  } catch (error) {
    console.error('❌ Error de autenticación:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token inválido'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expirado'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Error de autenticación'
    });
  }
};
// ==================== OBTENER PERFIL (NUEVA RUTA) ====================
app.get('/api/profile', authenticateAndLoadModels, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
 
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    const userResponse = {
      id: user._id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      telefono: user.telefono,
      cargo: user.cargo,
      sucursal: user.sucursal,
      usuario: user.usuario,
      databaseName: user.databaseName,
      fechaRegistro: user.fechaRegistro,
      estado: user.estado,
      banco: user.banco || '',
      tipoCuenta: user.tipoCuenta || '',
      numeroCuenta: user.numeroCuenta || '',
      cci: user.cci || '',
      titularCuenta: user.titularCuenta || '',
      monedaCuenta: user.monedaCuenta || 'PEN',
      tiendaNombre: user.tiendaNombre || 'Mi Tienda',
      tiendaDireccion: user.tiendaDireccion || '',
      tiendaTelefono: user.tiendaTelefono || '',
      tiendaRFC: user.tiendaRFC || '',
      tiendaMensajeTicket: user.tiendaMensajeTicket || '¡Gracias por su compra! Vuelva pronto :)'
    };
    res.json({
      success: true,
      user: userResponse
    });
  } catch (error) {
    console.error('❌ Error obteniendo perfil:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener el perfil'
    });
  }
});
// ==================== ACTUALIZAR PERFIL DE USUARIO (CORREGIDO) ====================
app.put('/api/profile/update', authenticateAndLoadModels, async (req, res) => {
  try {
    const userId = req.user.id; // Viene del token JWT verificado
    const updates = req.body;
    console.log(`✏️ Actualizando perfil del usuario: ${req.user.usuario} (${userId})`);
    console.log('📥 Datos recibidos para actualizar:', updates);
    // Campos permitidos para actualizar (INCLUYENDO DATOS DE TIENDA)
    const camposPermitidos = [
      'nombre',
      'apellido',
      'email',
      'telefono',
      'cargo',
      'sucursal',
      'banco',
      'tipoCuenta',
      'numeroCuenta',
      'cci',
      'titularCuenta',
      'monedaCuenta',
      // === AÑADE ESTOS CAMPOS DE TIENDA ===
      'tiendaNombre',
      'tiendaDireccion',
      'tiendaTelefono',
      'tiendaRFC',
      'tiendaMensajeTicket'
    ];
    // Filtrar solo los campos permitidos
    const datosActualizados = {};
    camposPermitidos.forEach(campo => {
      if (updates[campo] !== undefined) {
        datosActualizados[campo] = updates[campo];
      }
    });
    if (Object.keys(datosActualizados).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se enviaron datos válidos para actualizar'
      });
    }
    // Validar campos requeridos
    if (datosActualizados.nombre && !datosActualizados.nombre.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El nombre es obligatorio'
      });
    }
    if (datosActualizados.apellido && !datosActualizados.apellido.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El apellido es obligatorio'
      });
    }
    if (datosActualizados.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(datosActualizados.email)) {
        return res.status(400).json({
          success: false,
          error: 'El email no es válido'
        });
      }
    }
    // Actualizar en la base principal de usuarios
    const usuarioActualizado = await User.findByIdAndUpdate(
      userId,
      { $set: datosActualizados },
      {
        new: true,
        runValidators: true,
        select: '-password' // No devolver la contraseña
      }
    );
    if (!usuarioActualizado) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    console.log(`✅ Perfil actualizado exitosamente: ${usuarioActualizado.usuario}`);
    // Preparar respuesta con TODOS los datos actualizados
    const userResponse = {
      id: usuarioActualizado._id,
      nombre: usuarioActualizado.nombre,
      apellido: usuarioActualizado.apellido,
      email: usuarioActualizado.email,
      telefono: usuarioActualizado.telefono,
      cargo: usuarioActualizado.cargo,
      sucursal: usuarioActualizado.sucursal,
      usuario: usuarioActualizado.usuario,
      databaseName: usuarioActualizado.databaseName,
      fechaRegistro: usuarioActualizado.fechaRegistro,
      estado: usuarioActualizado.estado,
      // Datos bancarios
      banco: usuarioActualizado.banco || '',
      tipoCuenta: usuarioActualizado.tipoCuenta || '',
      numeroCuenta: usuarioActualizado.numeroCuenta || '',
      cci: usuarioActualizado.cci || '',
      titularCuenta: usuarioActualizado.titularCuenta || '',
      monedaCuenta: usuarioActualizado.monedaCuenta || 'PEN',
      // Datos de tienda
      tiendaNombre: usuarioActualizado.tiendaNombre || 'Mi Tienda',
      tiendaDireccion: usuarioActualizado.tiendaDireccion || '',
      tiendaTelefono: usuarioActualizado.tiendaTelefono || '',
      tiendaRFC: usuarioActualizado.tiendaRFC || '',
      tiendaMensajeTicket: usuarioActualizado.tiendaMensajeTicket || '¡Gracias por su compra! Vuelva pronto :)'
    };
    res.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      user: userResponse
    });
  } catch (error) {
    console.error('❌ Error actualizando perfil:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'El email o teléfono ya está en uso por otro usuario'
      });
    }
    if (error.name === 'ValidationError') {
      const errores = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos',
        details: errores
      });
    }
    res.status(500).json({
      success: false,
      error: 'Error interno al actualizar el perfil',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// ==================== RUTAS PROTEGIDAS - PRODUCTOS ====================
app.get('/api/products', authenticateAndLoadModels, async (req, res) => {
  try {
    const { search, categoria } = req.query;
    console.log(`📦 Obteniendo productos para tienda: ${req.user.databaseName}`);
    console.log(`🔍 Filtros: search=${search}, categoria=${categoria}`);
    // Construir query base
    let query = {};
    if (search && search.trim() !== '') {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { descripcion: { $regex: search, $options: 'i' } },
        { codigoBarra: { $regex: search, $options: 'i' } },
        { codigoInterno: { $regex: search, $options: 'i' } }
      ];
    }
    if (categoria && categoria !== 'todas' && categoria !== '') {
      query.categoria = categoria;
    }
    // CORRECCIÓN: Mostrar TODOS los productos activos e inactivos, pero excluir eliminados
    query.estado = { $ne: 'eliminado' }; // Solo excluir los marcados como eliminados
    console.log(`🔎 Query final:`, JSON.stringify(query, null, 2));
    const productos = await req.models.Product.find(query)
      .sort({ fechaCreacion: -1 })
      .limit(100);
    console.log(`✅ Productos encontrados: ${productos.length}`);
    res.json({
      success: true,
      productos,
      total: productos.length,
      tienda: req.user.databaseName,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error obteniendo productos:', error);
    res.status(500).json({
      success: false,
      error: 'Error cargando productos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
app.post('/api/products', authenticateAndLoadModels, async (req, res) => {
  try {
    console.log(`Creando producto en tienda: ${req.user.databaseName}`);
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
   
    const { nombre, precio, codigoInterno } = req.body;
   
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El nombre del producto es requerido'
      });
    }
   
    if (!precio || isNaN(precio) || precio < 0) {
      return res.status(400).json({
        success: false,
        error: 'El precio debe ser un número válido mayor o igual a 0'
      });
    }
   
    // CORRECCIÓN: Generar código interno automático si no se proporciona
    let codigoInternoFinal = codigoInterno && codigoInterno.trim() ? codigoInterno.trim() : '';
   
    if (!codigoInternoFinal) {
      // Generar código único basado en timestamp y random (muy improbable colisión)
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      codigoInternoFinal = `PROD${timestamp}${random}`;
      console.log(`Código interno generado automáticamente: ${codigoInternoFinal}`);
    }
   
    // CORRECCIÓN IMPORTANTE: Manejar código de barras vacío como undefined (no enviar campo)
    let codigoBarraFinal = undefined;
    if (req.body.codigoBarra && req.body.codigoBarra.trim() !== '') {
      codigoBarraFinal = req.body.codigoBarra.trim();
    }
   
    // Verificar si ya existe un producto con el mismo código interno
    const productoExistenteCodigo = await req.models.Product.findOne({
      codigoInterno: codigoInternoFinal
    });
   
    if (productoExistenteCodigo) {
      return res.status(409).json({
        success: false,
        error: 'Ya existe un producto con ese código interno',
        campo: 'codigoInterno',
        valor: codigoInternoFinal
      });
    }
   
    // Verificar si ya existe un producto con el mismo código de barras (solo si tiene valor)
    if (codigoBarraFinal !== undefined) {
      const productoExistenteBarcode = await req.models.Product.findOne({
        codigoBarra: codigoBarraFinal
      });
     
      if (productoExistenteBarcode) {
        return res.status(409).json({
          success: false,
          error: 'Ya existe un producto con ese código de barras',
          campo: 'codigoBarra',
          valor: codigoBarraFinal
        });
      }
    }
   
    // Construir datos del producto
    const productData = {
      nombre: nombre.trim(),
      precio: parseFloat(precio),
      codigoInterno: codigoInternoFinal,
      descripcion: req.body.descripcion || '',
      costo: req.body.costo ? parseFloat(req.body.costo) : 0,
      stock: req.body.stock ? parseInt(req.body.stock) : 0,
      stockMinimo: req.body.stockMinimo ? parseInt(req.body.stockMinimo) : 5,
      categoria: req.body.categoria || 'General',
      proveedor: req.body.proveedor || '',
      estado: 'activo',
      fechaCreacion: new Date(),
      fechaActualizacion: new Date()
    };
   
    // Solo agregar codigoBarra si tiene valor real
    if (codigoBarraFinal !== undefined) {
      productData.codigoBarra = codigoBarraFinal;
    }
   
    console.log('Datos del producto a guardar:', productData);
   
    // Intentar guardar
    try {
      const nuevoProducto = new req.models.Product(productData);
      const productoGuardado = await nuevoProducto.save();
     
      console.log(`Producto creado: ${productoGuardado._id}`);
     
      res.status(201).json({
        success: true,
        producto: productoGuardado,
        message: 'Producto creado exitosamente'
      });
    } catch (saveError) {
      // Manejar errores específicos de MongoDB (duplicados)
      if (saveError.code === 11000) {
        if (saveError.keyPattern.codigoInterno) {
          return res.status(409).json({
            success: false,
            error: 'Ya existe un producto con ese código interno',
            campo: 'codigoInterno'
          });
        } else if (saveError.keyPattern.codigoBarra) {
          return res.status(409).json({
            success: false,
            error: 'Ya existe un producto con ese código de barras',
            campo: 'codigoBarra'
          });
        }
      }
      throw saveError; // Otros errores pasan al catch general
    }
   
  } catch (error) {
    console.error('Error creando producto:', error);
   
    if (error.name === 'ValidationError') {
      const errores = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Error de validación',
        details: errores
      });
    }
   
    res.status(500).json({
      success: false,
      error: 'Error interno al crear producto',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
app.put('/api/products/:id', authenticateAndLoadModels, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`✏️ Editando producto ${id} en tienda: ${req.user.databaseName}`);
    const producto = await req.models.Product.findById(id);
    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }
    const camposPermitidos = [
      'nombre', 'descripcion', 'precio', 'costo', 'stock',
      'stockMinimo', 'categoria', 'codigoBarra', 'codigoInterno',
      'proveedor' // ← QUITAR 'estado' de aquí si no quieres que se cambie manualmente
    ];
    camposPermitidos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        producto[campo] = req.body[campo];
      }
    });
   
    // NO cambiar estado automáticamente basado en stock
    // El producto siempre se mantiene como 'activo'
   
    producto.fechaActualizacion = new Date();
    const productoActualizado = await producto.save();
    res.json({
      success: true,
      producto: productoActualizado,
      message: 'Producto actualizado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error actualizando producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error actualizando producto'
    });
  }
});
// Ruta para restaurar producto eliminado
app.put('/api/products/:id/restore', authenticateAndLoadModels, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`♻️ Restaurando producto ${id} en tienda: ${req.user.databaseName}`);
   
    const producto = await req.models.Product.findByIdAndUpdate(
      id,
      {
        estado: 'activo', // Cambiar de 'eliminado' a 'activo'
        fechaActualizacion: new Date()
      },
      { new: true }
    );
   
    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }
   
    res.json({
      success: true,
      message: 'Producto restaurado exitosamente',
      producto
    });
  } catch (error) {
    console.error('❌ Error restaurando producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error restaurando producto'
    });
  }
});
app.delete('/api/products/:id', authenticateAndLoadModels, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Eliminando producto ${id} de tienda: ${req.user.databaseName}`);
    const producto = await req.models.Product.findByIdAndUpdate(
      id,
      {
        estado: 'eliminado', // ← Cambiar a 'eliminado' en lugar de 'inactivo'
        fechaActualizacion: new Date()
      },
      { new: true }
    );
    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }
    res.json({
      success: true,
      message: 'Producto marcado como eliminado',
      producto
    });
  } catch (error) {
    console.error('❌ Error eliminando producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error eliminando producto'
    });
  }
});
app.put('/api/products/:id/stock', authenticateAndLoadModels, async (req, res) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;
    if (!stock || isNaN(stock) || stock < 0) {
      return res.status(400).json({
        success: false,
        error: 'Stock inválido. Debe ser un número mayor o igual a 0'
      });
    }
    const producto = await req.models.Product.findByIdAndUpdate(
      id,
      {
        stock: parseInt(stock),
        // CORRECCIÓN: SIEMPRE mantener como 'activo', no cambiar a 'agotado'
        estado: 'activo', // ← CAMBIA ESTA LÍNEA
        fechaActualizacion: new Date()
      },
      { new: true }
    );
    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }
    res.json({
      success: true,
      producto,
      message: 'Stock actualizado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error actualizando stock:', error);
    res.status(500).json({
      success: false,
      error: 'Error actualizando stock'
    });
  }
});
// ==================== RUTAS DE VENTAS ====================
// POST /api/sales - Crear una nueva venta
app.post('/api/sales', authenticateAndLoadModels, async (req, res) => {
  try {
    console.log(`💰 Creando venta en tienda: ${req.user.databaseName}`);
    console.log('📥 Datos recibidos:', JSON.stringify(req.body, null, 2));
    // Validar datos requeridos
    const { items, cliente, metodoPago, subtotal, total } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'La venta debe contener al menos un producto'
      });
    }
    if (!metodoPago) {
      return res.status(400).json({
        success: false,
        error: 'El método de pago es requerido'
      });
    }
    if (!subtotal || !total || subtotal < 0 || total < 0) {
      return res.status(400).json({
        success: false,
        error: 'Los montos de la venta son inválidos'
      });
    }
    // Generar código único para la venta
    const saleCode = `VTA-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    // Preparar datos de la venta
    const saleData = {
      codigo: saleCode,
      usuarioId: req.user.id,
      usuarioNombre: req.user.nombre || req.user.usuario,
      cliente: cliente || 'Cliente ocasional',
      clienteTelefono: req.body.clienteTelefono || '',
      clienteEmail: req.body.clienteEmail || '',
      items: items.map(item => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal
      })),
      subtotal: parseFloat(subtotal),
      descuento: req.body.descuento ? parseFloat(req.body.descuento) : 0,
      impuestos: req.body.impuestos ? parseFloat(req.body.impuestos) : 0,
      total: parseFloat(total),
      metodoPago: metodoPago,
      cambio: req.body.cambio ? parseFloat(req.body.cambio) : 0,
      referenciaPago: req.body.referenciaPago || null,
      sucursal: 'Principal',
      estado: 'completada',
      fechaVenta: new Date(),
      notas: req.body.notas || ''
    };
    console.log('💰 Datos de la venta a guardar:', saleData);
    // Crear venta
    const nuevaVenta = new req.models.Sale(saleData);
    const ventaGuardada = await nuevaVenta.save();
    console.log(`✅ Venta creada: ${ventaGuardada._id}`);
    // ACTUALIZAR STOCK DE LOS PRODUCTOS
    try {
      for (const item of items) {
        if (item.productoId) {
          // Buscar producto
          const producto = await req.models.Product.findById(item.productoId);
          if (producto) {
            // Calcular nuevo stock
            const nuevoStock = producto.stock - item.cantidad;
            // Actualizar producto
            await req.models.Product.findByIdAndUpdate(item.productoId, {
  stock: nuevoStock >= 0 ? nuevoStock : 0,
  // SOLO cambia estado a 'agotado' si realmente quieres esa funcionalidad
  // Para mantener siempre activo, elimina esta línea o déjala como 'activo'
  estado: 'activo', // ← SIEMPRE ACTIVO, incluso con stock 0
  fechaActualizacion: new Date()
});
            console.log(`📦 Stock actualizado: ${producto.nombre} - ${item.cantidad} unidades`);
          }
        }
      }
    } catch (stockError) {
      console.error('⚠️ Error actualizando stock (pero venta guardada):', stockError);
      // No lanzamos error para no revertir la venta
    }
    // Crear o actualizar cliente si hay información
    if (cliente && cliente !== 'Cliente ocasional') {
      try {
        const clienteExistente = await req.models.Client.findOne({
          $or: [
            { nombre: cliente },
            { email: req.body.clienteEmail || '' }
          ]
        });
        if (clienteExistente) {
          // Actualizar cliente existente
          await req.models.Client.findByIdAndUpdate(clienteExistente._id, {
            $inc: {
              comprasTotales: 1,
              montoTotalCompras: total
            },
            ultimaCompra: new Date()
          });
        } else {
          // Crear nuevo cliente
          const nuevoCliente = new req.models.Client({
            nombre: cliente,
            email: req.body.clienteEmail || '',
            telefono: req.body.clienteTelefono || '',
            fechaRegistro: new Date(),
            comprasTotales: 1,
            montoTotalCompras: total,
            ultimaCompra: new Date(),
            tipoCliente: 'ocasional'
          });
          await nuevoCliente.save();
        }
      } catch (clienteError) {
        console.error('⚠️ Error gestionando cliente:', clienteError);
        // No afecta la venta principal
      }
    }
    res.status(201).json({
      success: true,
      venta: ventaGuardada,
      message: 'Venta registrada exitosamente',
      code: saleCode
    });
  } catch (error) {
    console.error('❌ Error creando venta:', error);
    if (error.name === 'ValidationError') {
      const errores = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Error de validación',
        details: errores
      });
    }
    res.status(500).json({
      success: false,
      error: 'Error interno al registrar la venta',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// GET /api/sales - Obtener todas las ventas
app.get('/api/sales', authenticateAndLoadModels, async (req, res) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      metodoPago,
      estado,
      limit = 50,
      page = 1
    } = req.query;
    console.log(`📊 Obteniendo ventas para tienda: ${req.user.databaseName}`);
    // Construir query
    let query = {};
    // Filtrar por fecha
    if (fechaInicio || fechaFin) {
      query.fechaVenta = {};
      if (fechaInicio) query.fechaVenta.$gte = new Date(fechaInicio);
      if (fechaFin) query.fechaVenta.$lte = new Date(fechaFin);
    }
    if (metodoPago) query.metodoPago = metodoPago;
    if (estado) query.estado = estado;
    // Paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    // Obtener ventas
    const ventas = await req.models.Sale.find(query)
      .sort({ fechaVenta: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Usar lean() para mejor performance
    // Obtener total para paginación
    const totalVentas = await req.models.Sale.countDocuments(query);
    // Calcular estadísticas
    const totalMonto = await req.models.Sale.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    res.json({
      success: true,
      ventas,
      paginacion: {
        total: totalVentas,
        pagina: parseInt(page),
        limite: parseInt(limit),
        paginas: Math.ceil(totalVentas / parseInt(limit))
      },
      estadisticas: {
        totalVentas,
        totalMonto: totalMonto[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo ventas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener las ventas'
    });
  }
});
// GET /api/sales/:id - Obtener una venta específica
app.get('/api/sales/:id', authenticateAndLoadModels, async (req, res) => {
  try {
    const { id } = req.params;
    const venta = await req.models.Sale.findById(id).lean();
    if (!venta) {
      return res.status(404).json({
        success: false,
        error: 'Venta no encontrada'
      });
    }
    res.json({
      success: true,
      venta
    });
  } catch (error) {
    console.error('❌ Error obteniendo venta:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener la venta'
    });
  }
});
// GET /api/sales/today - Obtener ventas de hoy
app.get('/api/sales/today', authenticateAndLoadModels, async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const ventasHoy = await req.models.Sale.find({
      fechaVenta: {
        $gte: hoy,
        $lt: manana
      }
    }).sort({ fechaVenta: -1 });
    // Calcular total del día
    const totalHoy = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: hoy,
            $lt: manana
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          cantidad: { $sum: 1 }
        }
      }
    ]);
    // Calcular por método de pago
    const porMetodoPago = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: hoy,
            $lt: manana
          }
        }
      },
      {
        $group: {
          _id: "$metodoPago",
          total: { $sum: "$total" },
          cantidad: { $sum: 1 }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);
    res.json({
      success: true,
      ventas: ventasHoy,
      estadisticas: {
        totalHoy: totalHoy[0]?.total || 0,
        ventasHoy: totalHoy[0]?.cantidad || 0,
        porMetodoPago
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo ventas de hoy:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener las ventas del día'
    });
  }
});
// ==================== RUTAS DE REPORTES Y ESTADÍSTICAS ====================
// GET /api/sales/stats - Estadísticas generales
app.get('/api/sales/stats', authenticateAndLoadModels, async (req, res) => {
  try {
    // Estadísticas del día
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    // Estadísticas de la semana
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay()); // Domingo de esta semana
    inicioSemana.setHours(0, 0, 0, 0);
    // Estadísticas del mes
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    // Agregaciones
    const estadisticasDia = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: hoy,
            $lt: manana
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          cantidad: { $sum: 1 },
          promedio: { $avg: "$total" }
        }
      }
    ]);
    const estadisticasSemana = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: inicioSemana,
            $lt: manana
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          cantidad: { $sum: 1 },
          promedio: { $avg: "$total" }
        }
      }
    ]);
    const topProductos = await req.models.Sale.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productoId",
          nombre: { $first: "$items.nombre" },
          cantidad: { $sum: "$items.cantidad" },
          total: { $sum: "$items.subtotal" }
        }
      },
      { $sort: { cantidad: -1 } },
      { $limit: 10 }
    ]);
    const porMetodoPago = await req.models.Sale.aggregate([
      {
        $group: {
          _id: "$metodoPago",
          total: { $sum: "$total" },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);
    res.json({
      success: true,
      estadisticas: {
        hoy: estadisticasDia[0] || { total: 0, cantidad: 0, promedio: 0 },
        semana: estadisticasSemana[0] || { total: 0, cantidad: 0, promedio: 0 },
        topProductos,
        porMetodoPago,
        fecha: hoy.toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});
// GET /api/sales/report/daily - Reporte diario
app.get('/api/sales/report/daily', authenticateAndLoadModels, async (req, res) => {
  try {
    const { fecha } = req.query;
    let fechaConsulta = fecha ? new Date(fecha) : new Date();
    fechaConsulta.setHours(0, 0, 0, 0);
    const fechaFin = new Date(fechaConsulta);
    fechaFin.setDate(fechaFin.getDate() + 1);
    // Obtener ventas del día
    const ventas = await req.models.Sale.find({
      fechaVenta: {
        $gte: fechaConsulta,
        $lt: fechaFin
      }
    }).sort({ fechaVenta: 1 });
    // Agregaciones
    const agregaciones = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: fechaConsulta,
            $lt: fechaFin
          }
        }
      },
      {
        $group: {
          _id: null,
          totalVentas: { $sum: 1 },
          totalMonto: { $sum: "$total" },
          promedioTicket: { $avg: "$total" },
          porHora: {
            $push: {
              hora: { $hour: "$fechaVenta" },
              monto: "$total"
            }
          }
        }
      }
    ]);
    // Ventas por hora
    const ventasPorHora = Array.from({ length: 24 }, (_, i) => {
      const ventasHora = ventas.filter(v =>
        new Date(v.fechaVenta).getHours() === i
      );
      return {
        hora: i,
        cantidad: ventasHora.length,
        monto: ventasHora.reduce((sum, v) => sum + v.total, 0)
      };
    });
    res.json({
      success: true,
      fecha: fechaConsulta.toISOString().split('T')[0],
      ventas,
      reporte: agregaciones[0] || {
        totalVentas: 0,
        totalMonto: 0,
        promedioTicket: 0
      },
      ventasPorHora
    });
  } catch (error) {
    console.error('❌ Error generando reporte diario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar reporte'
    });
  }
});
// PUT /api/sales/:id/cancel - Anular una venta
app.put('/api/sales/:id/cancel', authenticateAndLoadModels, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    console.log(`❌ Anulando venta ${id} en tienda: ${req.user.databaseName}`);
    const venta = await req.models.Sale.findById(id);
    if (!venta) {
      return res.status(404).json({
        success: false,
        error: 'Venta no encontrada'
      });
    }
    // Verificar que no esté ya cancelada
    if (venta.estado === 'cancelada') {
      return res.status(400).json({
        success: false,
        error: 'La venta ya está cancelada'
      });
    }
    // Reintegrar stock si la venta fue completada
    if (venta.estado === 'completada') {
      try {
        for (const item of venta.items) {
          if (item.productoId) {
            const producto = await req.models.Product.findById(item.productoId);
            if (producto) {
              await req.models.Product.findByIdAndUpdate(item.productoId, {
                $inc: { stock: item.cantidad },
                fechaActualizacion: new Date()
              });
              console.log(`📦 Stock reintegrado: ${producto.nombre} + ${item.cantidad} unidades`);
            }
          }
        }
      } catch (stockError) {
        console.error('⚠️ Error reintegrando stock:', stockError);
      }
    }
    // Actualizar estado de la venta
    venta.estado = 'cancelada';
    venta.notas = motivo ? `Cancelada: ${motivo}` : 'Cancelada sin motivo especificado';
    venta.fechaActualizacion = new Date();
    await venta.save();
    res.json({
      success: true,
      venta,
      message: 'Venta cancelada exitosamente'
    });
  } catch (error) {
    console.error('❌ Error cancelando venta:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cancelar la venta'
    });
  }
});
// ==================== RUTAS DE DASHBOARD ====================
// GET /api/dashboard/stats - Estadísticas principales del dashboard
app.get('/api/dashboard/stats', authenticateAndLoadModels, async (req, res) => {
  try {
    console.log(`📊 Obteniendo estadísticas para dashboard de: ${req.user.databaseName}`);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    // 1. Ventas de hoy
    const ventasHoy = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: { $gte: hoy, $lt: manana },
          estado: 'completada'
        }
      },
      {
        $group: {
          _id: null,
          monto: { $sum: "$total" },
          cantidad: { $sum: 1 }
        }
      }
    ]);
    // 2. Ventas de ayer para cambio %
    const ventasAyer = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: { $gte: ayer, $lt: hoy },
          estado: 'completada'
        }
      },
      {
        $group: {
          _id: null,
          monto: { $sum: "$total" }
        }
      }
    ]);
    const montoHoy = ventasHoy[0]?.monto || 0;
    const montoAyer = ventasAyer[0]?.monto || 0;
    const cambioPorcentual = montoAyer > 0
      ? ((montoHoy - montoAyer) / montoAyer * 100).toFixed(1)
      : (montoHoy > 0 ? 100 : 0);
    // 3. Productos vendidos hoy (unidades)
    const productosVendidosHoy = await req.models.Sale.aggregate([
      {
        $match: { fechaVenta: { $gte: hoy, $lt: manana }, estado: 'completada' }
      },
      { $unwind: "$items" },
      { $group: { _id: null, cantidad: { $sum: "$items.cantidad" } } }
    ]);
    // 4. Clientes únicos hoy
    const clientesAtendidosHoy = await req.models.Sale.aggregate([
      {
        $match: { fechaVenta: { $gte: hoy, $lt: manana }, estado: 'completada' }
      },
      {
        $group: { _id: "$cliente" }
      },
      {
        $group: { _id: null, cantidad: { $sum: 1 } }
      }
    ]);
    // 5. Productos con stock bajo
    const productosStockBajo = await req.models.Product.countDocuments({
      estado: 'activo',
      $expr: {
        $and: [
          { $gt: ["$stock", 0] },
          { $lte: ["$stock", "$stockMinimo"] }
        ]
      }
    });
    // 6. Productos sin stock
    const productosSinStock = await req.models.Product.countDocuments({
      estado: 'activo',
      stock: 0
    });
    // 7. Total productos activos
    const totalProductos = await req.models.Product.countDocuments({ estado: 'activo' });
    // 8. Total clientes
    const totalClientes = await req.models.Client.countDocuments();
    // 9. Ventas del mes
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ventasMes = await req.models.Sale.aggregate([
      {
        $match: { fechaVenta: { $gte: inicioMes }, estado: 'completada' }
      },
      {
        $group: {
          _id: null,
          monto: { $sum: "$total" },
          cantidad: { $sum: 1 }
        }
      }
    ]);
    // 10. Ventas recientes (hoy)
    const ventasRecientes = await req.models.Sale.find({
      fechaVenta: { $gte: hoy, $lt: manana },
      estado: 'completada'
    })
      .sort({ fechaVenta: -1 })
      .limit(10)
      .lean();
    // 11. Alertas de stock bajo (detalle)
    const alertasStockBajo = await req.models.Product.find({
      estado: 'activo',
      $expr: {
        $and: [
          { $gt: ["$stock", 0] },
          { $lte: ["$stock", "$stockMinimo"] }
        ]
      }
    })
      .select('nombre categoria stock stockMinimo')
      .limit(5)
      .lean();
    // 12. Productos más vendidos (últimos 30 días)
    const fecha30DiasAtras = new Date();
    fecha30DiasAtras.setDate(fecha30DiasAtras.getDate() - 30);
    const productosMasVendidos = await req.models.Sale.aggregate([
      {
        $match: { fechaVenta: { $gte: fecha30DiasAtras }, estado: 'completada' }
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productoId",
          nombre: { $first: "$items.nombre" },
          totalVendido: { $sum: "$items.cantidad" },
          totalIngresos: { $sum: "$items.subtotal" }
        }
      },
      { $sort: { totalVendido: -1 } },
      { $limit: 5 }
    ]);
    // 13. Cajeros activos hoy
    const usuariosActivos = await req.models.Sale.aggregate([
      {
        $match: { fechaVenta: { $gte: hoy, $lt: manana }, estado: 'completada' }
      },
      {
        $group: {
          _id: "$usuarioNombre",
          nombre: { $first: "$usuarioNombre" },
          totalVentasHoy: { $sum: 1 },
          montoVentasHoy: { $sum: "$total" }
        }
      },
      { $sort: { montoVentasHoy: -1 } }
    ]);
    // 14. Métodos de pago hoy
    const metodosPagoHoy = await req.models.Sale.aggregate([
      {
        $match: { fechaVenta: { $gte: hoy, $lt: manana }, estado: 'completada' }
      },
      {
        $group: {
          _id: "$metodoPago",
          monto: { $sum: "$total" },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { monto: -1 } }
    ]);
    const estadisticas = {
      ventasHoy: {
        monto: montoHoy,
        cantidad: ventasHoy[0]?.cantidad || 0,
        cambio: parseFloat(cambioPorcentual)
      },
      productosVendidosHoy: productosVendidosHoy[0]?.cantidad || 0,
      clientesAtendidosHoy: clientesAtendidosHoy[0]?.cantidad || 1,
      productosStockBajo,
      productosSinStock,
      totalProductos,
      totalClientes,
      ventasMes: {
        monto: ventasMes[0]?.monto || 0,
        cantidad: ventasMes[0]?.cantidad || 0
      },
      ventasRecientes,
      alertasStockBajo,
      productosMasVendidos,
      usuariosActivos,
      metodosPagoHoy,
      resumen: {
        fechaActual: hoy.toISOString(),
        tienda: req.user.databaseName,
        usuario: req.user.usuario
      }
    };
    res.json({
      success: true,
      stats: estadisticas
    });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas del dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas del dashboard'
    });
  }
});
// GET /api/dashboard/ventas/:periodo - Ventas por período
app.get('/api/dashboard/ventas/:periodo', authenticateAndLoadModels, async (req, res) => {
  try {
    const { periodo } = req.params;
    let fechaInicio, fechaFin;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    switch (periodo) {
      case 'hoy':
        fechaInicio = hoy;
        fechaFin = new Date(hoy);
        fechaFin.setDate(fechaFin.getDate() + 1);
        break;
      case 'ayer':
        fechaInicio = new Date(hoy);
        fechaInicio.setDate(fechaInicio.getDate() - 1);
        fechaFin = hoy;
        break;
      case 'semana':
        fechaInicio = new Date(hoy);
        fechaInicio.setDate(hoy.getDate() - hoy.getDay());
        fechaFin = new Date(hoy);
        fechaFin.setDate(fechaFin.getDate() + (6 - hoy.getDay()) + 1);
        break;
      case 'mes':
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        fechaFin.setHours(23, 59, 59, 999);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Período no válido. Usa: hoy, ayer, semana, mes'
        });
    }
    // Ventas por día dentro del período
    const ventasPorDia = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: fechaInicio,
            $lte: fechaFin
          },
          estado: 'completada'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$fechaVenta" }
          },
          monto: { $sum: "$total" },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    // Resumen total del período
    const resumenPeriodo = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: fechaInicio,
            $lte: fechaFin
          },
          estado: 'completada'
        }
      },
      {
        $group: {
          _id: null,
          montoTotal: { $sum: "$total" },
          cantidadTotal: { $sum: 1 },
          promedioTicket: { $avg: "$total" }
        }
      }
    ]);
    // Métodos de pago en el período
    const metodosPagoPeriodo = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: fechaInicio,
            $lte: fechaFin
          },
          estado: 'completada'
        }
      },
      {
        $group: {
          _id: "$metodoPago",
          monto: { $sum: "$total" },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { monto: -1 } }
    ]);
    // Top productos del período
    const topProductosPeriodo = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: fechaInicio,
            $lte: fechaFin
          },
          estado: 'completada'
        }
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productoId",
          nombre: { $first: "$items.nombre" },
          cantidadVendida: { $sum: "$items.cantidad" },
          ingresos: { $sum: "$items.subtotal" }
        }
      },
      { $sort: { cantidadVendida: -1 } },
      { $limit: 10 }
    ]);
    res.json({
      success: true,
      periodo,
      fechaInicio,
      fechaFin,
      ventasPorDia,
      resumen: resumenPeriodo[0] || {
        montoTotal: 0,
        cantidadTotal: 0,
        promedioTicket: 0
      },
      metodosPago: metodosPagoPeriodo,
      topProductos: topProductosPeriodo
    });
  } catch (error) {
    console.error('❌ Error obteniendo ventas por período:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener ventas por período'
    });
  }
});
// GET /api/dashboard/productos-mas-vendidos/:limite
app.get('/api/dashboard/productos-mas-vendidos/:limite?', authenticateAndLoadModels, async (req, res) => {
  try {
    const limite = parseInt(req.params.limite) || 10;
    const fecha30DiasAtras = new Date();
    fecha30DiasAtras.setDate(fecha30DiasAtras.getDate() - 30);
    const productosMasVendidos = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: { $gte: fecha30DiasAtras },
          estado: 'completada'
        }
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productoId",
          nombre: { $first: "$items.nombre" },
          cantidadTotal: { $sum: "$items.cantidad" },
          ingresosTotal: { $sum: "$items.subtotal" },
          precioPromedio: { $avg: "$items.precioUnitario" }
        }
      },
      { $sort: { cantidadTotal: -1 } },
      { $limit: limite }
    ]);
    // Si quieres incluir información del producto actual
    const productosConInfo = await Promise.all(
      productosMasVendidos.map(async (producto) => {
        try {
          const productoActual = await req.models.Product.findById(producto._id);
          if (productoActual) {
            return {
              ...producto,
              categoria: productoActual.categoria,
              stockActual: productoActual.stock,
              imagen: productoActual.imagen
            };
          }
          return producto;
        } catch {
          return producto;
        }
      })
    );
    res.json({
      success: true,
      periodo: 'Últimos 30 días',
      productos: productosConInfo,
      totalProductos: productosConInfo.length
    });
  } catch (error) {
    console.error('❌ Error obteniendo productos más vendidos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener productos más vendidos'
    });
  }
});
// GET /api/dashboard/alertas - Alertas del sistema
app.get('/api/dashboard/alertas', authenticateAndLoadModels, async (req, res) => {
  try {
    const hoy = new Date();
    const alertas = [];
    // 1. Alertas de stock bajo
    const productosStockBajo = await req.models.Product.find({
      stock: { $lte: "$stockMinimo" },
      estado: 'activo'
    })
      .select('nombre stock stockMinimo categoria')
      .limit(10);
    if (productosStockBajo.length > 0) {
      alertas.push({
        tipo: 'stock_bajo',
        titulo: `${productosStockBajo.length} productos con stock bajo`,
        productos: productosStockBajo,
        severidad: 'alta',
        prioridad: 1
      });
    }
    // 2. Alertas de productos agotados
    const productosAgotados = await req.models.Product.find({
      stock: 0,
      estado: 'activo'
    })
      .select('nombre categoria')
      .limit(10);
    if (productosAgotados.length > 0) {
      alertas.push({
        tipo: 'stock_agotado',
        titulo: `${productosAgotados.length} productos agotados`,
        productos: productosAgotados,
        severidad: 'critica',
        prioridad: 0
      });
    }
    // 3. Ventas con problemas (opcional)
    const ventasProblema = await req.models.Sale.find({
      estado: { $in: ['pendiente', 'reembolsada'] }
    })
      .sort({ fechaVenta: -1 })
      .limit(5);
    if (ventasProblema.length > 0) {
      alertas.push({
        tipo: 'ventas_problema',
        titulo: `${ventasProblema.length} ventas requieren atención`,
        ventas: ventasProblema,
        severidad: 'media',
        prioridad: 2
      });
    }
    // 4. Clientes sin compras recientes (más de 30 días)
    const fecha30DiasAtras = new Date();
    fecha30DiasAtras.setDate(fecha30DiasAtras.getDate() - 30);
    const clientesInactivos = await req.models.Client.find({
      $or: [
        { ultimaCompra: { $lt: fecha30DiasAtras } },
        { ultimaCompra: { $exists: false } }
      ],
      tipoCliente: { $in: ['frecuente', 'premium'] }
    })
      .select('nombre email ultimaCompra tipoCliente')
      .limit(5);
    if (clientesInactivos.length > 0) {
      alertas.push({
        tipo: 'clientes_inactivos',
        titulo: `${clientesInactivos.length} clientes frecuentes inactivos`,
        clientes: clientesInactivos,
        severidad: 'baja',
        prioridad: 3
      });
    }
    res.json({
      success: true,
      alertas,
      totalAlertas: alertas.length,
      fecha: hoy.toISOString()
    });
  } catch (error) {
    console.error('❌ Error obteniendo alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener alertas del sistema'
    });
  }
});
// GET /api/dashboard/metodos-pago - Métodos de pago por período
app.get('/api/dashboard/metodos-pago', authenticateAndLoadModels, async (req, res) => {
  try {
    const { periodo = 'hoy' } = req.query;
    let fechaInicio, fechaFin;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    switch (periodo) {
      case 'hoy':
        fechaInicio = hoy;
        fechaFin = new Date(hoy);
        fechaFin.setDate(fechaFin.getDate() + 1);
        break;
      case 'semana':
        fechaInicio = new Date(hoy);
        fechaInicio.setDate(hoy.getDate() - 7);
        fechaFin = new Date(hoy);
        fechaFin.setDate(fechaFin.getDate() + 1);
        break;
      case 'mes':
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Período no válido. Usa: hoy, semana, mes'
        });
    }
    const metodosPago = await req.models.Sale.aggregate([
      {
        $match: {
          fechaVenta: {
            $gte: fechaInicio,
            $lt: fechaFin
          },
          estado: 'completada'
        }
      },
      {
        $group: {
          _id: "$metodoPago",
          montoTotal: { $sum: "$total" },
          cantidad: { $sum: 1 },
          promedio: { $avg: "$total" }
        }
      },
      { $sort: { montoTotal: -1 } }
    ]);
    // Calcular porcentajes
    const totalMonto = metodosPago.reduce((sum, item) => sum + item.montoTotal, 0);
    const metodosConPorcentaje = metodosPago.map(item => ({
      ...item,
      porcentaje: totalMonto > 0 ? ((item.montoTotal / totalMonto) * 100).toFixed(1) : 0
    }));
    res.json({
      success: true,
      periodo,
      fechaInicio,
      fechaFin,
      metodosPago: metodosConPorcentaje,
      totalMonto,
      totalTransacciones: metodosPago.reduce((sum, item) => sum + item.cantidad, 0)
    });
  } catch (error) {
    console.error('❌ Error obteniendo métodos de pago:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener métodos de pago'
    });
  }
});
// ==================== RUTAS DE DEBUG Y VERIFICACIÓN ====================
app.get('/api/debug/check-auth', authenticateAndLoadModels, async (req, res) => {
  try {
    const count = await req.models.Product.countDocuments();
    res.json({
      success: true,
      message: '✅ Autenticación y conexión a tienda exitosa',
      user: {
        id: req.user.id,
        usuario: req.user.usuario,
        nombre: req.user.nombre,
        databaseName: req.user.databaseName
      },
      tienda: {
        nombre: req.user.databaseName,
        productosCount: count,
        conexionesActivas: Object.keys(global.userConnections).length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error en check-auth:', error);
    res.status(500).json({
      success: false,
      error: 'Error verificando conexión a tienda'
    });
  }
});
app.get('/api/check-tienda', authenticateAndLoadModels, async (req, res) => {
  try {
    const count = await req.models.Product.countDocuments();
    const productosActivos = await req.models.Product.countDocuments({ estado: 'activo' });
    const productosAgotados = await req.models.Product.countDocuments({ estado: 'agotado' });
    const stockBajo = await req.models.Product.countDocuments({
      estado: 'activo',
      stock: { $lte: '$stockMinimo' }
    });
    res.json({
      success: true,
      tienda: req.user.databaseName,
      estado: '✅ Tienda operativa',
      estadisticas: {
        totalProductos: count,
        productosActivos,
        productosAgotados,
        stockBajo,
        conexion: 'Conectado'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error en check-tienda:', error);
    res.status(500).json({
      success: false,
      error: 'Error accediendo a la tienda',
      tienda: req.user.databaseName,
      estado: '❌ Error de conexión'
    });
  }
});
app.get('/api/health', async (req, res) => {
  try {
    const mainDB = mainConnection.readyState === 1;
    res.json({
      success: true,
      message: 'API Multi-Tenant funcionando correctamente',
      status: {
        api: 'online',
        mainDatabase: mainDB ? 'connected' : 'disconnected',
        conexionesActivas: Object.keys(global.userConnections).length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});
app.get('/', (req, res) => {
  res.json({
    message: 'Sistema POS Multi-Tenant',
    version: '1.0.0',
    description: 'Cada usuario tiene su propia tienda independiente',
    endpoints: {
      auth: ['POST /api/register', 'POST /api/login'],
      products: ['GET /api/products', 'POST /api/products', 'PUT /api/products/:id', 'DELETE /api/products/:id'],
      sales: ['POST /api/sales', 'GET /api/sales', 'GET /api/sales/:id', 'GET /api/sales/today', 'GET /api/sales/stats', 'PUT /api/sales/:id/cancel'],
      debug: ['GET /api/debug/check-auth', 'GET /api/check-tienda', 'GET /api/health']
    }
  });
});
// Middleware para manejar errores 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada'
  });
});
// Middleware para manejar errores
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});
// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log('🔧 Sistema multi-tenant activado');
  console.log('🏪 Cada nuevo registro crea una base de datos independiente');
  console.log('\n📋 Endpoints disponibles:');
  console.log(' POST /api/register - Registrar nuevo usuario y crear tienda');
  console.log(' POST /api/login - Iniciar sesión');
  console.log(' GET /api/products - Obtener productos (requiere auth)');
  console.log(' POST /api/products - Crear producto (requiere auth)');
  console.log(' POST /api/sales - Crear venta');
  console.log(' GET /api/sales/today - Ventas de hoy');
  console.log(' GET /api/health - Verificar estado del sistema\n');
});