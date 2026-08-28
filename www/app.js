const API_URL = 'https://camping-three-ochre.vercel.app/api/reservas';
const CIERRES_URL = 'https://camping-three-ochre.vercel.app/api/cierres-caja';
const LOGS_URL = 'https://camping-three-ochre.vercel.app/api/logs';

const TARIFAS = {
    Camping: { adulto: 8000, nino: 6000 },
    Picnic:  { adulto: 7000, nino: 5000 }
};

let reservasData = [];
let idEdicionActual = null;
let filtroActual = 'Todos';

document.addEventListener("DOMContentLoaded", () => {
    configurarNavegacion();
    cargarReservas();
    cargarLogs();
    cargarCierresCaja();
    configurarFormulario();
    configurarFiltrosYBusqueda();
    configurarCajaYPDF();

    setInterval(() => {
        cargarReservas(true);
    }, 15000);
});

// NAVEGACIÓN
function configurarNavegacion() {
    const navHome = document.getElementById("navHome");
    const navReservas = document.getElementById("navReservas");
    const navDashboard = document.getElementById("navDashboard");
    const navLogs = document.getElementById("navLogs");

    const vistaHome = document.getElementById("vistaHome");
    const vistaReservas = document.getElementById("vistaReservas");
    const vistaDashboard = document.getElementById("vistaDashboard");
    const vistaLogs = document.getElementById("vistaLogs");

    function cambiarVista(vistaActiva, navActivo) {
        [vistaHome, vistaReservas, vistaDashboard, vistaLogs].forEach(v => v?.classList.add("hidden"));
        [navHome, navReservas, navDashboard, navLogs].forEach(n => n?.classList.remove("active"));

        vistaActiva?.classList.remove("hidden");
        navActivo?.classList.add("active");

        if (vistaActiva === vistaDashboard) {
            actualizarEstadisticas();
            cargarCierresCaja();
        }
        if (vistaActiva === vistaLogs) cargarLogs();
    }

    navHome?.addEventListener("click", () => cambiarVista(vistaHome, navHome));
    navReservas?.addEventListener("click", () => cambiarVista(vistaReservas, navReservas));
    navDashboard?.addEventListener("click", () => cambiarVista(vistaDashboard, navDashboard));
    navLogs?.addEventListener("click", () => cambiarVista(vistaLogs, navLogs));

    document.getElementById("btnGoReservas")?.addEventListener("click", () => cambiarVista(vistaReservas, navReservas));
    document.getElementById("btnGoDashboard")?.addEventListener("click", () => cambiarVista(vistaDashboard, navDashboard));
    document.getElementById("btnRefresh")?.addEventListener("click", () => cargarReservas());
    document.getElementById("btnRefreshLogs")?.addEventListener("click", () => cargarLogs());
}

// OBTENER RESERVAS
async function cargarReservas(silencioso = false) {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error("Error en el servidor");
        const data = await res.json();
        
        reservasData = Array.isArray(data) ? data : [];
        renderizarReservas();
        actualizarEstadisticas();
    } catch (error) {
        if (!silencioso) console.error("Error al cargar reservas:", error);
    }
}

// FILTROS Y BÚSQUEDA
function configurarFiltrosYBusqueda() {
    const inputBusqueda = document.getElementById("inputBusqueda");
    const btnsFilter = document.querySelectorAll(".btn-filter");

    inputBusqueda?.addEventListener("input", renderizarReservas);

    btnsFilter.forEach(btn => {
        btn.addEventListener("click", (e) => {
            btnsFilter.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            filtroActual = e.target.dataset.filter;
            renderizarReservas();
        });
    });
}

