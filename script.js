/* =========================================================
   K STREAMING — WEB DASHBOARD
   Full Firestore CRUD — adapted for web dashboard layout
   ========================================================= */

// ── Firebase Config ──
const firebaseConfig = {
    apiKey: "AIzaSyA_txdgtjbkXrgSuliNZY-6TcX6R3U3trE",
    authDomain: "dbclientes-ab21a.firebaseapp.com",
    projectId: "dbclientes-ab21a",
    storageBucket: "dbclientes-ab21a.firebasestorage.app",
    messagingSenderId: "12970129656",
    appId: "1:12970129656:web:b9bc9caef3c60027d5e30d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ── State ──
let currentScreen = 'list';
let currentProfileNumber = '';
let optionsTargetNumber = '';
let editDocId = '';
let editState = {};
let allClientsCache = [];
let botFilterActive = false;
let currentNavFilter = 'todos';
let activeServiceFilter = '';
let currentSort = 'days'; // 'days', 'email'
let sortDirection = 'asc';
let sentStatusMap = JSON.parse(localStorage.getItem('sent_status') || '{}');

// ESTADO: Usa Firestore (campo estado_timestamp) para sincronizar con la app Flutter.
// Así el estado es compartido en tiempo real entre web y app.
async function toggleSentStatus(docId, currentIsGreen) {
    try {
        if (currentIsGreen) {
            await db.collection('clientes').doc(docId).update({
                estado_timestamp: firebase.firestore.FieldValue.delete()
            });
        } else {
            await db.collection('clientes').doc(docId).update({
                estado_timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (e) {
        console.error('Error al actualizar estado:', e);
        toast('Error al actualizar el estado');
    }
}

function isEstadoActivo(estadoTimestamp) {
    if (!estadoTimestamp) return false;
    const ts = estadoTimestamp.toDate ? estadoTimestamp.toDate() : new Date(estadoTimestamp);
    return (Date.now() - ts.getTime()) < 24 * 60 * 60 * 1000;
}

const servicios = ['Netflix', 'Disney+', 'HBO Max', 'Prime Video', 'Paramount', 'ChatGPT', 'Movistar Play', 'Crunchyroll', 'Otros'];

const profitRates = {
    'Netflix': 10,
    'Disney+': 10,
    'HBO Max': 8,
    'Prime Video': 7,
    'Paramount': 6,
    'ChatGPT': 13,
    'Movistar Play': 20,
    'Crunchyroll': 6,
    'Otros': 5
};

let profitChart = null;

// ── DOM shortcuts ──
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function showScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $((`screen-${name}`)).classList.add('active');
    currentScreen = name;

    // Update nav active state
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    if (name === 'list') {
        if (currentNavFilter === 'all') $('nav-clientes').classList.add('active');
        else if (currentNavFilter === 'vencidos') $('nav-vencidos').classList.add('active');
    }
    if (name === 'form') $('nav-nuevo').classList.add('active');

    // Close mobile sidebar
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.add('hidden');
}

// Sidebar nav clicks
$('nav-clientes').addEventListener('click', () => {
    currentNavFilter = 'all';
    showScreen('list');
    renderProfiles();
});

$('nav-vencidos').addEventListener('click', () => {
    currentNavFilter = 'vencidos';
    // Clear service filter when clicking Vencidos
    activeServiceFilter = '';
    $('dropdown-selected').textContent = 'Filtrar por Servicio';
    $$('.dropdown-item').forEach(i => i.classList.remove('active'));
    $$('.dropdown-item[data-val=""]').forEach(i => i.classList.add('active'));

    showScreen('list');
    renderProfiles();
});

if ($('card-por-vencer')) {
    $('card-por-vencer').addEventListener('click', () => {
        currentNavFilter = 'por_vencer';
        activeServiceFilter = '';
        if ($('dropdown-selected')) $('dropdown-selected').textContent = 'Filtrar por Servicio';
        $$('.dropdown-item').forEach(i => i.classList.remove('active'));
        $$('.dropdown-item[data-val=""]').forEach(i => i.classList.add('active'));
        $$('.nav-item').forEach(n => n.classList.remove('active')); // Clear nav selection
        
        showScreen('list');
        renderProfiles();
    });
}

$('nav-stats').addEventListener('click', () => {
    showScreen('stats');
    renderStats();
});
$('nav-nuevo').addEventListener('click', () => { currentProfileNumber = ''; openForm(null); });
$('btn-new-top').addEventListener('click', () => { currentProfileNumber = ''; openForm(null); });

// Mobile menu
$('menu-toggle').addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
    $('sidebar-overlay').classList.toggle('hidden');
});
$('sidebar-overlay').addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.add('hidden');
});

// Keyboard shortcut
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (currentScreen === 'list') $('search-profiles').focus();
    }
});

// ═══════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════
function parseFecha(val) {
    if (!val) return null;
    if (val.toDate) return val.toDate();
    if (typeof val === 'string') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

function formatDate(d) {
    if (!d) return 'N/A';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function toISODate(d) {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function phoneFormat(raw) {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('51') && digits.length > 2) digits = digits.substring(2);
    let out = '+51';
    if (digits.length > 0) {
        out += ' ';
        for (let i = 0; i < digits.length && out.length < 15; i++) {
            if (i > 0 && i % 3 === 0) out += ' ';
            out += digits[i];
        }
    }
    return out;
}

function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function toast(msg) {
    const t = $('toast');
    $('toast-text').textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), 3500);
}

async function copyToClipboard(text, label) {
    try {
        await navigator.clipboard.writeText(text);
        toast(`${label} copiado al portapapeles`);
    } catch (err) {
        console.error('Error al copiar:', err);
        toast('Error al copiar al portapapeles');
    }
}

function toggleSort(type) {
    // Si ya está ordenado por este tipo, regresa al orden por defecto (días)
    if (currentSort === type) {
        currentSort = 'days';
    } else {
        currentSort = type;
    }
    
    // Actualizar iconos
    const emailIcon = $('sort-icon-email');
    if (emailIcon) {
        if (currentSort === 'email') {
            emailIcon.innerText = 'expand_more'; // Indica que el agrupamiento por correo está activo
            emailIcon.style.color = 'var(--primary)';
        } else {
            emailIcon.innerText = 'unfold_more';
            emailIcon.style.color = 'var(--text-muted)';
        }
    }
    
    renderProfiles();
}

function getServiceColor(servicio) {
    const s = (servicio || '').toLowerCase();
    if (s.includes('netflix')) return '#F87171';
    if (s.includes('disney')) return '#38BDF8';
    if (s.includes('hbo') || s.includes('max')) return '#A78BFA';
    if (s.includes('prime')) return '#0EA5E9';
    if (s.includes('paramount')) return '#60A5FA';
    if (s.includes('chatgpt')) return '#10A37F';
    if (s.includes('movistar')) return '#019DF4';
    if (s.includes('crunchyroll')) return '#F47521';
    return '#94A3B8';
}

const emailPalette = [];
for (let i = 0; i < 100; i++) {
    const hue = (i * 137.5) % 360; // Use golden angle for better distribution
    emailPalette.push({
        bg: `hsla(${hue}, 75%, 70%, 0.15)`,
        border: `hsl(${hue}, 75%, 70%)`
    });
}

function getEmailColor(email, isExpired) {
    if (isExpired || currentNavFilter === 'vencidos' || !email || email === 'N/A') return 'transparent';
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
        hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash % 100);
    return emailPalette[idx].bg;
}

function getEmailBorderColor(email, isExpired) {
    if (isExpired || currentNavFilter === 'vencidos' || !email || email === 'N/A') return 'transparent';
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
        hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash % 100);
    return emailPalette[idx].border;
}

function getDaysInfo(fechaOrden) {
    const fC = parseFecha(fechaOrden);
    const fCStr = formatDate(fC);
    const fV = fC ? new Date(fC.getTime() + 31 * 24 * 60 * 60 * 1000) : null;
    const fVStr = formatDate(fV);
    const diff = fV ? (fV.getTime() - Date.now()) : 0;
    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Expired accounts (dias < 0) are always red
    const isExpired = dias < 0;
    const colorClass = dias >= 3 ? 'days-green' : (dias === 2 ? 'days-yellow' : 'days-red');
    const colorHex = dias >= 3 ? '#4ADE80' : (dias === 2 ? '#FBBF24' : '#F87171');
    const badgeClass = dias >= 3 ? 'green' : (dias === 2 ? 'yellow' : 'red');

    return { fC, fCStr, fV, fVStr, dias, diasRaw: dias, colorClass, colorHex, badgeClass, isExpired };
}

