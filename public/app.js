// ===== Sélecteurs DOM =====
const calendarEl     = document.getElementById("calendar");
const monthLabel     = document.getElementById("month-label");
const prevBtn        = document.getElementById("prev-month");
const nextBtn        = document.getElementById("next-month");

const reserveDialog  = document.getElementById("reserve-dialog");
const reserveForm    = document.getElementById("reserve-form");
const reserveDateEl  = document.getElementById("reserve-date");
const reserveDescEl  = document.getElementById("reserve-desc");
const reserveCancel  = document.getElementById("reserve-cancel"); // si tu l'as ajouté

const loginDialog    = document.getElementById("login-dialog");
const loginForm      = document.getElementById("login-form");
const usernameInput  = document.getElementById("username");
const passwordInput  = document.getElementById("password");
const loginCancelBtn = document.getElementById("login-cancel");

const authArea       = document.getElementById("auth-area");

// ===== Constantes calendrier =====
const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// 0 = Lundi … 6 = Dimanche
function firstDayIndex(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    return (d.getDay() + 6) % 7; // JS: 0=Dimanche → 6
}
function daysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
function yyyymm(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function yyyymmdd(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateLocale(d) {
    return d.toLocaleString("fr-FR", { month: "long", year: "numeric" });
}
function weekdayLabel(d) {
    return dayNames[(d.getDay() + 6) % 7];
}

// ===== État =====
let current = new Date();
current.setDate(1);
let me = null;

// ===== Utilitaires =====
function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, m => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[m]));
}

