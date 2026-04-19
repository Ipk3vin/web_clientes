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

// ── State ──
let currentScreen = 'list';
let currentProfileNumber = '';
let optionsTargetNumber = '';
let editDocId = '';
let editState = {};
let allClientsCache = [];

const servicios = ['Netflix', 'Disney+', 'HBO Max', 'Prime Video', 'ChatGPT', 'Movistar Play', 'Otros'];

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
    if (name === 'list') $('nav-clientes').classList.add('active');
    if (name === 'form') $('nav-nuevo').classList.add('active');

    // Close mobile sidebar
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.add('hidden');
}

// Sidebar nav clicks
$('nav-clientes').addEventListener('click', () => showScreen('list'));
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
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function toISODate(d) {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

function getDaysInfo(fechaOrden) {
    const fC = parseFecha(fechaOrden);
    const fCStr = formatDate(fC);
    const fV = fC ? new Date(fC.getTime() + 31 * 24 * 60 * 60 * 1000) : null;
    const fVStr = formatDate(fV);
    const diasRaw = fV ? Math.floor((fV.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    const dias = diasRaw < 0 ? 0 : diasRaw;
    const colorClass = dias >= 5 ? 'days-green' : (dias >= 2 ? 'days-yellow' : 'days-red');
    const colorHex = dias >= 5 ? '#4ADE80' : (dias >= 2 ? '#FBBF24' : '#F87171');
    const badgeClass = dias >= 5 ? 'green' : (dias >= 2 ? 'yellow' : 'red');
    return { fC, fCStr, fV, fVStr, dias, colorClass, colorHex, badgeClass };
}

// ═══════════════════════════════════════════════
// SCREEN 1: PROFILE LIST
// ═══════════════════════════════════════════════
let unsubProfiles = null;
let unsubClients  = null;
let profilesData  = [];
let clientsData   = [];

function initProfileList() {
    unsubProfiles = db.collection('perfiles').orderBy('ultima_actividad', 'desc').onSnapshot(snap => {
        profilesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderProfiles();
    });

    unsubClients = db.collection('clientes').onSnapshot(snap => {
        clientsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allClientsCache = clientsData;
        updateStats();
        renderProfiles();
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
        const { dias } = getDaysInfo(c.fecha_orden);
        if (dias <= 3) expiring++;
    });

    $('stat-total').textContent = totalProfiles;
    $('stat-expiring').textContent = expiring;
    $('mobile-stat-total').textContent = totalProfiles;
}

function renderProfiles() {
    const grid = $('profiles-grid');
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
            if (num.toLowerCase().includes(filter)) return true;
            if (clientsData.some(c => c.numero_cliente === num && (c.correo || '').toLowerCase().includes(filter))) return true;
            if (clientsData.some(c => c.numero_cliente === num && (c.tipo_cuenta || '').toLowerCase().includes(filter))) return true;
            const prof = profilesData.find(p => p.numero === num);
            if (prof && (prof.search_emails || '').toLowerCase().includes(filter)) return true;
            return false;
        });
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
        const clientAccounts = clientsData.filter(c => c.numero_cliente === num);
        const accountCount = clientAccounts.length;
        const services = [...new Set(clientAccounts.map(c => c.tipo_cuenta).filter(Boolean))];

        // Find nearest expiration
        let minDays = Infinity;
        clientAccounts.forEach(c => {
            const { dias } = getDaysInfo(c.fecha_orden);
            if (dias < minDays) minDays = dias;
        });

        const badgeClass = minDays >= 5 ? 'green' : (minDays >= 2 ? 'yellow' : 'red');
        const badgeHtml = accountCount > 0 && minDays < Infinity
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
                    ${services.length ? ' · ' + services.slice(0,3).join(', ') : ''}
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
        sorted = sorted.filter(d => (d.data().correo || '').toLowerCase().includes(filter));
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

        return `
        <div class="purchase-card" style="animation-delay:${idx * 0.07}s">
            <div class="card-top">
                <div class="card-top-left">
                    <h3>${escapeHtml(data.tipo_cuenta || 'Servicio')}</h3>
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
                        <div><div class="info-label">Correo</div><div class="info-value">${escapeHtml(data.correo || 'N/A')}</div></div>
                    </div>
                    <div class="info-item">
                        <span class="material-icons-round">key</span>
                        <div><div class="info-label">Contraseña</div><div class="info-value">${escapeHtml(data.contrasena || 'N/A')}</div></div>
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
    $('edit-correo').value = data.correo || '';
    $('edit-pass').value = data.contrasena || '';
    $('edit-pin').value = data.pin || '';

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
    $('edit-chips-servicio').innerHTML = servicios.map(s =>
        `<div class="chip ${editState.servicio === s ? 'selected' : ''}" data-val="${s}">${s}</div>`
    ).join('');
    $('edit-chips-servicio').querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => { editState.servicio = c.dataset.val; renderEditChips(); });
    });

    $('edit-chips-perfil').innerHTML = [1,2,3,4,5,6].map(p =>
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
        await db.collection('clientes').doc(editDocId).update({
            correo: $('edit-correo').value,
            contrasena: $('edit-pass').value,
            pin: $('edit-pin').value,
            tipo_cuenta: editState.servicio,
            perfil: editState.perfil,
            usuario: editState.tipo,
            fecha_orden: firebase.firestore.Timestamp.fromDate(fechaDate)
        });
        await updateProfileSearchData(currentProfileNumber);
        toast('Registro actualizado');
    } catch (e) { toast('Error: ' + e.message); }
    $('modal-edit').classList.add('hidden');
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
    const { fCStr, fVStr, dias } = getDaysInfo(data.fecha_orden);
    const msg = `¡Hola! Detalles de tu cuenta:\n\n` +
        `📺 *Servicio:* ${data.tipo_cuenta}\n` +
        `⭐ *Usuario:* ${data.correo}\n` +
        `🔒 *Contraseña:* ${data.contrasena}\n\n` +
        `👤 *Perfil:* ${data.perfil}\n` +
        `🔢 *PIN:* ${data.pin}\n` +
        `✅ *Tipo:* ${data.usuario}\n\n` +
        `📅 *Compra:* ${fCStr}\n` +
        `📆 *Vence:* ${fVStr}\n` +
        `⏳ *Quedan:* ${dias} días\n\n` +
        `Gracias! ✨`;
    const phone = currentProfileNumber.replace(/\+/g, '').replace(/ /g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ═══════════════════════════════════════════════
// SCREEN 3: FORM
// ═══════════════════════════════════════════════
let formState = { perfil: '1', tipo: 'Master', servicio: 'Netflix' };

function openForm(prefilledNumber) {
    $('form-numero').value = prefilledNumber || '';
    $('form-correo').value = '';
    $('form-pass').value = '';
    $('form-pin').value = '';
    formState = { perfil: '1', tipo: 'Master', servicio: 'Netflix' };

    $('field-numero').style.display = prefilledNumber ? 'none' : '';
    renderFormChips();
    showScreen('form');
}

function renderFormChips() {
    $('chips-perfil').innerHTML = [1,2,3,4,5,6].map(p =>
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

    $('chips-servicio').innerHTML = servicios.map(s =>
        `<div class="chip ${formState.servicio === s ? 'selected' : ''}" data-val="${s}">${s}</div>`
    ).join('');
    $('chips-servicio').querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => { formState.servicio = c.dataset.val; renderFormChips(); });
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

        await db.collection('clientes').add({
            numero_cliente: numero,
            correo: $('form-correo').value,
            contrasena: $('form-pass').value,
            tipo_cuenta: formState.servicio,
            usuario: formState.tipo,
            perfil: formState.perfil,
            pin: $('form-pin').value,
            fecha_orden: firebase.firestore.FieldValue.serverTimestamp()
        });

        await updateProfileSearchData(numero);
        toast('¡Registro guardado exitosamente!');

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
});
