const API_URL = 'http://192.168.1.83:3000/api/reservas';

const TARIFAS = {
    Camping: { adulto: 8000, nino: 6000 },
    Picnic:  { adulto: 7000, nino: 5000 }
};

const COMISION_TUU_PORCENTAJE = 0.029; // 2.9% comisión TUU Chile

let reservasData = [];
let idEdicionActual = null;

document.addEventListener("DOMContentLoaded", () => {
    configurarNavegacion();
    cargarReservas();
    configurarFormulario();
});

// NAVEGACIÓN ENTRE VISTAS (HOME / RESERVAS / DASHBOARD)
function configurarNavegacion() {
    const navHome = document.getElementById("navHome");
    const navReservas = document.getElementById("navReservas");
    const navDashboard = document.getElementById("navDashboard");

    const vistaHome = document.getElementById("vistaHome");
    const vistaReservas = document.getElementById("vistaReservas");
    const vistaDashboard = document.getElementById("vistaDashboard");

    function cambiarVista(vistaActiva, navActivo) {
        [vistaHome, vistaReservas, vistaDashboard].forEach(v => v.classList.add("hidden"));
        [navHome, navReservas, navDashboard].forEach(n => n.classList.remove("active"));

        vistaActiva.classList.remove("hidden");
        navActivo.classList.add("active");

        if (vistaActiva === vistaDashboard) actualizarEstadisticas();
    }

    navHome.addEventListener("click", () => cambiarVista(vistaHome, navHome));
    navReservas.addEventListener("click", () => cambiarVista(vistaReservas, navReservas));
    navDashboard.addEventListener("click", () => cambiarVista(vistaDashboard, navDashboard));

    // Botones de la pantalla Home
    document.getElementById("btnGoReservas")?.addEventListener("click", () => cambiarVista(vistaReservas, navReservas));
    document.getElementById("btnGoDashboard")?.addEventListener("click", () => cambiarVista(vistaDashboard, navDashboard));
}

// OBTENER RESERVAS
async function cargarReservas() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error("Error en el servidor");
        reservasData = await res.json();
        renderizarReservas();
        actualizarEstadisticas();
    } catch (error) {
        console.error("Error al cargar reservas:", error);
    }
}

