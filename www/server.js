const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Configuración global de CORS
app.use(cors());
app.use(express.json());

// Servir archivos estáticos
app.use(express.static(__dirname));

// CONFIGURACIÓN DE CREDENCIALES DE SUPABASE
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rpnlfmhtxwek.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_KIcwfPO2b9Sw4N7XY0EFDw_cmhfQRpO';

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

// 1. OBTENER TODAS LAS RESERVAS
app.get('/api/reservas', async (req, res) => {
    const { data, error } = await supabase
        .from('reservas')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error("Error al obtener reservas:", error.message);
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
});

// 2. CREAR NUEVA RESERVA
app.post('/api/reservas', async (req, res) => {
    const { titular, rut, patente, telefono_emergencia, tipo, adultos, ninos, mesa_sitio, dias, metodo_pago, esta_al_dia } = req.body;
    
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
            titular,
            rut,
            patente,
            telefono_emergencia,
            tipo,
            adultos: numAdultos,
            ninos: numNinos,
            mesa_sitio,
            dias: numDias,
            fecha_checkout: fechaCheckout,
            monto_total: montoTotal,
            metodo_pago,
            esta_al_dia: Boolean(esta_al_dia)
        }])
        .select();

    if (error) {
        console.error("Error al insertar reserva:", error.message);
        return res.status(500).json({ error: error.message });
    }

    res.json({ id: data[0].id, mensaje: "Reserva creada con éxito" });
});

// 3. EDITAR RESERVA
app.put('/api/reservas/:id', async (req, res) => {
    const { id } = req.params;
    const { titular, rut, patente, telefono_emergencia, tipo, adultos, ninos, mesa_sitio, dias, metodo_pago, esta_al_dia } = req.body;

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
            titular,
            rut,
            patente,
            telefono_emergencia,
            tipo,
            adultos: numAdultos,
            ninos: numNinos,
            mesa_sitio,
            dias: numDias,
            fecha_checkout: fechaCheckout,
            monto_total: montoTotal,
            metodo_pago,
            esta_al_dia: Boolean(esta_al_dia)
        })
        .eq('id', id);

    if (error) {
        console.error("Error al actualizar reserva:", error.message);
        return res.status(500).json({ error: error.message });
    }

    res.json({ mensaje: "Reserva actualizada correctamente" });
});

// 4. ELIMINAR RESERVA
app.delete('/api/reservas/:id', async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase
        .from('reservas')
        .delete()
        .eq('id', id);

    if (error) {
        console.error("Error al eliminar reserva:", error.message);
        return res.status(500).json({ error: error.message });
    }

    res.json({ mensaje: "Reserva eliminada con éxito" });
});

// 5. RENOVAR DÍA EXTRA
app.post('/api/reservas/:id/renovar', async (req, res) => {
    const { id } = req.params;
    const { diasExtra } = req.body;

    const { data: reserva, error: fetchErr } = await supabase
        .from('reservas')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchErr || !reserva) {
        return res.status(404).json({ error: "Reserva no encontrada" });
    }

    const nuevosDias = reserva.dias + parseInt(diasExtra);
    const tarifaDiaria = (reserva.adultos * TARIFAS.Camping.adulto) + (reserva.ninos * TARIFAS.Camping.nino);
    const nuevoMonto = Number(reserva.monto_total) + (tarifaDiaria * parseInt(diasExtra));

    const currentCheckout = new Date(reserva.fecha_checkout);
    currentCheckout.setDate(currentCheckout.getDate() + parseInt(diasExtra));

    const { error: updateErr } = await supabase
        .from('reservas')
        .update({
            dias: nuevosDias,
            fecha_checkout: currentCheckout.toISOString(),
            monto_total: nuevoMonto,
            esta_al_dia: true
        })
        .eq('id', id);

    if (updateErr) {
        console.error("Error al renovar estadía:", updateErr.message);
        return res.status(500).json({ error: updateErr.message });
    }

    res.json({ mensaje: "Estadía renovada correctamente" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`==========================================`);
    console.log(`⛺ Servidor Node + Supabase Cloud Activo`);
    console.log(`- Puerto: ${PORT}`);
    console.log(`==========================================`);
});