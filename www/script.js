const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Base de datos SQLite
const db = new sqlite3.Database('./camping.db', (err) => {
    if (err) console.error("Error al abrir base de datos:", err);
    else console.log("Base de datos SQLite conectada.");
});

// Crear tabla de reservas
db.run(`
    CREATE TABLE IF NOT EXISTS reservas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titular TEXT NOT NULL,
        rut TEXT NOT NULL,
        telefono_emergencia TEXT NOT NULL,
        tipo TEXT CHECK(tipo IN ('Camping', 'Picnic')) NOT NULL,
        personas INTEGER NOT NULL,
        mesa_sitio TEXT NOT NULL,
        fecha_ingreso DATETIME DEFAULT CURRENT_TIMESTAMP,
        dias INTEGER DEFAULT 1,
        fecha_checkout DATETIME,
        monto_total REAL NOT NULL,
        estado TEXT DEFAULT 'Activa'
    )
`);

// PRECIOS
const TARIFA_CAMPING_POR_DIA = 10000;
const TARIFA_PICNIC_DIA = 5000;

// Helper: Calcular hora límite de check-out a las 09:00 AM
function calcularCheckout(tipo, dias) {
    const ahora = new Date();
    if (tipo === 'Picnic') {
        const checkout = new Date(ahora);
        checkout.setHours(20, 0, 0, 0); // Fin de jornada Picnic (20:00 hrs)
        return checkout.toISOString();
    } else {
        const checkout = new Date(ahora);
        checkout.setDate(checkout.getDate() + dias);
        checkout.setHours(9, 0, 0, 0); // 09:00 AM del día límite
        return checkout.toISOString();
    }
}

// 1. Obtener todas las reservas
app.get('/api/reservas', (req, res) => {
    db.all(`SELECT * FROM reservas ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Crear nueva reserva
app.post('/api/reservas', (req, res) => {
    const { titular, rut, telefono_emergencia, tipo, personas, mesa_sitio, dias } = req.body;
    
    const numDias = tipo === 'Camping' ? parseInt(dias || 1) : 1;
    const tarifaUnit = tipo === 'Camping' ? TARIFA_CAMPING_POR_DIA : TARIFA_PICNIC_DIA;
    const montoTotal = personas * tarifaUnit * numDias;
    const fechaCheckout = calcularCheckout(tipo, numDias);

    const query = `
        INSERT INTO reservas 
        (titular, rut, telefono_emergencia, tipo, personas, mesa_sitio, dias, fecha_checkout, monto_total) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [titular, rut, telefono_emergencia, tipo, personas, mesa_sitio, numDias, fechaCheckout, montoTotal], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, mensaje: "Reserva creada con éxito" });
    });
});

// 3. Renovar estadía (Añadir días a Camping)
app.post('/api/reservas/:id/renovar', (req, res) => {
    const { id } = req.params;
    const { diasExtra } = req.body;

    db.get(`SELECT * FROM reservas WHERE id = ?`, [id], (err, reserva) => {
        if (err || !reserva) return res.status(404).json({ error: "Reserva no encontrada" });

        const nuevosDias = reserva.dias + parseInt(diasExtra);
        const nuevoMonto = reserva.personas * TARIFA_CAMPING_POR_DIA * nuevosDias;
        
        // Sumar días a la fecha de checkout actual
        const currentCheckout = new Date(reserva.fecha_checkout);
        currentCheckout.setDate(currentCheckout.getDate() + parseInt(diasExtra));

        const query = `UPDATE reservas SET dias = ?, fecha_checkout = ?, monto_total = ? WHERE id = ?`;
        db.run(query, [nuevosDias, currentCheckout.toISOString(), nuevoMonto, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ mensaje: "Estadía renovada correctamente" });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor ejecutándose en http://localhost:${PORT}`));