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

        const updated = await DeviceState.findOneAndUpdate(
            { deviceId },
            { led, updatedAt: new Date() },
            { upsert: true, new: true }
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

/* =========================
   SERVIDOR
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
/* =========================
   SERVIDOR
========================= */