// CÁLCULO DE DASHBOARD
function actualizarEstadisticas() {
    let totalCamping = 0, totalPicnic = 0;
    let totalEfectivo = 0, totalTransferencia = 0, totalTarjetaBruto = 0;
    let totalSemana = 0;

    const ahora = new Date();
    const inicioSemana = new Date(ahora);
    inicioSemana.setDate(ahora.getDate() - ahora.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    if (Array.isArray(reservasData)) {
        reservasData.forEach(r => {
            const monto = Number(r.monto_total) || 0;
            const fecha = new Date(r.fecha_ingreso || r.created_at || Date.now());

            if (r.tipo === "Camping") totalCamping += monto;
            if (r.tipo === "Picnic") totalPicnic += monto;

            if (r.metodo_pago === "Efectivo") totalEfectivo += monto;
            if (r.metodo_pago === "Transferencia") totalTransferencia += monto;
            if (r.metodo_pago === "Tarjeta" || r.metodo_pago === "Débito") totalTarjetaBruto += monto;

            if (fecha >= inicioSemana) totalSemana += monto;
        });
    }

    const totalCaja = totalEfectivo + totalTransferencia + totalTarjetaBruto;

    setTxt("statTotalCaja", `$${totalCaja.toLocaleString("es-CL")}`);
    setTxt("statEfectivo", `$${totalEfectivo.toLocaleString("es-CL")}`);
    setTxt("statTransferencia", `$${totalTransferencia.toLocaleString("es-CL")}`);
    setTxt("statTarjetaBruto", `$${totalTarjetaBruto.toLocaleString("es-CL")}`);
    setTxt("statCamping", `$${totalCamping.toLocaleString("es-CL")}`);
    setTxt("statPicnic", `$${totalPicnic.toLocaleString("es-CL")}`);
    setTxt("statTotalSemana", `$${totalSemana.toLocaleString("es-CL")}`);
}

function setTxt(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// FORMULARIO DE RESERVAS
function configurarFormulario() {
    const modalForm = document.getElementById("modalForm");
    
    document.getElementById("btnNuevaReserva")?.addEventListener("click", () => {
        idEdicionActual = null;
        document.getElementById("formReserva")?.reset();
        const tituloModal = document.querySelector(".modal-title");
        if (tituloModal) tituloModal.innerText = "Registrar Nueva Reserva";
        modalForm?.classList.remove("hidden");
        calcularTotal();
    });

    document.getElementById("btnCerrarModal")?.addEventListener("click", () => {
        modalForm?.classList.add("hidden");
        document.getElementById("formReserva")?.reset();
        idEdicionActual = null;
    });

    ["tipo", "adultos", "ninos", "diasEstadia"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", calcularTotal);
        document.getElementById(id)?.addEventListener("change", calcularTotal);
    });

    document.getElementById("tipo")?.addEventListener("change", (e) => {
        const inputDias = document.getElementById("diasEstadia");
        if (inputDias) {
            if (e.target.value === "Picnic") {
                inputDias.value = 1;
                inputDias.disabled = true;
            } else {
                inputDias.disabled = false;
            }
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

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        submitBtn.innerText = "Guardando...";
    }

    const payload = {
        usuario: document.getElementById("usuarioForm")?.value || "Maxi",
        titular: document.getElementById("nombre")?.value || "",
        rut: document.getElementById("rut")?.value || "",
        patente: document.getElementById("patente")?.value || "",
        telefono_emergencia: document.getElementById("contacto")?.value || "",
        tipo: document.getElementById("tipo")?.value || "Camping",
        adultos: parseInt(document.getElementById("adultos")?.value || 1, 10),
        ninos: parseInt(document.getElementById("ninos")?.value || 0, 10),
        mesa_sitio: document.getElementById("ubicacion")?.value || "",
        dias: parseInt(document.getElementById("diasEstadia")?.value || 1, 10),
        metodo_pago: document.getElementById("metodoPago")?.value || "Efectivo",
        esta_al_dia: document.getElementById("estaAlDia")?.value === "true"
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
        document.getElementById("formReserva")?.reset();
        idEdicionActual = null;
        document.getElementById("modalForm")?.classList.add("hidden");
    } catch (err) {
        alert("Error al guardar: " + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "Guardar Registro";
        }
    }
}

// RENDERIZAR RESERVAS MOSTRANDO PORTERO RESPONSABLE
function renderizarReservas() {
    const contenedor = document.getElementById("listaReservas");
    if (!contenedor) return;

    contenedor.innerHTML = "";

    const textoBusqueda = document.getElementById("inputBusqueda")?.value.toLowerCase() || "";

    if (!Array.isArray(reservasData)) {
        contenedor.innerHTML = `<div style="text-align:center; color:#94a3b8; margin-top:20px;">No hay registros cargados.</div>`;
        return;
    }

    const reservasFiltradas = reservasData.filter(r => {
        const coincideFiltro = filtroActual === 'Todos' || r.tipo === filtroActual;
        const coincideTexto = r.titular?.toLowerCase().includes(textoBusqueda) ||
                              r.rut?.toLowerCase().includes(textoBusqueda) ||
                              r.patente?.toLowerCase().includes(textoBusqueda);
        return coincideFiltro && coincideTexto;
    });

    if (reservasFiltradas.length === 0) {
        contenedor.innerHTML = `<div style="text-align:center; color:#94a3b8; margin-top:20px;">No hay registros coincidentes.</div>`;
        return;
    }

    reservasFiltradas.forEach(r => {
        const esCamping = r.tipo === "Camping";
        const numAdultos = Number(r.adultos) || 1;
        const numNinos = Number(r.ninos) || 0;
        const totalPersonas = numAdultos + numNinos;

        const cardHTML = `
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="guest-name">${r.titular}</div>
                        <div class="guest-subtext">RUT: ${r.rut || 'N/A'} | Patente: <b>${r.patente || 'Sin Vehículo'}</b></div>
                        <div class="guest-subtext" style="color: #00f2fe; margin-top: 3px;">👮 Ingresado por: <b>${r.usuario || 'Portería'}</b></div>
                    </div>
                    <span class="badge ${esCamping ? 'badge-camping' : 'badge-picnic'}">${r.tipo}</span>
                </div>

                <div class="grid-info">
                    <div>📞 <b>Contacto:</b> ${r.telefono_emergencia || 'N/A'}</div>
                    <div>👥 <b>Grupo:</b> ${totalPersonas} (${numAdultos}A / ${numNinos}N)</div>
                    <div>📍 <b>Ubicación:</b> ${r.mesa_sitio}</div>
                    <div>💵 <b>Pagó:</b> <span class="price">$${Number(r.monto_total || 0).toLocaleString("es-CL")}</span></div>
                    <div>📥 <b>Llegada:</b> ${formatearFecha(r.fecha_ingreso || r.created_at)}</div>
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
    const tituloModal = document.querySelector(".modal-title");
    if (tituloModal) tituloModal.innerText = "Editar Reserva";

    document.getElementById("nombre").value = r.titular || "";
    document.getElementById("rut").value = r.rut || "";
    document.getElementById("patente").value = r.patente || "";
    document.getElementById("contacto").value = r.telefono_emergencia || "";
    document.getElementById("tipo").value = r.tipo || "Camping";
    document.getElementById("adultos").value = Number(r.adultos) || 1;
    document.getElementById("ninos").value = Number(r.ninos) || 0;
    document.getElementById("ubicacion").value = r.mesa_sitio || "";
    document.getElementById("diasEstadia").value = Number(r.dias) || 1;
    document.getElementById("metodoPago").value = r.metodo_pago || "Efectivo";
    document.getElementById("estaAlDia").value = r.esta_al_dia ? "true" : "false";

    document.getElementById("modalForm")?.classList.remove("hidden");
    calcularTotal();
}

async function eliminarReserva(id) {
    if (confirm("¿Eliminar este registro?")) {
        try {
            const usuario = prompt("Introduce tu nombre para la auditoría (Maxi / Génesis):", "Maxi") || "Staff";
            await fetch(`${API_URL}/${id}?usuario=${encodeURIComponent(usuario)}`, { method: 'DELETE' });
            await cargarReservas();
        } catch (err) {
            console.error("Error al eliminar:", err);
        }
    }
}

async function renovarDia(id) {
    try {
        const usuario = prompt("Introduce tu nombre para renovar (Maxi / Génesis):", "Maxi") || "Staff";
        await fetch(`${API_URL}/${id}/renovar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ diasExtra: 1, usuario })
        });
        await cargarReservas();
    } catch (err) {
        console.error("Error al renovar:", err);
    }
}