// ═══════════════════════════════════════════════
// SCREEN 1: PROFILE LIST
// ═══════════════════════════════════════════════
let unsubProfiles = null;
let unsubClients = null;
let unsubGastos = null;
let profilesData = [];
let clientsData = [];
let gastosData = [];

function initProfileList() {
    unsubProfiles = db.collection('perfiles').orderBy('ultima_actividad', 'desc').onSnapshot(snap => {
        profilesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderProfiles();
    }, err => {
        console.error("Error al cargar perfiles:", err);
        toast("Error de permisos: Verifica los dominios en Firebase.");
        $('profiles-grid').innerHTML = `<div class="empty-state"><span class="material-icons-round" style="color:var(--danger)">error</span><p>Error de conexión</p><small>Asegúrate de agregar tu dominio de GitHub a los dominios autorizados en Firebase Authentication.</small></div>`;
    });

    unsubClients = db.collection('clientes').onSnapshot(snap => {
        clientsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allClientsCache = clientsData;
        updateStats();
        renderProfiles();
    }, err => {
        console.error("Error al cargar clientes:", err);
    });

    unsubGastos = db.collection('gastos').onSnapshot(snap => {
        gastosData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateStats();
        if (typeof renderGastosHistory === 'function') renderGastosHistory();
    }, err => {
        console.error("Error al cargar gastos:", err);
    });

    $('search-profiles').addEventListener('input', () => renderProfiles());
}

function updateStats() {
    const totalProfiles = new Set([
        ...profilesData.map(p => p.numero),
        ...clientsData.map(c => c.numero_cliente)
    ].filter(Boolean)).size;

    let expiring = 0;
    clientsData.forEach(c => {
        const { diasRaw } = getDaysInfo(c.fecha_orden);
        if (diasRaw >= 0 && diasRaw <= 2) expiring++;
    });

    $('stat-total').textContent = totalProfiles;
    $('stat-expiring').textContent = expiring;
    if ($('stat-cuentas')) $('stat-cuentas').textContent = clientsData.length;
    $('mobile-stat-total').textContent = totalProfiles;

    if (currentScreen === 'stats') renderStats();
}

