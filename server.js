require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CONEXIÓN A MONGO ATLAS
========================= */

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("Mongo conectado correctamente");
    })
    .catch((err) => {
        console.error("Error conectando a Mongo:", err);
    });

/* =========================
   MODELOS
========================= */

const deviceStateSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    led: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});

const sensorDataSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    temperature: Number,
    humidity: Number,
    timestamp: { type: Date, default: Date.now }
});

const DeviceState = mongoose.model("DeviceState", deviceStateSchema);
const SensorData = mongoose.model("SensorData", sensorDataSchema);

/* =========================
   RUTAS
========================= */

// Obtener estado del dispositivo (ESP32 consulta aquí)
app.get("/device-state/:id", async (req, res) => {
    try {
        const state = await DeviceState.findOne({ deviceId: req.params.id });
        res.json(state);
    } catch (error) {
        res.status(500).json({ error: "Error obteniendo estado" });
    }
});

// Cambiar estado desde la app
app.post("/device-state", async (req, res) => {
    try {
        const { deviceId, led } = req.body;

        // ✅ Corregido: usar returnDocument en lugar de new
        const updated = await DeviceState.findOneAndUpdate(
            { deviceId },
            { led, updatedAt: new Date() },
            { upsert: true, returnDocument: 'after' }
        );

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: "Error actualizando estado" });
    }
});

// Guardar datos del sensor
app.post("/sensor-data", async (req, res) => {
    try {
        const { deviceId, temperature, humidity } = req.body;

        const newData = new SensorData({
            deviceId,
            temperature,
            humidity
        });

        await newData.save();
        res.json({ message: "Datos guardados" });
    } catch (error) {
        res.status(500).json({ error: "Error guardando datos" });
    }
});

// Obtener la última medición de un dispositivo
app.get("/sensor-data/:deviceId/latest", async (req, res) => {
    try {
        const { deviceId } = req.params;
        const latestData = await SensorData.findOne({ deviceId })
            .sort({ timestamp: -1 });

        // Si no hay datos, devolvemos un objeto con valores nulos (no error)
        if (!latestData) {
            return res.json({
                deviceId,
                temperature: null,
                humidity: null,
                timestamp: null
            });
        }

        res.json(latestData);
    } catch (error) {
        console.error("Error obteniendo último dato:", error);
        res.status(500).json({ error: "Error obteniendo último dato del sensor" });
    }
});

// Obtener historial de lecturas de un dispositivo
app.get("/sensor-data/:deviceId", async (req, res) => {
    try {
        const { deviceId } = req.params;
        const limit = parseInt(req.query.limit) || 100;

        const data = await SensorData.find({ deviceId })
            .sort({ timestamp: -1 })
            .limit(limit);

        // Si no hay datos, devolver array vacío
        if (!data || data.length === 0) {
            return res.json([]);
        }

        res.json(data);
    } catch (error) {
        console.error("Error obteniendo historial:", error);
        res.status(500).json({ error: "Error obteniendo historial" });
    }
});

// ========= NUEVO ENDPOINT: LIMPIAR HISTORIAL =========
// Eliminar todos los registros de sensor data de un dispositivo
app.delete("/sensor-data/:deviceId", async (req, res) => {
    try {
        const { deviceId } = req.params;

        const result = await SensorData.deleteMany({ deviceId });

        res.json({
            message: "Historial eliminado correctamente",
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error("Error eliminando historial:", error);
        res.status(500).json({ error: "Error eliminando historial" });
    }
});

/* =========================
   RUTAS DE DESARROLLO (DEV)
   Funcionalidades para administración y pruebas
========================= */

// Descargar dataset completo (todos los sensores)
app.get("/dev/dataset", async (req, res) => {
    try {
        const data = await SensorData.find().sort({ timestamp: -1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Error descargando dataset" });
    }
});

// Limpiar TODOS los registros del servidor (Reset total de datos)
app.delete("/dev/reset-server", async (req, res) => {
    try {
        // Eliminar todos los datos de sensores
        await SensorData.deleteMany({});
        // Opcional: Eliminar estados de dispositivos si se requiere limpieza total
        // await DeviceState.deleteMany({}); 

        res.json({ message: "Servidor limpio: todos los registros de sensores han sido eliminados" });
    } catch (error) {
        res.status(500).json({ error: "Error limpiando servidor" });
    }
});

// Endpoint de confirmación para limpieza local (Señalización)
app.post("/dev/reset-local", async (req, res) => {
    // Este endpoint no borra nada en el servidor, solo confirma la acción al cliente
    res.json({ action: "clear_local", message: "Autorización concedida para limpieza local" });
});

/* =========================
   TAREA DE LIMPIEZA AUTOMÁTICA
   Elimina registros mayores a 1 año
========================= */

async function cleanOldData() {
    try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const result = await SensorData.deleteMany({
            timestamp: { $lt: oneYearAgo }
        });

        if (result.deletedCount > 0) {
            console.log(`🗑️  Limpieza automática: ${result.deletedCount} registros eliminados (> 1 año)`);
        }
    } catch (error) {
        console.error("Error en limpieza automática:", error);
    }
}

// Ejecutar limpieza cada 24 horas
setInterval(cleanOldData, 24 * 60 * 60 * 1000);

// Ejecutar limpieza al iniciar el servidor
cleanOldData();

/* =========================
   SERVIDOR
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    console.log(`Limpieza automática activada (registros > 1 año)`);
});