// LOGS DETALLADOS CON AUDITORÍA "ANTES VS DESPUÉS"
async function cargarLogs() {
    try {
        const res = await fetch(LOGS_URL);
        if (!res.ok) return;
        const logs = await res.json();
        const contenedor = document.getElementById("contenedorLogs");
        if (!contenedor || !Array.isArray(logs)) return;

        contenedor.innerHTML = "";
        logs.forEach(log => {
            const esAlerta = log.accion.includes('ELIMINAD') || log.accion.includes('EDICIÓ') || log.accion.includes('ELIMINACIÓ');
            contenedor.innerHTML += `
                <div class="log-card" style="border-left: 4px solid ${esAlerta ? '#ff1744' : '#00f2fe'}; margin-bottom: 10px; padding: 12px; background: rgba(15, 23, 42, 0.6); border-radius: 12px;">
                    <div class="log-header" style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: ${esAlerta ? '#ff5252' : '#00f2fe'};">
                        <span>${log.accion || 'ACCION'}</span>
                        <span>👤 ${log.usuario || 'Staff'}</span>
                    </div>
                    <div class="log-body" style="white-space: pre-line; font-family: monospace; font-size: 11px; margin-top: 6px; color: #f1f5f9; line-height: 1.4;">${log.detalle || ''}</div>
                    <div class="log-date" style="font-size: 10px; color: #64748b; margin-top: 6px; text-align: right;">${formatearFecha(log.fecha)}</div>
                </div>
            `;
        });
    } catch (e) {
        console.warn("Logs no disponibles por el momento.");
    }
}

