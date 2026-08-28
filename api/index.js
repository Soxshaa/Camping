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

async function registrarLog(accion, detalle, usuario = 'Staff') {
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

// NUEVO REGISTRO
app.post('/api/reservas', async (req, res) => {
    try {
        const { titular, rut, patente, telefono_emergencia, tipo, adultos, ninos, mesa_sitio, dias, metodo_pago, esta_al_dia, usuario } = req.body;
        
        const numAdultos = parseInt(adultos || 1, 10);
        const numNinos = parseInt(ninos || 0, 10);
        const numDias = tipo === 'Camping' ? parseInt(dias || 1, 10) : 1;

        const tarifa = TARIFAS[tipo];
        let montoTotal = (numAdultos * tarifa.adulto) + (numNinos * tarifa.nino);
        if (tipo === 'Camping') montoTotal *= numDias;

        const fechaCheckout = calcularCheckout(tipo, numDias);
        const porteroResponsable = usuario || 'Maxi';

        const { data, error } = await supabase
            .from('reservas')
            .insert([{
                titular, rut, patente, telefono_emergencia, tipo,
                adultos: numAdultos, ninos: numNinos, mesa_sitio,
                dias: numDias, fecha_checkout: fechaCheckout,
                monto_total: montoTotal, metodo_pago, esta_al_dia: Boolean(esta_al_dia),
                usuario: porteroResponsable
            }]).select();

        if (error) throw error;

        const detalleIngreso = `📋 NUEVO REGISTRO EN PORTERÍA [${porteroResponsable}]:\n` +
            `• Titular: ${titular} (RUT: ${rut || 'N/A'})\n` +
            `• Patente: ${patente || 'Sin Vehículo'}\n` +
            `• Teléfono: ${telefono_emergencia || 'N/A'}\n` +
            `• Servicio: ${tipo} en '${mesa_sitio}'\n` +
            `• Cantidad Personas: ${numAdultos} Adultos / ${numNinos} Niños\n` +
            `• Estadía: ${numDias} día(s)\n` +
            `• Cobro: $${montoTotal.toLocaleString('es-CL')} via ${metodo_pago}\n` +
            `• Estado de Pago: ${esta_al_dia ? '🟢 Pagó Completo' : '🔴 Pago Pendiente'}`;

        await registrarLog('NUEVO REGISTRO', detalleIngreso, porteroResponsable);

        res.json({ id: data[0].id, mensaje: "Reserva creada con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// EDICIÓN DETALLADA (AUDITORÍA COMPLETA)
app.put('/api/reservas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titular, rut, patente, telefono_emergencia, tipo, adultos, ninos, mesa_sitio, dias, metodo_pago, esta_al_dia, usuario } = req.body;

        // 1. Obtener datos antes de la actualización
        const { data: antes, error: errAntes } = await supabase.from('reservas').select('*').eq('id', id).single();
        if (errAntes || !antes) return res.status(404).json({ error: "Reserva no encontrada" });

        const numAdultos = parseInt(adultos || 1, 10);
        const numNinos = parseInt(ninos || 0, 10);
        const numDias = tipo === 'Camping' ? parseInt(dias || 1, 10) : 1;

        const tarifa = TARIFAS[tipo];
        let montoTotal = (numAdultos * tarifa.adulto) + (numNinos * tarifa.nino);
        if (tipo === 'Camping') montoTotal *= numDias;

        const fechaCheckout = calcularCheckout(tipo, numDias);
        const porteroModificador = usuario || 'Maxi';

        // 2. Actualizar registro en Supabase
        const { error } = await supabase
            .from('reservas')
            .update({
                titular, rut, patente, telefono_emergencia, tipo,
                adultos: numAdultos, ninos: numNinos, mesa_sitio,
                dias: numDias, fecha_checkout: fechaCheckout,
                monto_total: montoTotal, metodo_pago, esta_al_dia: Boolean(esta_al_dia)
            }).eq('id', id);

        if (error) throw error;

        // 3. Normalización y comparación de campos
        const prevAdultos = parseInt(antes.adultos ?? 1, 10);
        const prevNinos = parseInt(antes.ninos ?? 0, 10);
        const prevDias = parseInt(antes.dias ?? 1, 10);
        const prevRut = antes.rut || 'N/A';
        const prevPatente = antes.patente || 'Sin Vehículo';
        const prevContacto = antes.telefono_emergencia || 'N/A';

        let cambios = [];

        if (antes.titular !== titular) cambios.push(`Titular: '${antes.titular}' ➔ '${titular}'`);
        if (prevRut !== (rut || 'N/A')) cambios.push(`RUT: '${prevRut}' ➔ '${rut || 'N/A'}'`);
        if (prevPatente !== (patente || 'Sin Vehículo')) cambios.push(`Patente: '${prevPatente}' ➔ '${patente || 'Sin Vehículo'}'`);
        if (prevContacto !== (telefono_emergencia || 'N/A')) cambios.push(`Teléfono: '${prevContacto}' ➔ '${telefono_emergencia || 'N/A'}'`);
        if (antes.tipo !== tipo) cambios.push(`Servicio: '${antes.tipo}' ➔ '${tipo}'`);
        if (prevAdultos !== numAdultos) cambios.push(`Adultos: ${prevAdultos} ➔ ${numAdultos}`);
        if (prevNinos !== numNinos) cambios.push(`Niños: ${prevNinos} ➔ ${numNinos}`);
        if (prevDias !== numDias) cambios.push(`Días Estadía: ${prevDias} ➔ ${numDias}`);
        if (antes.mesa_sitio !== mesa_sitio) cambios.push(`Ubicación: '${antes.mesa_sitio}' ➔ '${mesa_sitio}'`);
        if (Number(antes.monto_total) !== montoTotal) cambios.push(`Monto Total: $${Number(antes.monto_total).toLocaleString('es-CL')} ➔ $${montoTotal.toLocaleString('es-CL')}`);
        if (antes.metodo_pago !== metodo_pago) cambios.push(`Método Pago: '${antes.metodo_pago}' ➔ '${metodo_pago}'`);
        if (antes.esta_al_dia !== Boolean(esta_al_dia)) cambios.push(`Estado Pago: '${antes.esta_al_dia ? 'Al día' : 'Pendiente'}' ➔ '${esta_al_dia ? 'Al día' : 'Pendiente'}'`);

        const detalleAuditoria = `⚠️ MODIFICACIÓN POR [${porteroModificador}] en Registro ID #${id} (${titular}):\n` +
            (cambios.length > 0 ? `• DESGLOSE DE CAMBIOS:\n  - ${cambios.join('\n  - ')}` : `• Se guardó el registro sin variaciones.`);

        await registrarLog('EDICIÓN DETECTADA', detalleAuditoria, porteroModificador);

        res.json({ mensaje: "Reserva actualizada correctamente" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/reservas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario } = req.query;
        const porteroEliminador = usuario || 'Staff';

        const { data: antes } = await supabase.from('reservas').select('*').eq('id', id).single();

        const { error } = await supabase.from('reservas').delete().eq('id', id);
        if (error) throw error;

        const detalleBorrado = `🚨 ELIMINACIÓN DE REGISTRO por Portero [${porteroEliminador}]:\n` +
            `• ID Borrado: #${id}\n` +
            `• Titular: ${antes?.titular || 'Desconocido'}\n` +
            `• Patente: ${antes?.patente || 'Sin Vehículo'}\n` +
            `• Grupo: ${antes?.adultos || 1} Adultos / ${antes?.ninos || 0} Niños (${antes?.dias || 1} días)\n` +
            `• Monto Registrado: $${Number(antes?.monto_total || 0).toLocaleString('es-CL')}`;

        await registrarLog('REGISTRO ELIMINADO', detalleBorrado, porteroEliminador);

        res.json({ mensaje: "Reserva eliminada con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reservas/:id/renovar', async (req, res) => {
    try {
        const { id } = req.params;
        const { diasExtra, usuario } = req.body;
        const porteroRenovador = usuario || 'Maxi';

        const { data: reserva, error: fetchErr } = await supabase.from('reservas').select('*').eq('id', id).single();
        if (fetchErr || !reserva) return res.status(404).json({ error: "Reserva no encontrada" });

        const prevDias = Number(reserva.dias || 1);
        const nuevosDias = prevDias + parseInt(diasExtra, 10);
        const tarifaDiaria = (Number(reserva.adultos || 1) * TARIFAS.Camping.adulto) + (Number(reserva.ninos || 0) * TARIFAS.Camping.nino);
        const nuevoMonto = Number(reserva.monto_total) + (tarifaDiaria * parseInt(diasExtra, 10));

        const currentCheckout = new Date(reserva.fecha_checkout);
        currentCheckout.setDate(currentCheckout.getDate() + parseInt(diasExtra, 10));

        const { error: updateErr } = await supabase.from('reservas').update({
            dias: nuevosDias,
            fecha_checkout: currentCheckout.toISOString(),
            monto_total: nuevoMonto,
            esta_al_dia: true
        }).eq('id', id);

        if (updateErr) throw updateErr;

        const detalleRenovacion = `➕ RENOVACIÓN (+${diasExtra} DÍA) por [${porteroRenovador}]:\n` +
            `• Titular: ${reserva.titular} (Patente: ${reserva.patente || 'Sin Vehículo'})\n` +
            `• Días Estadía: ${prevDias} ➔ ${nuevosDias} día(s)\n` +
            `• Monto Total: $${Number(reserva.monto_total).toLocaleString('es-CL')} ➔ $${nuevoMonto.toLocaleString('es-CL')}`;

        await registrarLog('RENOVACIÓN ESTADÍA', detalleRenovacion, porteroRenovador);

        res.json({ mensaje: "Estadía renovada correctamente" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ENTREGAS DE CAJA Y LOGS
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
        const { error } = await supabase.from('cierres_caja').insert([{
            portero, dueno, monto: Number(monto), observaciones, fecha: new Date().toISOString()
        }]);

        if (error) throw error;

        const detalleCaja = `💰 ENTREGA DE DINERO FÍSICO:\n` +
            `• Entrega: ${portero} ➔ Recibe (Dueño): ${dueno}\n` +
            `• Monto Entregado: $${Number(monto).toLocaleString('es-CL')}\n` +
            `• Nota: ${observaciones || 'Sin observaciones'}`;

        await registrarLog('ENTREGA DE CAJA', detalleCaja, portero);

        res.json({ mensaje: "Cierre registrado con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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