// Appels API robustes (tolère une réponse non JSON)
async function api(url, opts = {}) {
    const res = await fetch(url, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...opts
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

// ===== Auth =====
async function fetchMe() {
    try {
        const { user } = await api("/api/me");
        me = user;
    } catch {
        me = null;
    }
    renderAuth();
}

function renderAuth() {
    authArea.innerHTML = "";
    if (me) {
        const who = document.createElement("span");
        who.textContent = "Connecté : " + me.username;

        const logoutBtn = document.createElement("button");
        logoutBtn.textContent = "Se déconnecter";
        logoutBtn.onclick = async () => {
            try {
                await api("/api/logout", { method: "POST" });
            } catch {}
            me = null;
            renderAuth();
            renderCalendar();
        };

        authArea.append(who, logoutBtn);
    } else {
        const btn = document.createElement("button");
        btn.textContent = "Se connecter";
        btn.onclick = () => {
            if (loginDialog) loginDialog.showModal();
            else alert("Fenêtre de connexion indisponible.");
        };
        authArea.appendChild(btn);
    }
}

// ===== Données calendrier =====
async function fetchMonthReservations(date) {
    try {
        const { reservations = [] } = await api(`/api/reservations?month=${yyyymm(date)}`);
        return new Map(reservations.map(r => [r.date, r]));
    } catch (e) {
        console.warn("Impossible de charger les réservations:", e.message);
        return new Map();
    }
}

// ===== Rendu calendrier =====
async function renderCalendar() {
    calendarEl.innerHTML = "";
    monthLabel.textContent = `${dateLocale(current)}`;

    // En-têtes des jours
    for (const name of dayNames) {
        const head = document.createElement("div");
        head.className = "day-name";
        head.textContent = name;
        calendarEl.appendChild(head);
    }

    // Cases vides pour aligner le 1er du mois
    const blanks = firstDayIndex(current);
    for (let i = 0; i < blanks; i++) {
        const blank = document.createElement("div");
        blank.className = "blank";
        calendarEl.appendChild(blank);
    }

    // Jours
    const resMap = await fetchMonthReservations(current);
    const total = daysInMonth(current);

    for (let day = 1; day <= total; day++) {
        const d = new Date(current.getFullYear(), current.getMonth(), day);
        const iso = yyyymmdd(d);

        const cell = document.createElement("div");
        cell.className = "day-cell";

        // Numéro du jour
        const dateLabel = document.createElement("div");
        dateLabel.className = "date";
        dateLabel.textContent = String(day);
        cell.appendChild(dateLabel);

        // Jour de la semaine (Lun/Mar/…)
        const weekdayEl = document.createElement("div");
        weekdayEl.className = "weekday";
        weekdayEl.textContent = weekdayLabel(d);
        cell.appendChild(weekdayEl);

        const res = resMap.get(iso);
        if (res) {
            const tag = document.createElement("div");
            tag.className = "taken";
            tag.textContent = res.username;
            cell.appendChild(tag);

            // Infobulle description
            if (res.description) {
                let tip;
                cell.addEventListener("mouseenter", () => {
                    tip = document.createElement("div");
                    tip.className = "tooltip";
                    tip.innerHTML = `<strong>${res.username}</strong><br>${escapeHtml(res.description)}`;
                    cell.appendChild(tip);
                });
                cell.addEventListener("mouseleave", () => tip && tip.remove());
            }

            // Bouton Annuler si c'est ma résa
            if (me && me.username === res.username) {
                const cancelBtn = document.createElement("button");
                cancelBtn.className = "cancel";
                cancelBtn.textContent = "Annuler";
                cancelBtn.onclick = async () => {
                    if (!confirm(`Annuler la réservation du ${iso} ?`)) return;
                    try {
                        const delRes = await fetch(`/api/reservation/${iso}`, {
                            method: "DELETE",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" }
                        });
                        const delData = await delRes.json().catch(() => ({}));
                        if (!delRes.ok) throw new Error(delData?.error || "Impossible d'annuler");
                        renderCalendar();
                    } catch (e) {
                        alert(e.message || "Erreur d'annulation");
                    }
                };
                cell.appendChild(cancelBtn);
            }
        } else {
            const btn = document.createElement("button");
            btn.className = "reserve";
            btn.textContent = "Réserver";
            btn.onclick = () => openReserveDialog(iso);
            cell.appendChild(btn);
        }

        calendarEl.appendChild(cell);
    }
}

// ===== Dialog Réservation =====
function openReserveDialog(iso) {
    if (!me) {
        if (loginDialog) loginDialog.showModal();
        return;
    }
    reserveDateEl.textContent = iso;
    reserveDescEl.value = "";
    reserveDialog.showModal();
}

// Si tu as mis un bouton #reserve-cancel dans le HTML
if (reserveCancel && reserveDialog) {
    reserveCancel.onclick = () => reserveDialog.close();
}

// Gérer la soumission du formulaire de réservation
if (reserveForm) {
    reserveForm.onsubmit = async (e) => {
        e.preventDefault();
        const iso = reserveDateEl.textContent;
        try {
            await api("/api/reserve", {
                method: "POST",
                body: JSON.stringify({
                    date: iso,
                    description: reserveDescEl.value.trim() || null
                })
            });
            reserveDialog.close();
            renderCalendar();
        } catch (err) {
            alert(err.message || "Impossible de réserver");
        }
    };
}

// ===== Dialog Login =====
if (loginCancelBtn && loginDialog) {
    loginCancelBtn.onclick = () => loginDialog.close();
}

if (loginForm && loginDialog) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        try {
            await api("/api/register-or-login", {
                method: "POST",
                body: JSON.stringify({
                    username: (usernameInput.value || "").trim(),
                    password: passwordInput.value
                })
            });
            loginDialog.close();
            fetchMe();
            renderCalendar();
        } catch (err) {
            alert(err.message || "Erreur de connexion");
        }
    };
}

// ===== Navigation mois =====
prevBtn.onclick = () => { current.setMonth(current.getMonth() - 1); renderCalendar(); };
nextBtn.onclick = () => { current.setMonth(current.getMonth() + 1); renderCalendar(); };

// ===== Démarrage =====
fetchMe().then(renderCalendar);
