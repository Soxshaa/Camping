const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rydazenqrpnlfmhtxwek.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5ZGF6ZW5xcnBubGZtaHR4d2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTIwNjMsImV4cCI6MjEwMzM2ODA2M30.UVLiaWo8VA9K-Dpg2w5l_kxqK92hFzp5hNGK6MbqM50';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARIFAS = {
    Camping: { adulto: 8000, nino: 6000 },
    Picnic:  { adulto: 7000, nino: 5000 }
};

function calcularCheckout(tipo, dias) {
    const ahora = new Date();
    if (tipo === 'Picnic') {
        const checkout = new Date(ahora);
        checkout.setHours(20, 0, 0, 0);
        return checkout.toISOString();
    } else {
        const checkout = new Date(ahora);
        checkout.setDate(checkout.getDate() + parseInt(dias));
        checkout.setHours(9, 0, 0, 0);
        return checkout.toISOString();
    }
}

// FUNCIÓN AUXILIAR PARA REGISTRAR MOVIMIENTOS
async function registrarLog(accion, detalle, usuario = 'Génesis/Maxi') {
    try {
        await supabase.from('logs').insert([{ accion, detalle, usuario, fecha: new Date().toISOString() }]);
    } catch (e) {
        console.error("Error guardando log:", e);
    }
}

// ------------------- RUTAS DE RESERVAS -------------------

app.get('/api/reservas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('reservas').select('*').order('id', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reservas', async (req, res) => {
    try {
        const { titular, rut, patente, telefono_emergencia, tipo, adultos, ninos, mesa_sitio, dias, metodo_pago, esta_al_dia, usuario } = req.body;
        
        const numAdultos = parseInt(adultos || 1);
        const numNinos = parseInt(ninos || 0);
        const numDias = tipo === 'Camping' ? parseInt(dias || 1) : 1;

        const tarifa = TARIFAS[tipo];
        let montoTotal = (numAdultos * tarifa.adulto) + (numNinos * tarifa.nino);
        if (tipo === 'Camping') montoTotal *= numDias;

        const fechaCheckout = calcularCheckout(tipo, numDias);

        const { data, error } = await supabase
            .from('reservas')
            .insert([{
                titular, rut, patente, telefono_emergencia, tipo,
                adultos: numAdultos, ninos: numNinos, mesa_sitio,
                dias: numDias, fecha_checkout: fechaCheckout,
                monto_total: montoTotal, metodo_pago, esta_al_dia: Boolean(esta_al_dia),
                usuario: usuario || 'Génesis/Maxi'
            }]).select();

        if (error) throw error;

        await registrarLog('CREAR RESERVA', `Reserva ${tipo} - Titular: ${titular} ($${montoTotal})`, usuario);

        res.json({ id: data[0].id, mensaje: "Reserva creada con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/reservas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titular, rut, patente, telefono_emergencia, tipo, adultos, ninos, mesa_sitio, dias, metodo_pago, esta_al_dia, usuario } = req.body;

        const numAdultos = parseInt(adultos || 1);
        const numNinos = parseInt(ninos || 0);
        const numDias = tipo === 'Camping' ? parseInt(dias || 1) : 1;

        const tarifa = TARIFAS[tipo];
        let montoTotal = (numAdultos * tarifa.adulto) + (numNinos * tarifa.nino);
        if (tipo === 'Camping') montoTotal *= numDias;

        const fechaCheckout = calcularCheckout(tipo, numDias);

        const { error } = await supabase
            .from('reservas')
            .update({
                titular, rut, patente, telefono_emergencia, tipo,
                adultos: numAdultos, ninos: numNinos, mesa_sitio,
                dias: numDias, fecha_checkout: fechaCheckout,
                monto_total: montoTotal, metodo_pago, esta_al_dia: Boolean(esta_al_dia)
            }).eq('id', id);

        if (error) throw error;

        await registrarLog('EDITAR RESERVA', `Editó reserva ID #${id} de ${titular}`, usuario);

        res.json({ mensaje: "Reserva actualizada correctamente" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/reservas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario } = req.query;

        const { error } = await supabase.from('reservas').delete().eq('id', id);
        if (error) throw error;

        await registrarLog('ELIMINAR RESERVA', `Eliminó la reserva ID #${id}`, usuario || 'Staff');

        res.json({ mensaje: "Reserva eliminada con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reservas/:id/renovar', async (req, res) => {
    try {
        const { id } = req.params;
        const { diasExtra, usuario } = req.body;

        const { data: reserva, error: fetchErr } = await supabase.from('reservas').select('*').eq('id', id).single();
        if (fetchErr || !reserva) return res.status(404).json({ error: "Reserva no encontrada" });

        const nuevosDias = reserva.dias + parseInt(diasExtra);
        const tarifaDiaria = (reserva.adultos * TARIFAS.Camping.adulto) + (reserva.ninos * TARIFAS.Camping.nino);
        const nuevoMonto = Number(reserva.monto_total) + (tarifaDiaria * parseInt(diasExtra));

        const currentCheckout = new Date(reserva.fecha_checkout);
        currentCheckout.setDate(currentCheckout.getDate() + parseInt(diasExtra));

        const { error: updateErr } = await supabase.from('reservas').update({
            dias: nuevosDias,
            fecha_checkout: currentCheckout.toISOString(),
            monto_total: nuevoMonto,
            esta_al_dia: true
        }).eq('id', id);

        if (updateErr) throw updateErr;

        await registrarLog('RENOVAR ESTADÍA', `Renovó +${diasExtra} día(s) a reserva de ${reserva.titular}`, usuario);

        res.json({ mensaje: "Estadía renovada correctamente" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- RUTAS DE ENTREGAS DE CAJA -------------------

app.get('/api/cierres-caja', async (req, res) => {
    try {
        const { data, error } = await supabase.from('cierres_caja').select('*').order('id', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/cierres-caja', async (req, res) => {
    try {
        const { portero, dueno, monto, observaciones } = req.body;
        const { data, error } = await supabase.from('cierres_caja').insert([{
            portero, dueno, monto: Number(monto), observaciones, fecha: new Date().toISOString()
        }]).select();

        if (error) throw error;

        await registrarLog('ENTREGA DE CAJA', `Portería (${portero}) entregó $${Number(monto).toLocaleString("es-CL")} a dueño (${dueno})`, portero);

        res.json({ mensaje: "Cierre registrado con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- RUTAS DE LOGS -------------------

app.get('/api/logs', async (req, res) => {
    try {
        const { data, error } = await supabase.from('logs').select('*').order('id', { ascending: false }).limit(100);
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;