function renderStats() {
    const statsData = {};
    servicios.forEach(s => statsData[s] = { count: 0, profit: 0 });

    const statsFilter = window.currentStatsFilter || 'all';
    const clientMap = {};
    let totalSalesFiltered = 0;

    clientsData.forEach(c => {
        if (statsFilter === 'active') {
            const { diasRaw } = getDaysInfo(c.fecha_orden);
            if (diasRaw < 0) return; // Skip expired
        }

        const s = c.tipo_cuenta;
        const rate = c.precio !== undefined ? parseFloat(c.precio) : (profitRates[s] || 0);
        const profit = isNaN(rate) ? 0 : rate;

        if (statsData[s] !== undefined) {
            statsData[s].count++;
            statsData[s].profit += profit;
        }

        totalSalesFiltered++;

        const num = c.numero_cliente || 'Desconocido';
        if (!clientMap[num]) clientMap[num] = { count: 0, profit: 0 };
        clientMap[num].count++;
        clientMap[num].profit += profit;
    });

    let totalProfit = 0;
    const labels = [];
    const dataValues = [];
    const backgroundColors = [];
    let topService = { name: '—', count: 0 };

    let listHtml = '';

    servicios.forEach(s => {
        const count = statsData[s].count;
        const profit = statsData[s].profit;
        totalProfit += profit;

        if (count > 0) {
            labels.push(s);
            dataValues.push(count);
            backgroundColors.push(getServiceColor(s));
            if (count > topService.count) topService = { name: s, count };
        }

        listHtml += `
            <div class="profit-item">
                <div class="profit-service-icon" style="background: ${getServiceColor(s)}">
                    ${s.charAt(0)}
                </div>
                <div class="profit-details">
                    <span class="profit-service-name">${s}</span>
                    <span class="profit-count">${count} ventas</span>
                </div>
                <div class="profit-amount">S/ ${profit.toFixed(2)}</div>
            </div>
        `;
    });

    let totalGastos = 0;
    gastosData.forEach(g => {
        totalGastos += parseFloat(g.monto) || 0;
    });

    const netProfit = totalProfit - totalGastos;

    if ($('stats-total-profit')) $('stats-total-profit').textContent = `S/ ${netProfit.toFixed(2)}`;
    if ($('stats-total-gastos')) $('stats-total-gastos').textContent = `S/ ${totalGastos.toFixed(2)}`;
    if ($('stats-top-service')) $('stats-top-service').textContent = topService.name;
    if ($('stats-total-sales')) $('stats-total-sales').textContent = totalSalesFiltered;
    if ($('stats-profit-list')) $('stats-profit-list').innerHTML = listHtml;

    // Render Top Clients
    const sortedClients = Object.entries(clientMap)
        .map(([num, data]) => ({ num, ...data }))
        .sort((a, b) => b.profit - a.profit);

    const tbodyClients = $('stats-top-clients-body');
    if (tbodyClients) {
        if (sortedClients.length === 0) {
            tbodyClients.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 24px; color: var(--text-dim);">No hay clientes</td></tr>`;
        } else {
            tbodyClients.innerHTML = sortedClients.map(client => `
                <tr onclick="openClientDetail('${client.num}')" style="cursor: pointer; transition: background 0.2s;" class="table-row-hover">
                    <td style="font-weight: bold; color: var(--primary);">${client.num}</td>
                    <td>${client.count} cuenta${client.count !== 1 ? 's' : ''}</td>
                    <td style="font-weight: bold; color: #4ADE80;">S/ ${client.profit.toFixed(2)}</td>
                </tr>
            `).join('');
        }
    }

    // Render Chart
    const chartEl = $('profitChart');
    if (!chartEl) return;
    const ctx = chartEl.getContext('2d');
    if (profitChart) profitChart.destroy();

    profitChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: backgroundColors,
                borderColor: '#111a33',
                borderWidth: 2,
                hoverOffset: 25
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#E2E8F0',
                        padding: 24,
                        usePointStyle: true,
                        font: { size: 12, weight: '600', family: 'Inter' }
                    }
                },
                tooltip: {
                    backgroundColor: '#111a33',
                    titleColor: '#fff',
                    bodyColor: '#E2E8F0',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 10,
                    displayColors: true,
                    callbacks: {
                        label: function (context) {
                            const val = context.raw;
                            const percentage = totalSalesFiltered > 0 ? ((val / totalSalesFiltered) * 100).toFixed(1) : 0;
                            return ` ${context.label}: ${val} ventas (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateScale: true,
                animateRotate: true,
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

function renderProfiles() {
    const grid = $('profiles-grid');
    const tableContainer = $('service-table-container');
    const tbody = $('service-table-body');
    const thead = tableContainer ? tableContainer.querySelector('thead tr') : null;
    const filter = ($('search-profiles').value || '').toLowerCase();

    const clientNums = new Set(clientsData.map(c => c.numero_cliente).filter(Boolean));
    const profileNums = new Set(profilesData.map(p => p.numero).filter(Boolean));
    let allNumbers = [...new Set([...clientNums, ...profileNums])];

    // Sort by profile activity
    const profileOrder = profilesData.map(p => p.numero);
    allNumbers.sort((a, b) => {
        const ia = profileOrder.indexOf(a); const ib = profileOrder.indexOf(b);
        return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
    });

    if (filter) {
        allNumbers = allNumbers.filter(num => {
            const cleanNum = num.replace(/\D/g, '').replace(/^51/, '');
            const cleanFilter = filter.replace(/\D/g, '').replace(/^51/, '');
            
            // Check if phone number starts with filter
            if (cleanFilter && cleanNum.startsWith(cleanFilter)) return true;
            if (num.toLowerCase().startsWith(filter)) return true;
            
            // Check if any associated account (email or service) starts with filter
            if (clientsData.some(c => c.numero_cliente === num && (
                (c.correo || '').toLowerCase().startsWith(filter) || 
                (c.tipo_cuenta || '').toLowerCase().startsWith(filter)
            ))) return true;
            
            return false;
        });
    }

    if (currentNavFilter === 'vencidos') {
        allNumbers = allNumbers.filter(num => {
            const clientAccounts = clientsData.filter(c => c.numero_cliente === num);
            return clientAccounts.some(c => {
                const { dias } = getDaysInfo(c.fecha_orden);
                return dias < 0;
            });
        });
    }

    // TABLE VIEW MODE (Active Service, Bot Mode, or Vencidos Tab)
    if (activeServiceFilter || botFilterActive || currentNavFilter === 'vencidos') {
        grid.classList.add('hidden');
        if (tableContainer) tableContainer.classList.remove('hidden');

        // Show template button only in Vencidos
        if ($('btn-edit-template-vencidos')) {
            if (currentNavFilter === 'vencidos') $('btn-edit-template-vencidos').classList.remove('hidden');
            else $('btn-edit-template-vencidos').classList.add('hidden');
        }

        // Update Headers dynamically (Unified Structure)
        if (thead) {
            thead.innerHTML = `
                <th>Teléfono</th>
                <th>SERVICIO</th>
                <th onclick="toggleSort('email')" style="cursor: pointer; user-select: none;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        CORREO 
                        <span class="material-icons-round" id="sort-icon-email" style="font-size: 16px; color: var(--text-muted);">unfold_more</span>
                    </div>
                </th>
                <th>CONTRASEÑA</th>
                <th>Días</th>
                <th style="text-align: center;">Estado</th>
                <th style="text-align: center;">Acción</th>
            `;
        }

        let filteredAccounts = [];
        allNumbers.forEach(num => {
            let accounts = clientsData.filter(c => c.numero_cliente === num);

            // Filter by search string if present (match by initial letter)
            if (filter) {
                accounts = accounts.filter(acc => 
                    (acc.numero_cliente || '').toLowerCase().startsWith(filter) ||
                    (acc.correo || '').toLowerCase().startsWith(filter) ||
                    (acc.tipo_cuenta || '').toLowerCase().startsWith(filter)
                );
            }

            // Filter by Service if selected
            if (activeServiceFilter) {
                accounts = accounts.filter(c => c.tipo_cuenta === activeServiceFilter);
            }

            // Filter by Status based on Tab
            accounts = accounts.filter(acc => {
                const { dias } = getDaysInfo(acc.fecha_orden);
                // In Bot mode or Search we might show all, but user wants Vencidos only in Vencidos tab
                if (currentNavFilter === 'vencidos') return dias < 0;
                if (currentNavFilter === 'por_vencer') return dias >= 0 && dias <= 2;
                return dias >= 0;
            });

            filteredAccounts.push(...accounts);
        });

        // Apply Sorting
        if (currentSort === 'email') {
            // Group by email: Find the first occurrence of each email and pull all its duplicates together
            const grouped = [];
            const seenEmails = new Set();
            
            // First, sort by days to have a base order
            const baseList = [...filteredAccounts].sort((a, b) => {
                const da = getDaysInfo(a.fecha_orden).diasRaw;
                const db = getDaysInfo(b.fecha_orden).diasRaw;
                return da - db;
            });

            baseList.forEach(acc => {
                const email = (acc.correo || 'N/A').toLowerCase();
                if (!seenEmails.has(email)) {
                    // Pull all accounts with this email
                    const sameEmail = baseList.filter(a => (a.correo || 'N/A').toLowerCase() === email);
                    grouped.push(...sameEmail);
                    seenEmails.add(email);
                }
            });
            filteredAccounts = grouped;
        } else {
            // Default sort by days remaining
            filteredAccounts.sort((a, b) => {
                const da = getDaysInfo(a.fecha_orden).diasRaw;
                const db = getDaysInfo(b.fecha_orden).diasRaw;
                return da - db;
            });
        }

        if (filteredAccounts.length === 0) {
            const label = activeServiceFilter ? `cuentas de ${activeServiceFilter}` : 'cuentas';
            const statusLabel = currentNavFilter === 'vencidos' ? 'vencidas' : 'vigentes';
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">No se encontraron ${label} ${statusLabel}</td></tr>`;
        } else {
            if (tbody) tbody.innerHTML = filteredAccounts.map((acc, idx) => {
                const { dias, badgeClass } = getDaysInfo(acc.fecha_orden);
                const serviceColor = getServiceColor(acc.tipo_cuenta);
                const daysBadge = `<span class="profile-badge ${badgeClass}">${dias}d</span>`;

                const isMaster = (acc.usuario || '').trim().toLowerCase() === 'master';
                const masterCheck = isMaster ? `<span class="material-icons-round" style="font-size: 15px; margin-left: 6px; color: #4ADE80;" title="Cuenta Master">check_circle</span>` : '';

                return `
                <tr style="animation-delay: ${idx * 0.05}s; cursor: pointer;" onclick="openClientDetail('${escapeHtml(acc.numero_cliente)}')">
                    <td style="font-weight: 600;">${escapeHtml(acc.numero_cliente)}</td>
                    <td style="color: ${serviceColor}; font-weight: 800; text-shadow: 0 0 10px ${serviceColor}44;">
                        <div style="display: flex; align-items: center;">
                            ${escapeHtml(acc.tipo_cuenta)}
                            ${masterCheck}
                        </div>
                    </td>
                    <td>
                        <div class="copyable-cell">
                            ${acc.correo ? `<button class="btn-copy-small" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(acc.correo)}', 'Correo')"><span class="material-icons-round">content_copy</span></button>` : ''}
                            <span class="truncate email-tag" style="background: ${getEmailColor(acc.correo, getDaysInfo(acc.fecha_orden).isExpired)}; color: ${getDaysInfo(acc.fecha_orden).isExpired || currentNavFilter === 'vencidos' ? 'var(--text)' : getEmailBorderColor(acc.correo, getDaysInfo(acc.fecha_orden).isExpired)}; border: 1px solid ${getEmailBorderColor(acc.correo, getDaysInfo(acc.fecha_orden).isExpired)}33;">${escapeHtml(acc.correo || 'N/A')}</span>
                        </div>
                    </td>
                    <td>
                        <div class="copyable-cell">
                            ${acc.contrasena ? `<button class="btn-copy-small" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(acc.contrasena)}', 'Contraseña')"><span class="material-icons-round">content_copy</span></button>` : ''}
                            <span class="truncate fade-out">${escapeHtml(acc.contrasena || 'N/A')}</span>
                        </div>
                    </td>
                    <td>${daysBadge}</td>
                    <td>
                        <div class="status-indicator ${isEstadoActivo(acc.estado_timestamp) ? 'sent' : ''}" onclick="event.stopPropagation(); toggleSentStatus('${acc.id}', ${isEstadoActivo(acc.estado_timestamp)})">
                            <span class="material-icons-round">${isEstadoActivo(acc.estado_timestamp) ? 'check_circle' : 'radio_button_unchecked'}</span>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 8px; justify-content: center;" onclick="event.stopPropagation()">
                            ${currentNavFilter === 'vencidos' ? `
                                <button class="btn-ghost" style="padding: 6px 10px; font-size: 10px; border-color: var(--primary); color: var(--primary);" onclick="openWhatsAppEditor('${acc.id}')">
                                    <span class="material-icons-round" style="font-size: 14px;">edit</span> EDITAR
                                </button>
                            ` : ''}
                            <button class="btn-card share" style="padding: 6px 10px; font-size: 10px; min-width: 80px;" onclick="shareWhatsAppDirect('${acc.id}')">
                                <span class="material-icons-round" style="font-size: 14px;">send</span> WHATSAPP
                            </button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }
        return;
    } else {
        grid.classList.remove('hidden');
        if (tableContainer) tableContainer.classList.add('hidden');
    }

    if (allNumbers.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">group_off</span>
                <p>${filter ? 'No se encontraron resultados' : 'Sin registros'}</p>
                <small>${filter ? 'Intenta con otro término de búsqueda' : 'Agrega tu primer cliente con el botón "Nuevo Registro"'}</small>
            </div>`;
        return;
    }

    grid.innerHTML = allNumbers.map(num => {
        // Build a mini summary for this profile
        let clientAccounts = clientsData.filter(c => c.numero_cliente === num);

        // For the grid view (Clientes/All), we only count Vigentes (>=0) for the badge,
        // but we still show the profile card even if count is 0.
        const activeAccounts = clientAccounts.filter(c => getDaysInfo(c.fecha_orden).dias >= 0);
        const accountCount = activeAccounts.length;
        const services = [...new Set(clientAccounts.map(c => c.tipo_cuenta).filter(Boolean))];

        // Find nearest expiration among active accounts
        let minDays = Infinity;
        activeAccounts.forEach(c => {
            const { dias } = getDaysInfo(c.fecha_orden);
            if (dias < minDays) minDays = dias;
        });

        const badgeClass = minDays >= 5 ? 'green' : (minDays >= 2 ? 'yellow' : 'red');
        const badgeHtml = accountCount > 0 && minDays !== Infinity
            ? `<span class="profile-badge ${badgeClass}">${minDays}d</span>`
            : '';

        return `
        <div class="profile-card" data-number="${escapeHtml(num)}">
            <div class="profile-avatar">
                <span class="material-icons-round">person</span>
            </div>
            <div class="profile-info">
                <div class="profile-number">${escapeHtml(num)}</div>
                <div class="profile-sub">
                    ${accountCount} cuenta${accountCount !== 1 ? 's' : ''}
                    ${services.length ? ' · ' + services.slice(0, 3).join(', ') : ''}
                    ${badgeHtml}
                </div>
            </div>
            <div class="profile-arrow">
                <span class="material-icons-round">chevron_right</span>
            </div>
        </div>`;
    }).join('');

    // Bind events
    grid.querySelectorAll('.profile-card').forEach(card => {
        const num = card.dataset.number;
        card.addEventListener('click', () => openClientDetail(num));

        let pressTimer;
        card.addEventListener('contextmenu', e => { e.preventDefault(); openProfileOptions(num); });
        card.addEventListener('mousedown', () => { pressTimer = setTimeout(() => openProfileOptions(num), 600); });
        card.addEventListener('mouseup', () => clearTimeout(pressTimer));
        card.addEventListener('mouseleave', () => clearTimeout(pressTimer));
        card.addEventListener('touchstart', () => { pressTimer = setTimeout(() => openProfileOptions(num), 600); }, { passive: true });
        card.addEventListener('touchend', () => clearTimeout(pressTimer));
    });
}

// ── Profile Options ──
function openProfileOptions(num) {
    optionsTargetNumber = num;
    $('modal-options').classList.remove('hidden');
}

// Close options
['options-close-x'].forEach(id => $(id).addEventListener('click', () => $('modal-options').classList.add('hidden')));
$('modal-options').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-options').classList.add('hidden'));

$('opt-edit-number').addEventListener('click', () => {
    $('modal-options').classList.add('hidden');
    $('edit-number-input').value = optionsTargetNumber;
    $('modal-edit-number').classList.remove('hidden');
});

$('opt-delete-user').addEventListener('click', () => {
    $('modal-options').classList.add('hidden');
    $('confirm-delete-text').textContent = `¿Estás seguro de que deseas eliminar al usuario ${optionsTargetNumber} y todos sus registros? Esta acción no se puede deshacer.`;
    $('modal-confirm-delete').classList.remove('hidden');
});

// Edit number modal
$('edit-number-cancel').addEventListener('click', () => $('modal-edit-number').classList.add('hidden'));
$('editnum-close-x').addEventListener('click', () => $('modal-edit-number').classList.add('hidden'));
$('modal-edit-number').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-edit-number').classList.add('hidden'));

$('edit-number-save').addEventListener('click', async () => {
    const newNum = $('edit-number-input').value.trim();
    const oldNum = optionsTargetNumber;
    if (!newNum || newNum === oldNum) { $('modal-edit-number').classList.add('hidden'); return; }
    try {
        const batch = db.batch();
        batch.delete(db.collection('perfiles').doc(oldNum));
        batch.set(db.collection('perfiles').doc(newNum), { numero: newNum, ultima_actividad: firebase.firestore.FieldValue.serverTimestamp() });
        const snap = await db.collection('clientes').where('numero_cliente', '==', oldNum).get();
        snap.docs.forEach(d => batch.update(d.ref, { numero_cliente: newNum }));
        await batch.commit();
        toast('Número actualizado correctamente');
    } catch (e) { toast('Error: ' + e.message); }
    $('modal-edit-number').classList.add('hidden');
});

// Confirm delete user
$('confirm-delete-cancel').addEventListener('click', () => $('modal-confirm-delete').classList.add('hidden'));
$('confirm-close-x').addEventListener('click', () => $('modal-confirm-delete').classList.add('hidden'));
$('modal-confirm-delete').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-confirm-delete').classList.add('hidden'));

$('confirm-delete-ok').addEventListener('click', async () => {
    const num = optionsTargetNumber;
    try {
        const batch = db.batch();
        batch.delete(db.collection('perfiles').doc(num));
        const snap = await db.collection('clientes').where('numero_cliente', '==', num).get();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast('Cliente eliminado');
        // If we were viewing this client, go back
        if (currentProfileNumber === num) showScreen('list');
    } catch (e) { toast('Error: ' + e.message); }
    $('modal-confirm-delete').classList.add('hidden');
});

// ═══════════════════════════════════════════════
// SCREEN 2: CLIENT DETAIL
// ═══════════════════════════════════════════════
let unsubPurchases = null;
let currentPurchaseDocs = [];

function openClientDetail(numero) {
    currentProfileNumber = numero;
    $('detail-title').textContent = '+' + numero.replace(/^\+/, '');
    showScreen('detail');

    $('purchases-grid').innerHTML = '<div class="loading-state"><div class="spinner-ring"></div><p>Cargando cuentas...</p></div>';

    if (unsubPurchases) unsubPurchases();
    unsubPurchases = db.collection('clientes').where('numero_cliente', '==', numero).onSnapshot(snap => {
        currentPurchaseDocs = snap.docs;
        $('detail-count').textContent = `${snap.docs.length} cuenta${snap.docs.length !== 1 ? 's' : ''} registrada${snap.docs.length !== 1 ? 's' : ''}`;
        renderPurchases(snap.docs);
    });
}

function renderPurchases(docs) {
    const grid = $('purchases-grid');
    const filter = ($('search-detail').value || '').toLowerCase();

    if (docs.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">inbox</span>
                <p>Sin cuentas registradas</p>
                <small>Agrega una cuenta con el botón "Agregar Cuenta"</small>
            </div>`;
        return;
    }

    let sorted = [...docs].sort((a, b) => {
        const t1 = parseFecha(a.data().fecha_orden);
        const t2 = parseFecha(b.data().fecha_orden);
        return (t2 || new Date()).getTime() - (t1 || new Date()).getTime();
    });

    if (filter) {
        sorted = sorted.filter(d => (d.data().correo || '').toLowerCase().startsWith(filter));
    }

    if (sorted.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">search_off</span>
                <p>Sin resultados</p>
            </div>`;
        return;
    }

    grid.innerHTML = sorted.map((doc, idx) => {
        const data = doc.data();
        const { fCStr, fVStr, dias, colorClass, colorHex } = getDaysInfo(data.fecha_orden);
        const serviceColor = getServiceColor(data.tipo_cuenta);

        return `
        <div class="purchase-card" style="animation-delay:${idx * 0.07}s">
            <div class="card-top">
                <div class="card-top-left">
                    <h3 style="color: ${serviceColor}; text-shadow: 0 0 12px ${serviceColor}33;">${escapeHtml(data.tipo_cuenta || 'Servicio')}</h3>
                    <span>${escapeHtml(data.usuario || 'Master')}</span>
                </div>
                <div class="days-badge ${colorClass}">
                    ${dias}
                    <small>días</small>
                </div>
            </div>
            <div class="card-body">
                <hr class="card-divider">
                <div class="info-grid">
                    <div class="info-item full">
                        <span class="material-icons-round">alternate_email</span>
                        <div>
                            <div class="info-label">Correo</div>
                            <div class="info-value copyable-text">
                                ${data.correo ? `<button class="btn-copy-small" onclick="copyToClipboard('${escapeHtml(data.correo)}', 'Correo')"><span class="material-icons-round">content_copy</span></button>` : ''}
                                <span class="email-tag" style="background: ${getEmailColor(data.correo, getDaysInfo(data.fecha_orden).isExpired)}; color: ${getDaysInfo(data.fecha_orden).isExpired ? 'var(--text)' : getEmailBorderColor(data.correo, getDaysInfo(data.fecha_orden).isExpired)}; border: 1px solid ${getEmailBorderColor(data.correo, getDaysInfo(data.fecha_orden).isExpired)}33;">${escapeHtml(data.correo || 'N/A')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="material-icons-round">key</span>
                        <div>
                            <div class="info-label">Contraseña</div>
                            <div class="info-value copyable-text">
                                ${data.contrasena ? `<button class="btn-copy-small" onclick="copyToClipboard('${escapeHtml(data.contrasena)}', 'Contraseña')"><span class="material-icons-round">content_copy</span></button>` : ''}
                                <span class="fade-out">${escapeHtml(data.contrasena || 'N/A')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="material-icons-round">person</span>
                        <div><div class="info-label">Perfil</div><div class="info-value">${escapeHtml(data.perfil || 'N/A')}</div></div>
                    </div>
                    <div class="info-item">
                        <span class="material-icons-round">lock</span>
                        <div><div class="info-label">PIN</div><div class="info-value">${escapeHtml(data.pin || 'N/A')}</div></div>
                    </div>
                    <div class="info-item">
                        <span class="material-icons-round">shopping_bag</span>
                        <div><div class="info-label">Compra</div><div class="info-value">${fCStr}</div></div>
                    </div>
                    <div class="info-item">
                        <span class="material-icons-round" style="color:${colorHex}">event</span>
                        <div><div class="info-label">Vence</div><div class="info-value accent" style="color:${colorHex}">${fVStr}</div></div>
                    </div>
                    <div class="info-item">
                        <span class="material-icons-round" style="color: var(--secondary)">payments</span>
                        <div><div class="info-label">Precio</div><div class="info-value">S/ ${data.precio !== undefined ? data.precio : (profitRates[data.tipo_cuenta] || '0')}</div></div>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <div class="card-footer-left">
                    <button class="btn-card edit" data-docid="${doc.id}">
                        <span class="material-icons-round">edit_note</span>
                        Editar
                    </button>
                    <button class="btn-card delete" data-docid="${doc.id}">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
                <button class="btn-card share" data-docid="${doc.id}">
                    <span class="material-icons-round">send</span>
                    WhatsApp
                </button>
            </div>
        </div>`;
    }).join('');

    // Bind actions
    grid.querySelectorAll('.btn-card.edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = docs.find(x => x.id === btn.dataset.docid);
            if (d) openEditModal(d.id, d.data());
        });
    });

    grid.querySelectorAll('.btn-card.delete').forEach(btn => {
        btn.addEventListener('click', () => deletePurchase(btn.dataset.docid));
    });

    grid.querySelectorAll('.btn-card.share').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = docs.find(x => x.id === btn.dataset.docid);
            if (d) shareWhatsApp(d.data());
        });
    });
}

// Detail search
$('search-detail').addEventListener('input', () => {
    renderPurchases(currentPurchaseDocs);
});

// Back from detail
$('btn-back-detail').addEventListener('click', () => {
    if (unsubPurchases) { unsubPurchases(); unsubPurchases = null; }
    $('search-detail').value = '';
    currentPurchaseDocs = [];
    showScreen('list');
});

// Client options button (in detail header)
$('btn-client-options').addEventListener('click', () => {
    openProfileOptions(currentProfileNumber);
});

// Add to this client
$('btn-add-to-client').addEventListener('click', () => {
    openForm(currentProfileNumber);
});

// ── Edit Modal ──
function openEditModal(docId, data) {
    editDocId = docId;
    $('edit-numero').value = data.numero_cliente || '';
    $('edit-correo').value = data.correo || '';
    $('edit-pass').value = data.contrasena || '';
    $('edit-pin').value = data.pin || '';
    $('edit-precio').value = data.precio !== undefined ? data.precio : (profitRates[data.tipo_cuenta] || '');

    if ($('edit-update-all')) $('edit-update-all').checked = false;

    const fC = parseFecha(data.fecha_orden);
    $('edit-fecha').value = fC ? toISODate(fC) : toISODate(new Date());

    editState = {
        servicio: data.tipo_cuenta || 'Netflix',
        perfil: data.perfil || '1',
        tipo: data.usuario || 'Master'
    };

    renderEditChips();
    $('modal-edit').classList.remove('hidden');
}

function renderEditChips() {
    $('edit-chips-servicio').innerHTML = servicios.map(s => {
        const isSelected = editState.servicio === s;
        const color = isSelected ? getServiceColor(s) : '';
        const style = isSelected ? `style="background: ${color}; border-color: ${color}; color: #000; font-weight: 800; box-shadow: 0 4px 14px ${color}44;"` : '';
        return `<div class="chip ${isSelected ? 'selected' : ''}" data-val="${s}" ${style}>${s}</div>`;
    }).join('');
    $('edit-chips-servicio').querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => { editState.servicio = c.dataset.val; renderEditChips(); });
    });

    $('edit-chips-perfil').innerHTML = [1, 2, 3, 4, 5, 6].map(p =>
        `<div class="chip circle ${editState.perfil === String(p) ? 'selected' : ''}" data-val="${p}">${p}</div>`
    ).join('');
    $('edit-chips-perfil').querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => { editState.perfil = c.dataset.val; renderEditChips(); });
    });

    $('edit-chips-tipo').innerHTML = ['Master', 'No Master'].map(t =>
        `<div class="chip ${editState.tipo === t ? 'selected' : ''}" data-val="${t}">${t}</div>`
    ).join('');
    $('edit-chips-tipo').querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => { editState.tipo = c.dataset.val; renderEditChips(); });
    });
}

$('edit-cancel').addEventListener('click', () => $('modal-edit').classList.add('hidden'));
$('edit-close-x').addEventListener('click', () => $('modal-edit').classList.add('hidden'));
$('modal-edit').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-edit').classList.add('hidden'));

$('edit-save').addEventListener('click', async () => {
    try {
        const fechaVal = $('edit-fecha').value;
        const fechaDate = fechaVal ? new Date(fechaVal + 'T00:00:00') : new Date();
        const nuevoNumero = $('edit-numero').value.trim();
        const nuevoCorreo = $('edit-correo').value.trim();
        const nuevaContrasena = $('edit-pass').value;
        const updateAll = $('edit-update-all') ? $('edit-update-all').checked : false;

        const priceVal = parseFloat($('edit-precio').value);
        const finalPrice = !isNaN(priceVal) ? priceVal : (profitRates[editState.servicio] || 0);

        const updateData = {
            numero_cliente: nuevoNumero,
            correo: nuevoCorreo,
            contrasena: nuevaContrasena,
            pin: $('edit-pin').value,
            precio: finalPrice,
            tipo_cuenta: editState.servicio,
            perfil: editState.perfil,
            usuario: editState.tipo,
            fecha_orden: firebase.firestore.Timestamp.fromDate(fechaDate)
        };

        if (updateAll) {
            const oldDoc = currentPurchaseDocs.find(x => x.id === editDocId);
            const oldData = oldDoc ? oldDoc.data() : null;

            if (oldData && oldData.correo && oldData.tipo_cuenta) {
                const snap = await db.collection('clientes')
                    .where('correo', '==', oldData.correo)
                    .where('tipo_cuenta', '==', oldData.tipo_cuenta)
                    .get();

                const batch = db.batch();
                snap.docs.forEach(d => {
                    if (d.id === editDocId) {
                        batch.update(d.ref, updateData);
                    } else {
                        // Actualizar correo, contraseña, servicio, perfil y pin para los demás
                        batch.update(d.ref, {
                            correo: nuevoCorreo,
                            contrasena: nuevaContrasena,
                            tipo_cuenta: editState.servicio,
                            perfil: editState.perfil,
                            pin: $('edit-pin').value,
                            precio: finalPrice
                        });
                    }
                });
                await batch.commit();
            } else {
                await db.collection('clientes').doc(editDocId).update(updateData);
            }
        } else {
            await db.collection('clientes').doc(editDocId).update(updateData);
        }

        // Ensure the profile exists if the number changed or was typed
        if (nuevoNumero) {
            await db.collection('perfiles').doc(nuevoNumero).set({
                numero: nuevoNumero,
                ultima_actividad: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            await updateProfileSearchData(nuevoNumero);
        }

        // If the number was changed, update the old profile's search data too
        if (nuevoNumero !== currentProfileNumber) {
            await updateProfileSearchData(currentProfileNumber);
        }

        toast('Registro actualizado');
    } catch (e) { toast('Error: ' + e.message); }
            $('modal-edit').classList.add('hidden');
        // Recalculate stats and refresh if we are on the stats screen
        updateStats();
});

// ── Delete purchase ──
async function deletePurchase(docId) {
    if (!confirm('¿Eliminar esta compra? Esta acción no se puede deshacer.')) return;
    try {
        await db.collection('clientes').doc(docId).delete();
        await updateProfileSearchData(currentProfileNumber);
        toast('Compra eliminada');
    } catch (e) { toast('Error: ' + e.message); }
}

// ── WhatsApp ──
function shareWhatsApp(data) {
    const msg = getWhatsAppMessage(data);
    const phone = currentProfileNumber.replace(/\D/g, '');
    const url = "https://api.whatsapp.com/send?phone=" + phone + "&text=" + encodeURIComponent(msg);
    window.open(url, '_blank');
}

function getWhatsAppMessage(data, forceIdx = -1) {
    const { fCStr, fVStr, dias } = getDaysInfo(data.fecha_orden);
    
    // Check if there's a custom template for Vencidos
    let templates = [];
    try { templates = JSON.parse(localStorage.getItem('wa_templates_vencidos')); } catch(e){}
    if (!templates || templates.length === 0) templates = window.defaultTemplates || [];
    
    let activeIdx = forceIdx >= 0 ? forceIdx : parseInt(localStorage.getItem('wa_template_vencidos_idx') || '0');
    if (activeIdx >= templates.length) activeIdx = 0;
    let template = templates[activeIdx] || templates[0];
    
    if (dias < 0 && template) {
        // Use custom template
        let msg = template;
        msg = msg.replace(/{SERVICIO}/g, data.tipo_cuenta || "");
        msg = msg.replace(/{CORREO}/g, data.correo || "");
        msg = msg.replace(/{PASS}/g, data.contrasena || "");
        msg = msg.replace(/{PERFIL}/g, data.perfil || "");
        msg = msg.replace(/{PIN}/g, data.pin || "");
        msg = msg.replace(/{TIPO}/g, data.usuario || "");
        msg = msg.replace(/{COMPRA}/g, fCStr);
        msg = msg.replace(/{VENCE}/g, fVStr);
        msg = msg.replace(/{DIAS}/g, dias);
        return msg;
    }

    // Default Template
    let msg = "\u00A1Hola! Detalles de tu cuenta:\n\n";
    msg += "\uD83D\uDCFA *Servicio:* " + (data.tipo_cuenta || "") + "\n";
    msg += "\u2B50 *Usuario:* " + (data.correo || "") + "\n";
    msg += "\uD83D\uDD12 *Contraseña:* " + (data.contrasena || "") + "\n\n";
    msg += "\uD83D\uDC64 *Perfil:* " + (data.perfil || "") + "\n";
    msg += "\uD83D\uDD22 *PIN:* " + (data.pin || "") + "\n";
    msg += "\u2705 *Tipo:* " + (data.usuario || "") + "\n\n";
    msg += "\uD83D\uDCC5 *Compra:* " + fCStr + "\n";
    msg += "\uD83D\uDCC6 *Vence:* " + fVStr + "\n";
    msg += "\u23F3 *Quedan:* " + dias + " d\u00EDas\n\n";
    msg += "Gracias! \u2728";
    return msg;
}

let waEditTargetData = null;
let waEditActiveTemplateIndex = 0;

function openWhatsAppEditor(docId) {
    const data = clientsData.find(c => c.id === docId);
    if (!data) return;
    
    waEditTargetData = data;
    
    const savedIdx = localStorage.getItem('wa_template_vencidos_idx');
    waEditActiveTemplateIndex = savedIdx ? parseInt(savedIdx) : 0;
    
    renderWaEditTemplateTabs();
    
    const msg = getWhatsAppMessage(data, waEditActiveTemplateIndex);
    $('wa-edit-text').value = msg;
    $('modal-whatsapp-edit').classList.remove('hidden');
}

function renderWaEditTemplateTabs() {
    const tabsContainer = $('wa-edit-template-tabs');
    if (!tabsContainer) return;
    
    let templates = [];
    try { templates = JSON.parse(localStorage.getItem('wa_templates_vencidos')); } catch(e){}
    if (!templates || templates.length === 0) templates = window.defaultTemplates || [];
    
    if (waEditActiveTemplateIndex >= templates.length) waEditActiveTemplateIndex = 0;
    
    let html = '';
    templates.forEach((_, idx) => {
        const isDefault = idx < window.defaultTemplates.length;
        const name = isDefault ? `Idea ${idx + 1}` : `Pers. ${idx - window.defaultTemplates.length + 1}`;
        html += `<button class="chip ${idx === waEditActiveTemplateIndex ? 'selected' : ''}" style="white-space: nowrap; font-size: 12px; padding: 6px 12px; ${idx === waEditActiveTemplateIndex ? 'background: var(--primary); color: #000; border-color: var(--primary);' : ''}" onclick="event.preventDefault(); window.applyWaEditTemplate(${idx})">${name}</button>`;
    });
    
    tabsContainer.innerHTML = html;
}

window.applyWaEditTemplate = function(idx) {
    waEditActiveTemplateIndex = idx;
    renderWaEditTemplateTabs();
    const msg = getWhatsAppMessage(waEditTargetData, idx);
    $('wa-edit-text').value = msg;
};

$('wa-edit-close-x').addEventListener('click', () => $('modal-whatsapp-edit').classList.add('hidden'));
$('wa-edit-cancel').addEventListener('click', () => $('modal-whatsapp-edit').classList.add('hidden'));
$('modal-whatsapp-edit').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-whatsapp-edit').classList.add('hidden'));

$('wa-edit-send').addEventListener('click', () => {
    const msg = $('wa-edit-text').value;
    const phone = waEditTargetData.numero_cliente.replace(/\D/g, '');
    const url = "https://api.whatsapp.com/send?phone=" + phone + "&text=" + encodeURIComponent(msg);
    window.open(url, '_blank');
    $('modal-whatsapp-edit').classList.add('hidden');
});

// ── Template Editor Logic ──
window.defaultTemplates = [
`🚨 *¡ACCIÓN REQUERIDA!* Problema con tu cuenta 🚨

Hola, hemos detectado que tu acceso a *{SERVICIO}* ha expirado hoy ({VENCE}).

Para no perder tu cuenta y seguir disfrutando sin interrupciones, por favor renueva lo antes posible.
👤 *Usuario:* {CORREO}
🔑 *Contraseña:* {PASS}

Quedo atento para ayudarte con la renovación. ¡Gracias! ✨`,

`👋 ¡Hola! ¿Qué tal?

Te escribo para avisarte que tu mes de *{SERVICIO}* ha concluido el {VENCE}. 
Espero que hayas disfrutado mucho el servicio. 🍿

Si deseas renovar y mantener tu mismo perfil, confírmame por aquí para enviarte los métodos de pago.

📌 Tus datos actuales:
Usuario: {CORREO}
Perfil: {PERFIL} | PIN: {PIN}

¡Quedo a tu disposición! 🚀`,

`⚠️ *AVISO DE CORTE* ⚠️

Tu suscripción de *{SERVICIO}* se encuentra vencida desde el {VENCE} y será suspendida en las próximas horas.

Renueva hoy mismo y conserva tu progreso e historial.
👉 Cuenta: {CORREO}
👉 Perfil: {PERFIL}

¡Escríbeme para mantenerla activa! ⏳`
];

let currentTemplates = [];
let activeTemplateIndex = 0;
let confirmingDeleteIdx = -1;

window.selectTemplate = function(idx) {
    if ($('template-text')) currentTemplates[activeTemplateIndex] = $('template-text').value;
    activeTemplateIndex = idx;
    confirmingDeleteIdx = -1;
    localStorage.setItem('wa_template_vencidos_idx', activeTemplateIndex);
    $('template-text').value = currentTemplates[activeTemplateIndex] || '';
    renderTemplateTabs();
};

window.addNewTemplate = function() {
    if ($('template-text')) currentTemplates[activeTemplateIndex] = $('template-text').value;
    currentTemplates.push("Escribe tu nueva idea aquí...\n\nUsuario: {CORREO}");
    activeTemplateIndex = currentTemplates.length - 1;
    confirmingDeleteIdx = -1;
    localStorage.setItem('wa_template_vencidos_idx', activeTemplateIndex);
    $('template-text').value = currentTemplates[activeTemplateIndex];
    renderTemplateTabs();
};

window.promptDeleteTemplate = function(idx) {
    if (currentTemplates.length <= 1) {
        toast('Debe quedar al menos una idea de plantilla.');
        return;
    }
    confirmingDeleteIdx = idx;
    renderTemplateTabs();
};

window.cancelDeleteTemplate = function() {
    confirmingDeleteIdx = -1;
    renderTemplateTabs();
};

window.deleteTemplate = function(idx) {
    currentTemplates.splice(idx, 1);
    if (activeTemplateIndex >= currentTemplates.length) {
        activeTemplateIndex = currentTemplates.length - 1;
    } else if (activeTemplateIndex > idx) {
        activeTemplateIndex--;
    }
    confirmingDeleteIdx = -1;
    localStorage.setItem('wa_template_vencidos_idx', activeTemplateIndex);
    $('template-text').value = currentTemplates[activeTemplateIndex] || '';
    renderTemplateTabs();
    toast('Idea eliminada');
};

function renderTemplateTabs() {
    const tabsContainer = $('template-tabs');
    if (!tabsContainer) return;
    
    let html = '';
    currentTemplates.forEach((_, idx) => {
        const isDefault = idx < window.defaultTemplates.length;
        const name = isDefault ? `Idea ${idx + 1}` : `Pers. ${idx - window.defaultTemplates.length + 1}`;
        
        if (idx === confirmingDeleteIdx) {
            html += `
                <div style="display: flex; flex-direction: column; gap: 4px; background: var(--bg-card); padding: 6px; border-radius: 12px; border: 1px solid var(--danger); box-shadow: 0 4px 12px rgba(0,0,0,0.3); min-width: 100px;">
                    <button class="chip" style="background: var(--danger); color: white; border-color: var(--danger); white-space: nowrap; font-size: 11px; padding: 6px 12px; width: 100%; justify-content: center;" onclick="event.preventDefault(); window.deleteTemplate(${idx})">Eliminar</button>
                    <button class="chip" style="background: transparent; border: none; white-space: nowrap; font-size: 11px; padding: 6px 12px; width: 100%; justify-content: center; color: var(--text-dim);" onclick="event.preventDefault(); window.cancelDeleteTemplate()">Cancelar</button>
                </div>
            `;
        } else {
            html += `<button class="chip ${idx === activeTemplateIndex ? 'selected' : ''}" style="white-space: nowrap; font-size: 12px; padding: 6px 12px; ${idx === activeTemplateIndex ? 'background: var(--primary); color: #000; border-color: var(--primary);' : ''}" onclick="event.preventDefault(); window.selectTemplate(${idx})" oncontextmenu="event.preventDefault(); window.promptDeleteTemplate(${idx})">${name}</button>`;
        }
    });
    
    html += `<button class="chip" style="white-space: nowrap; font-size: 12px; padding: 6px 12px; background: transparent; border: 1px dashed var(--border);" onclick="event.preventDefault(); window.addNewTemplate()"><span class="material-icons-round" style="font-size: 14px;">add</span> Nueva</button>`;
    
    tabsContainer.innerHTML = html;
}

$('btn-edit-template-vencidos').addEventListener('click', () => {
    let saved = localStorage.getItem('wa_templates_vencidos');
    if (saved) {
        try { currentTemplates = JSON.parse(saved); } catch (e) { currentTemplates = [...window.defaultTemplates]; }
    } else {
        currentTemplates = [...window.defaultTemplates];
        // Migration: If they had a single old template, put it as the first one
        const oldSaved = localStorage.getItem('wa_template_vencidos');
        if (oldSaved) {
            currentTemplates[0] = oldSaved;
        }
    }
    
    const savedIdx = localStorage.getItem('wa_template_vencidos_idx');
    activeTemplateIndex = savedIdx ? parseInt(savedIdx) : 0;
    if (activeTemplateIndex >= currentTemplates.length) activeTemplateIndex = 0;
    
    $('template-text').value = currentTemplates[activeTemplateIndex] || '';
    renderTemplateTabs();
    
    $('modal-template-editor').classList.remove('hidden');
});

$('template-close-x').addEventListener('click', () => $('modal-template-editor').classList.add('hidden'));
$('template-cancel').addEventListener('click', () => $('modal-template-editor').classList.add('hidden'));
$('modal-template-editor').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-template-editor').classList.add('hidden'));

$('template-save').addEventListener('click', async () => {
    const btn = $('template-save');
    if (btn.disabled) return;
    
    currentTemplates[activeTemplateIndex] = $('template-text').value.trim();
    localStorage.setItem('wa_templates_vencidos', JSON.stringify(currentTemplates));
    localStorage.setItem('wa_template_vencidos_idx', activeTemplateIndex);
    
    toast('¡Plantillas guardadas correctamente!');
    $('modal-template-editor').classList.add('hidden');
});


// ═══════════════════════════════════════════════
// SCREEN 3: FORM
// ═══════════════════════════════════════════════
let formState = { perfil: '1', tipo: 'Master', servicio: 'Netflix' };

function openForm(prefilledNumber) {
    $('form-numero').value = prefilledNumber || '';
    $('form-correo').value = '';
    $('form-pass').value = '';
    $('form-pin').value = '';
    $('form-precio').value = profitRates['Netflix'] || '';
    formState = { perfil: '1', tipo: 'Master', servicio: 'Netflix' };

    $('field-numero').style.display = prefilledNumber ? 'none' : '';
    renderFormChips();
    showScreen('form');
}

function renderFormChips() {
    $('chips-perfil').innerHTML = [1, 2, 3, 4, 5, 6].map(p =>
        `<div class="chip circle ${formState.perfil === String(p) ? 'selected' : ''}" data-val="${p}">${p}</div>`
    ).join('');
    $('chips-perfil').querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => { formState.perfil = c.dataset.val; renderFormChips(); });
    });

    $('chips-tipo-usuario').innerHTML = ['Master', 'No Master'].map(t =>
        `<div class="chip ${formState.tipo === t ? 'selected' : ''}" data-val="${t}">${t}</div>`
    ).join('');
    $('chips-tipo-usuario').querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => { formState.tipo = c.dataset.val; renderFormChips(); });
    });

    $('chips-servicio').innerHTML = servicios.map(s => {
        const isSelected = formState.servicio === s;
        const color = isSelected ? getServiceColor(s) : '';
        const style = isSelected ? `style="background: ${color}; border-color: ${color}; color: #000; font-weight: 800; box-shadow: 0 4px 14px ${color}44;"` : '';
        return `<div class="chip ${isSelected ? 'selected' : ''}" data-val="${s}" ${style}>${s}</div>`;
    }).join('');
    $('chips-servicio').querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => { 
            formState.servicio = c.dataset.val; 
            $('form-precio').value = profitRates[formState.servicio] || '';
            renderFormChips(); 
        });
    });
}

$('btn-back-form').addEventListener('click', () => {
    if (currentProfileNumber) {
        openClientDetail(currentProfileNumber);
    } else {
        showScreen('list');
    }
});

$('btn-form-cancel').addEventListener('click', () => {
    if (currentProfileNumber) {
        openClientDetail(currentProfileNumber);
    } else {
        showScreen('list');
    }
});

$('btn-guardar').addEventListener('click', async () => {
    let numero = $('form-numero').value.trim();
    if ($('field-numero').style.display === 'none') numero = currentProfileNumber;
    if (!numero || numero === '+51') { toast('Ingresa un número de cliente'); return; }

    const btn = $('btn-guardar');
    btn.classList.add('loading');
    btn.querySelector('.btn-guardar-text').classList.add('hidden');
    btn.querySelector('.btn-spinner').classList.remove('hidden');
    btn.disabled = true;

    try {
        await db.collection('perfiles').doc(numero).set({
            numero: numero,
            ultima_actividad: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const formPriceVal = parseFloat($('form-precio').value);
        const formFinalPrice = !isNaN(formPriceVal) ? formPriceVal : (profitRates[formState.servicio] || 0);

        await db.collection('clientes').add({
            numero_cliente: numero,
            correo: $('form-correo').value,
            contrasena: $('form-pass').value,
            tipo_cuenta: formState.servicio,
            usuario: formState.tipo,
            perfil: formState.perfil,
            pin: $('form-pin').value,
            precio: formFinalPrice,
            fecha_orden: firebase.firestore.FieldValue.serverTimestamp()
        });

        await updateProfileSearchData(numero);
                toast('¡Registro guardado exitosamente!');
        // Refresh stats after adding a new purchase
        updateStats();

        if (currentProfileNumber) {
            openClientDetail(currentProfileNumber);
        } else {
            showScreen('list');
        }
    } catch (e) {
        toast('Error: ' + e.message);
    } finally {
        btn.classList.remove('loading');
        btn.querySelector('.btn-guardar-text').classList.remove('hidden');
        btn.querySelector('.btn-spinner').classList.add('hidden');
        btn.disabled = false;
    }
});

$('form-numero').addEventListener('input', e => {
    e.target.value = phoneFormat(e.target.value);
});

$('edit-numero').addEventListener('input', e => {
    e.target.value = phoneFormat(e.target.value);
});

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
async function updateProfileSearchData(numero) {
    try {
        const q = await db.collection('clientes').where('numero_cliente', '==', numero).get();
        const emails = q.docs.map(d => (d.data().correo || '')).join(' ');
        await db.collection('perfiles').doc(numero).set({
            numero: numero,
            search_emails: emails,
            ultima_actividad: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error('Error updating profile:', e); }
}

async function syncPerfiles() {
    try {
        const snap = await db.collection('clientes').get();
        const nums = new Set();
        snap.docs.forEach(d => { const n = d.data().numero_cliente; if (n) nums.add(n); });
        for (const num of nums) {
            const p = await db.collection('perfiles').doc(num).get();
            if (!p.exists) {
                const emails = snap.docs.filter(d => d.data().numero_cliente === num).map(d => (d.data().correo || '')).join(' ');
                await db.collection('perfiles').doc(num).set({
                    numero: num, search_emails: emails,
                    ultima_actividad: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
    } catch (e) { console.error('Error sync:', e); }
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    // Anonymous auth — invisible, no login screen
    try {
        await firebase.auth().signInAnonymously();
        console.log('🔒 Auth OK');
    } catch (e) {
        console.error('Auth error:', e);
    }

    syncPerfiles();
    initProfileList();
    renderFormChips();
    initServiceDropdown();
});

// ═══════════════════════════════════════════════
// BOT FAB & EXPIRING CLIENTS
// ═══════════════════════════════════════════════
const fabBtn = $('fab-button');
const fabIcon = $('fab-icon');

if (fabBtn) {
    fabBtn.addEventListener('click', () => {
        botFilterActive = !botFilterActive;

        if (botFilterActive) {
            fabIcon.textContent = 'close';
            fabBtn.style.background = 'var(--danger)';
            fabBtn.style.boxShadow = '0 6px 16px var(--danger-dim)';

            // Clear service filter
            activeServiceFilter = '';
            $('dropdown-selected').textContent = 'Filtrar por Servicio';
            $$('.dropdown-item').forEach(i => i.classList.remove('active'));
            $$('.dropdown-item[data-val=""]').forEach(i => i.classList.add('active'));

            // IF IN VENCIDOS, RETURN TO CLIENTES
            if (currentNavFilter === 'vencidos') {
                currentNavFilter = 'all';
            }
        } else {
            fabIcon.textContent = 'support_agent';
            fabBtn.style.background = '';
            fabBtn.style.boxShadow = '';
        }

        if (currentScreen !== 'list') {
            showScreen('list');
        }

        renderProfiles();
    });
}

function shareWhatsAppDirect(docId) {
    const data = clientsData.find(c => c.id === docId);
    if (data) {
        // Build a temporary structure to pass the number
        currentProfileNumber = data.numero_cliente;
        shareWhatsApp(data);
    }
}

// ═══════════════════════════════════════════════
// SERVICE DROPDOWN
// ═══════════════════════════════════════════════
function initServiceDropdown() {
    const header = $('dropdown-header');
    const list = $('dropdown-list');
    const selectedText = $('dropdown-selected');
    if (!header || !list) return;

    let html = `<div class="dropdown-item active" data-val="">Todos los servicios</div>`;
    servicios.forEach(s => {
        html += `<div class="dropdown-item" data-val="${s}">${s}</div>`;
    });
    list.innerHTML = html;

    header.addEventListener('click', (e) => {
        e.stopPropagation();
        list.classList.toggle('hidden');
    });

    list.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            activeServiceFilter = item.dataset.val;
            selectedText.textContent = activeServiceFilter || 'Filtrar por Servicio';

            list.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            list.classList.add('hidden');

            renderProfiles();
        });
    });

    document.addEventListener('click', () => {
        list.classList.add('hidden');
    });
}

// ═══════════════════════════════════════════════
// GASTOS (EXPENSES)
// ═══════════════════════════════════════════════
function renderGastosHistory() {
    const tbody = $('gastos-history-body');
    if (!tbody) return;

    if (gastosData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 24px; color: var(--text-dim);">No hay gastos registrados</td></tr>`;
        return;
    }

    const sortedGastos = [...gastosData].sort((a, b) => {
        const t1 = a.fecha ? a.fecha.toDate().getTime() : 0;
        const t2 = b.fecha ? b.fecha.toDate().getTime() : 0;
        return t2 - t1;
    });

    tbody.innerHTML = sortedGastos.map(g => {
        const date = g.fecha ? formatDate(g.fecha.toDate()) : 'Sin fecha';
        return `
        <tr>
            <td>${date}</td>
            <td style="font-weight: bold; color: var(--danger);">S/ ${parseFloat(g.monto).toFixed(2)}</td>
            <td style="text-align: center;">
                <button class="btn-card delete" style="margin: 0 auto; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;" onclick="confirmDeleteGasto('${g.id}')">
                    <span class="material-icons-round" style="font-size: 18px;">delete</span>
                </button>
            </td>
        </tr>`;
    }).join('');
}

let gastoToDelete = null;
window.confirmDeleteGasto = function(id) {
    gastoToDelete = id;
    if ($('confirm-delete-text')) {
        $('confirm-delete-text').textContent = '¿Estás seguro de eliminar este gasto? El monto se restaurará a tu Ganancia Total.';
    }
    if ($('modal-confirm-delete')) {
        $('modal-confirm-delete').classList.remove('hidden');
    }
};

if ($('confirm-delete-cancel')) {
    $('confirm-delete-cancel').addEventListener('click', () => {
        $('modal-confirm-delete').classList.add('hidden');
        gastoToDelete = null;
    });
}
if ($('confirm-close-x')) {
    $('confirm-close-x').addEventListener('click', () => {
        $('modal-confirm-delete').classList.add('hidden');
        gastoToDelete = null;
    });
}
if ($('confirm-delete-ok')) {
    $('confirm-delete-ok').addEventListener('click', async () => {
        if (!gastoToDelete) return;
        try {
            await db.collection('gastos').doc(gastoToDelete).delete();
            toast('Gasto eliminado');
            $('modal-confirm-delete').classList.add('hidden');
            gastoToDelete = null;
        } catch (e) {
            toast('Error: ' + e.message);
        }
    });
}

if ($('card-gastos')) {
    $('card-gastos').addEventListener('click', () => {
        if ($('expense-monto')) $('expense-monto').value = '';
        renderGastosHistory();
        $('modal-gastos-list').classList.remove('hidden');
    });
}

if ($('gastos-close-x')) $('gastos-close-x').addEventListener('click', () => $('modal-gastos-list').classList.add('hidden'));
if ($('modal-gastos-list')) {
    $('modal-gastos-list').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-gastos-list').classList.add('hidden'));
}

if ($('expense-save')) {
    $('expense-save').addEventListener('click', async () => {
        const monto = parseFloat($('expense-monto').value);

        if (isNaN(monto) || monto <= 0) {
            toast('Ingresa un monto válido mayor a 0');
            return;
        }

        const btn = $('expense-save');
        btn.disabled = true;

        try {
            await db.collection('gastos').add({
                monto: monto,
                fecha: firebase.firestore.FieldValue.serverTimestamp()
            });
            toast('Gasto guardado correctamente');
            if ($('expense-monto')) $('expense-monto').value = '';
        } catch (e) {
            toast('Error al guardar gasto: ' + e.message);
        } finally {
            btn.disabled = false;
        }
    });
}

// ═══════════════════════════════════════════════
// FILTER STATS
// ═══════════════════════════════════════════════
window.currentStatsFilter = 'all';
document.querySelectorAll('.stats-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.stats-toggle-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = 'var(--text-dim)';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--primary)';
        btn.style.color = '#000';
        window.currentStatsFilter = btn.dataset.val;
        updateStats();
    });
});