// ENTREGAS DE CAJA Y EXPORTACIÓN
function configurarCajaYPDF() {
    const modalCaja = document.getElementById("modalCaja");
    
    document.getElementById("btnAbrirModalCaja")?.addEventListener("click", () => {
        modalCaja?.classList.remove("hidden");
    });

    document.getElementById("btnCerrarModalCaja")?.addEventListener("click", () => {
        modalCaja?.classList.add("hidden");
    });

    document.getElementById("formCierreCaja")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const portero = document.getElementById("cajaPortero")?.value || "Maxi";
        const dueno = document.getElementById("cajaDueno")?.value || "Olga";
        const monto = document.getElementById("cajaMonto")?.value || 0;
        const observaciones = document.getElementById("cajaObs")?.value || "";

        try {
            const res = await fetch(CIERRES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portero, dueno, monto, observaciones })
            });
            
            if (!res.ok) throw new Error("Asegúrate de haber desplegado la versión del backend en Vercel.");

            modalCaja?.classList.add("hidden");
            document.getElementById("formCierreCaja")?.reset();
            await cargarCierresCaja();
            alert("Entrega de caja guardada con éxito.");
        } catch (err) {
            alert("Error registrando entrega: " + err.message);
        }
    });

    document.getElementById("btnExportarPDF")?.addEventListener("click", exportarPDF);
}

async function cargarCierresCaja() {
    try {
        const res = await fetch(CIERRES_URL);
        if (!res.ok) return;
        const cierres = await res.json();
        const contenedor = document.getElementById("historialCierres");
        if (!contenedor || !Array.isArray(cierres)) return;

        contenedor.innerHTML = "<b>Últimas Entregas:</b>";
        cierres.slice(0, 5).forEach(c => {
            contenedor.innerHTML += `
                <div class="cierre-item">
                    💰 <b>$${Number(c.monto || 0).toLocaleString("es-CL")}</b> de <b>${c.portero || ''}</b> a <b>${c.dueno || ''}</b>
                    <br><small>${formatearFecha(c.fecha)} ${c.observaciones ? '- ' + c.observaciones : ''}</small>
                </div>
            `;
        });
    } catch (e) {
        console.warn("Cierres de caja no disponibles por el momento.");
    }
}

// GUARDADO DIRECTO NATIVO DE PDF
async function exportarPDF() {
    try {
        if (!window.jspdf) {
            alert("El módulo PDF se está inicializando. Reintenta en 3 segundos.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text("Camping Los Maitenes - Reporte de Arqueo", 14, 20);
        doc.setFontSize(10);
        doc.text(`Fecha de emisión: ${new Date().toLocaleString("es-CL")}`, 14, 28);

        const tablaReservas = (Array.isArray(reservasData) ? reservasData : []).map(r => [
            r.titular || '',
            r.tipo || '',
            r.mesa_sitio || '',
            r.metodo_pago || '',
            `$${Number(r.monto_total || 0).toLocaleString("es-CL")}`
        ]);

        if (typeof doc.autoTable === 'function') {
            doc.autoTable({
                startY: 35,
                head: [['Titular', 'Servicio', 'Ubicación', 'Método Pago', 'Monto']],
                body: tablaReservas,
            });
        }

        const fileName = `Arqueo_LosMaitenes_${new Date().toISOString().slice(0, 10)}.pdf`;
        const pdfBase64 = doc.output('datauristring').split(',')[1];

        const Filesystem = window.Capacitor?.Plugins?.Filesystem;

        if (Filesystem) {
            await Filesystem.writeFile({
                path: fileName,
                data: pdfBase64,
                directory: 'DOCUMENTS',
                recursive: true
            });
            alert(`✅ PDF descargado exitosamente en tu teléfono:\n${fileName}`);
        } else {
            doc.save(fileName);
        }

    } catch (error) {
        alert("Error al descargar el PDF nativo: " + error.message);
    }
}

function formatearFecha(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "-";
    return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}