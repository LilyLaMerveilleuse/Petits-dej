const calendarEl = document.getElementById("calendar");
const monthLabel = document.getElementById("month-label");
const prevBtn = document.getElementById("prev-month");
const nextBtn = document.getElementById("next-month");

const reserveDialog = document.getElementById("reserve-dialog");
const reserveDateEl = document.getElementById("reserve-date");
const reserveDescEl = document.getElementById("reserve-desc");
const reserveConfirmBtn = document.getElementById("reserve-confirm");

const loginDialog = document.getElementById("login-dialog");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const authArea = document.getElementById("auth-area");

const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Index du 1er jour du mois (0 = Lundi, ... 6 = Dimanche)
function firstDayIndex(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    return (d.getDay() + 6) % 7; // JS: 0=Dimanche → devient 6
}


let current = new Date();
current.setDate(1);
let me = null;

async function api(url, opts={}) {
    const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
    return res.json();
}

async function fetchMe() {
    const data = await api("/api/me");
    me = data.user;
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
            await api("/api/logout", { method: "POST" });
            me = null;
            renderAuth();
            renderCalendar();
        };

        authArea.append(who, logoutBtn);
    } else {
        const btn = document.createElement("button");
        btn.textContent = "Se connecter";
        btn.onclick = () => loginDialog.showModal();
        authArea.appendChild(btn);
    }
}


function yyyymm(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`; }
function yyyymmdd(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }

async function fetchMonthReservations(date) {
    const { reservations } = await api(`/api/reservations?month=${yyyymm(date)}`);
    return new Map(reservations.map(r => [r.date, r]));
}

async function renderCalendar() {
    calendarEl.innerHTML = "";
    monthLabel.textContent = `${dateLocale(current)}`;

    // 1) En-têtes "Lun...Dim"
    for (const name of dayNames) {
        const head = document.createElement("div");
        head.className = "day-name";
        head.textContent = name;
        calendarEl.appendChild(head);
    }

    // 2) Cases vides avant le 1er (pour aligner lundi en 1re colonne)
    const blanks = firstDayIndex(current);
    for (let i = 0; i < blanks; i++) {
        const blank = document.createElement("div");
        blank.className = "blank";
        calendarEl.appendChild(blank);
    }

    // 3) Jours du mois
    const resMap = await fetchMonthReservations(current);
    const total = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();

    for (let day = 1; day <= total; day++) {
        const d = new Date(current.getFullYear(), current.getMonth(), day);
        const iso = yyyymmdd(d);
        const weekday = dayNames[(d.getDay() + 6) % 7];

        const cell = document.createElement("div");
        cell.className = "day-cell";

        // Date (chiffre)
        const dateLabel = document.createElement("div");
        dateLabel.className = "date";
        dateLabel.textContent = String(day);
        cell.appendChild(dateLabel);

        // Jour de la semaine
        const weekdayEl = document.createElement("div");
        weekdayEl.className = "weekday";
        weekdayEl.textContent = weekday;
        cell.appendChild(weekdayEl);

        const res = resMap.get(iso);
        if (res) {
            const tag = document.createElement("div");
            tag.className = "taken";
            tag.textContent = res.username;
            cell.appendChild(tag);

            // Infobulle description au survol
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

            // Bouton annuler si c'est ma résa
            if (me && me.username === res.username) {
                const cancelBtn = document.createElement("button");
                cancelBtn.className = "cancel";
                cancelBtn.textContent = "Annuler";
                cancelBtn.onclick = async () => {
                    if (!confirm(`Annuler la réservation du ${iso} ?`)) return;
                    const resDel = await fetch(`/api/reservation/${iso}`, {
                        method: "DELETE",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" }
                    });
                    const data = await resDel.json().catch(() => ({}));
                    if (!resDel.ok) {
                        alert(data?.error || "Impossible d'annuler");
                        return;
                    }
                    renderCalendar();
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


// petite utilitaire pour éviter l'injection HTML
function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, m => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[m]));
}


function dateLocale(d) {
    return d.toLocaleString("fr-FR", { month: "long", year: "numeric" });
}

function openReserveDialog(iso) {
    if (!me) return loginDialog.showModal();
    reserveDateEl.textContent = iso;
    reserveDialog.showModal();
    reserveConfirmBtn.onclick = async () => {
        await api("/api/reserve", { method: "POST", body: JSON.stringify({ date: iso, description: reserveDescEl.value }) });
        reserveDialog.close();
        renderCalendar();
    };
}

prevBtn.onclick = () => { current.setMonth(current.getMonth()-1); renderCalendar(); };
nextBtn.onclick = () => { current.setMonth(current.getMonth()+1); renderCalendar(); };

loginDialog.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    await api("/api/register-or-login", { method: "POST", body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value }) });
    loginDialog.close();
    fetchMe();
    renderCalendar();
};

// Bouton annuler → juste fermer le dialog
document.getElementById("login-cancel").onclick = () => {
    loginDialog.close();
};

// Formulaire → login/register
loginDialog.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    try {
        await api("/api/register-or-login", {
            method: "POST",
            body: JSON.stringify({
                username: usernameInput.value,
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


fetchMe().then(renderCalendar);