// CÁLCULO DE CAJA Y ARQUEO
function actualizarEstadisticas() {
    let totalCamping = 0, totalPicnic = 0;
    let totalEfectivo = 0, totalTransferencia = 0, totalTarjetaBruto = 0;
    let totalSemana = 0;

    const ahora = new Date();
    const inicioSemana = new Date(ahora);
    inicioSemana.setDate(ahora.getDate() - ahora.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    reservasData.forEach(r => {
        const monto = Number(r.monto_total) || 0;
        const fecha = new Date(r.fecha_ingreso);

        if (r.tipo === "Camping") totalCamping += monto;
        if (r.tipo === "Picnic") totalPicnic += monto;

        if (r.metodo_pago === "Efectivo") totalEfectivo += monto;
        if (r.metodo_pago === "Transferencia") totalTransferencia += monto;
        if (r.metodo_pago === "Tarjeta" || r.metodo_pago === "Débito") totalTarjetaBruto += monto;

        if (fecha >= inicioSemana) totalSemana += monto;
    });

    const cobroIva = totalTarjetaBruto * 0.19;
    const cobroComision = totalTarjetaBruto * COMISION_TUU_PORCENTAJE;
    const totalTarjetaNeto = Math.max(0, totalTarjetaBruto - (cobroIva + cobroComision));

    const totalCaja = totalEfectivo + totalTransferencia + totalTarjetaNeto;

    setTxt("statTotalCaja", `$${Math.round(totalCaja).toLocaleString("es-CL")}`);
    setTxt("statEfectivo", `$${totalEfectivo.toLocaleString("es-CL")}`);
    setTxt("statTransferencia", `$${totalTransferencia.toLocaleString("es-CL")}`);
    setTxt("statTarjetaBruto", `$${totalTarjetaBruto.toLocaleString("es-CL")}`);
    setTxt("statTarjetaNeto", `$${Math.round(totalTarjetaNeto).toLocaleString("es-CL")}`);
    setTxt("statCamping", `$${totalCamping.toLocaleString("es-CL")}`);
    setTxt("statPicnic", `$${totalPicnic.toLocaleString("es-CL")}`);
    setTxt("statTotalSemana", `$${totalSemana.toLocaleString("es-CL")}`);
}

function setTxt(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// FORMULARIO Y MODAL
function configurarFormulario() {
    const modalForm = document.getElementById("modalForm");
    
    document.getElementById("btnNuevaReserva")?.addEventListener("click", () => {
        idEdicionActual = null;
        document.getElementById("formReserva").reset();
        document.querySelector(".modal-title").innerText = "Registrar Nueva Reserva";
        modalForm.classList.remove("hidden");
        calcularTotal();
    });

    document.getElementById("btnCerrarModal")?.addEventListener("click", () => {
        modalForm.classList.add("hidden");
    });

    ["tipo", "adultos", "ninos", "diasEstadia"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", calcularTotal);
        document.getElementById(id)?.addEventListener("change", calcularTotal);
    });

    document.getElementById("tipo")?.addEventListener("change", (e) => {
        const inputDias = document.getElementById("diasEstadia");
        if (e.target.value === "Picnic") {
            inputDias.value = 1;
            inputDias.disabled = true;
        } else {
            inputDias.disabled = false;
        }
        calcularTotal();
    });

    document.getElementById("formReserva")?.addEventListener("submit", guardarReserva);
}

function calcularTotal() {
    const tipo = document.getElementById("tipo")?.value || "Camping";
    const adultos = Number(document.getElementById("adultos")?.value) || 0;
    const ninos = Number(document.getElementById("ninos")?.value) || 0;
    const dias = Number(document.getElementById("diasEstadia")?.value) || 1;

    let total = (adultos * TARIFAS[tipo].adulto) + (ninos * TARIFAS[tipo].nino);
    if (tipo === "Camping") total *= dias;

    const elMonto = document.getElementById("montoPagado");
    if (elMonto) elMonto.value = `$${total.toLocaleString("es-CL")}`;
}

async function guardarReserva(e) {
    e.preventDefault();

    const payload = {
        titular: document.getElementById("nombre").value,
        rut: document.getElementById("rut").value,
        patente: document.getElementById("patente").value,
        telefono_emergencia: document.getElementById("contacto").value,
        tipo: document.getElementById("tipo").value,
        adultos: Number(document.getElementById("adultos").value),
        ninos: Number(document.getElementById("ninos").value),
        mesa_sitio: document.getElementById("ubicacion").value,
        dias: Number(document.getElementById("diasEstadia").value),
        metodo_pago: document.getElementById("metodoPago").value,
        esta_al_dia: document.getElementById("estaAlDia").value === "true"
    };

    try {
        const url = idEdicionActual ? `${API_URL}/${idEdicionActual}` : API_URL;
        const method = idEdicionActual ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Fallo al guardar");

        await cargarReservas();
        document.getElementById("formReserva").reset();
        idEdicionActual = null;
        document.getElementById("modalForm").classList.add("hidden");
    } catch (err) {
        alert("Error al guardar: " + err.message);
    }
}

// RENDERIZAR VISTA RESERVAS
function renderizarReservas() {
    const contenedor = document.getElementById("listaReservas");
    if (!contenedor) return;

    contenedor.innerHTML = "";

    if (reservasData.length === 0) {
        contenedor.innerHTML = `<div style="text-align:center; color:#94a3b8; margin-top:20px;">No hay reservas registradas.</div>`;
        return;
    }

    reservasData.forEach(r => {
        const esCamping = r.tipo === "Camping";
        const totalPersonas = (r.adultos || 0) + (r.ninos || 0);

        const cardHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="guest-name">${r.titular}</div>
                        <div class="guest-subtext">RUT: ${r.rut} | Patente: <b>${r.patente || 'N/A'}</b></div>
                    </div>
                    <span class="badge ${esCamping ? 'badge-camping' : 'badge-picnic'}">${r.tipo}</span>
                </div>

                <div class="grid-info">
                    <div>📞 <b>Contacto:</b> ${r.telefono_emergencia}</div>
                    <div>👥 <b>Grupo:</b> ${totalPersonas} (${r.adultos}A / ${r.ninos}N)</div>
                    <div>📍 <b>Ubicación:</b> ${r.mesa_sitio}</div>
                    <div>💵 <b>Pagó:</b> <span class="price">$${Number(r.monto_total).toLocaleString("es-CL")}</span></div>
                    <div>📥 <b>Llegada:</b> ${formatearFecha(r.fecha_ingreso)}</div>
                    <div>⏰ <b>Check-Out:</b> <b>${formatearFecha(r.fecha_checkout)}</b></div>
                </div>

                <div class="status-container">
                    <span class="status ${r.esta_al_dia ? 'status-ok' : 'status-danger'}">${r.esta_al_dia ? '🟢 Pago al día' : '🔴 Pago Pendiente'}</span>
                    <span class="pay-badge">💳 ${r.metodo_pago || 'Efectivo'}</span>
                </div>

                ${esCamping ? `<button class="btn-renew" onclick="renovarDia(${r.id})">+ Renovar Estadía (Día Extra)</button>` : ''}

                <div class="card-actions">
                    <button class="btn-edit" onclick="abrirEditarReserva(${r.id})">✏️ Editar</button>
                    <button class="btn-delete" onclick="eliminarReserva(${r.id})">🗑️ Eliminar</button>
                </div>
            </div>
        `;
        contenedor.innerHTML += cardHTML;
    });
}

function abrirEditarReserva(id) {
    const r = reservasData.find(item => item.id === id);
    if (!r) return;

    idEdicionActual = id;
    document.querySelector(".modal-title").innerText = "Editar Reserva";

    document.getElementById("nombre").value = r.titular;
    document.getElementById("rut").value = r.rut;
    document.getElementById("patente").value = r.patente || "";
    document.getElementById("contacto").value = r.telefono_emergencia;
    document.getElementById("tipo").value = r.tipo;
    document.getElementById("adultos").value = r.adultos;
    document.getElementById("ninos").value = r.ninos;
    document.getElementById("ubicacion").value = r.mesa_sitio;
    document.getElementById("diasEstadia").value = r.dias;
    document.getElementById("metodoPago").value = r.metodo_pago || "Efectivo";
    document.getElementById("estaAlDia").value = r.esta_al_dia ? "true" : "false";

    document.getElementById("modalForm").classList.remove("hidden");
    calcularTotal();
}

async function eliminarReserva(id) {
    if (confirm("¿Eliminar este registro?")) {
        try {
            await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            await cargarReservas();
        } catch (err) {
            console.error("Error al eliminar:", err);
        }
    }
}

async function renovarDia(id) {
    try {
        await fetch(`${API_URL}/${id}/renovar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ diasExtra: 1 })
        });
        await cargarReservas();
    } catch (err) {
        console.error("Error al renovar:", err);
    }
}

function formatearFecha(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}