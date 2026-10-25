/* ============================================================
   Tableau de bord PUBLIC — Projet FC (Proxy Cloudflare)
   ============================================================ */

const API_URL = "https://proxy-satisfaction.smqlpmboulogne.workers.dev/?target=fc";

const CACHE_PREFIX = "sat_public_fc_v1_";
const CACHE_TTL    = 0; 
const SHEETS_KEY   = "sat_sheets_public_fc_v1";
const SHEETS_TTL   = 60 * 60 * 1000;

let sheetsList = [];
let requeteId = 0;

document.addEventListener("DOMContentLoaded", initialiser);

function initialiser() {
  document.getElementById("year").textContent = new Date().getFullYear();
  initialiserAnnees();
  
  document.getElementById("anneeScolaire").addEventListener("change", (e) => {
    appliquerAnneeScolaire(e.target.value);
    chargerDonneesPubliques();
  });

  ["dateDebut", "dateFin"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      synchroniserAnneeDepuisDates();
      chargerDonneesPubliques();
    });
  });

  chargerDonneesPubliques();
}

/* ---------- Gestion de l'Année Scolaire ---------- */
function getCurrentSchoolYear() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const startYear = m >= 8 ? y : y - 1;
  return startYear + "-" + (startYear + 1);
}

function initialiserAnnees() {
  const curr = getCurrentSchoolYear();
  const [sy] = curr.split("-");
  const select = document.getElementById("anneeScolaire");
  let opts = `<option value="${curr}">${curr}</option>`;
  for (let i = 1; i <= 3; i++) {
    let s = parseInt(sy) - i, e = s + 1;
    opts += `<option value="${s}-${e}">${s}-${e}</option>`;
  }
  opts += `<option value="all">Toutes les périodes</option>`;
  select.innerHTML = opts;
  select.value = curr;
  appliquerAnneeScolaire(curr);
}

function appliquerAnneeScolaire(val) {
  const debutInput = document.getElementById("dateDebut");
  const finInput = document.getElementById("dateFin");
  if (val === "all") { debutInput.value = ""; finInput.value = ""; }
  else {
    const [sy, ey] = val.split("-");
    debutInput.value = `${sy}-09-01`;
    finInput.value = `${ey}-08-31`;
  }
}

function synchroniserAnneeDepuisDates() {
  const debut = document.getElementById("dateDebut").value;
  const fin = document.getElementById("dateFin").value;
  const select = document.getElementById("anneeScolaire");
  if (!debut && !fin) { select.value = "all"; return; }
  if (debut && fin) {
    const val = `${debut.substring(0, 4)}-${fin.substring(0, 4)}`;
    if (select.querySelector(`option[value="${val}"]`)) { select.value = val; return; }
  }
  select.value = "all";
}

/* ---------- Helpers ---------- */
function nomEnquete(sheet) { return String(sheet).replace(/^Enquete_/, "").replace(/_/g, " "); }
function niveau(v) { if (v == null || Number.isNaN(v)) return ""; if (v >= 75) return "high"; if (v >= 50) return "mid"; return "low"; }
function fmtPct(v) { const n = Number(v); return (Number.isFinite(n) ? n : 0).toFixed(2) + "%"; }
function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]); }

function afficherMessage(txt) { const m = document.getElementById("message"); m.textContent = txt; m.style.display = "block"; }
function masquerMessage() { document.getElementById("message").style.display = "none"; }

/* ---------- Cache Client ---------- */
function cacheKey(sheet, opts) { return CACHE_PREFIX + sheet + "_" + JSON.stringify(opts || {}); }
function lireCache(key) { try { const raw = localStorage.getItem(key); if (!raw) return null; const o = JSON.parse(raw); if (Date.now() - o.t > CACHE_TTL) { localStorage.removeItem(key); return null; } return o.d; } catch (e) { return null; } }
function ecrireCache(key, data) { try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {} }

/* ---------- API Fetches ---------- */
function getDateFilters() { return { start: document.getElementById("dateDebut").value, end: document.getElementById("dateFin").value }; }

function buildUrl(sheet, opts = {}) {
  let url = API_URL + "&action=dashboard&sheet=" + encodeURIComponent(sheet);
  if (opts.summary) url += "&summary=1";
  if (opts.start)  url += "&start="  + encodeURIComponent(opts.start);
  if (opts.end)    url += "&end="    + encodeURIComponent(opts.end);
  return url;
}

async function fetchJson(url) { 
  try {
    const urlSansCache = url + "&nocache=" + Date.now();
    const rep = await fetch(urlSansCache, { cache: "no-store" }); 
    if (!rep.ok) throw new Error("HTTP " + rep.status); 
    return rep.json(); 
  } catch(e) {
    throw new Error(`Réseau/CORS sur ${url} : ${e.message}`);
  }
}

async function getSheets() {
  try { const raw = localStorage.getItem(SHEETS_KEY); if (raw) { const o = JSON.parse(raw); if (Date.now() - o.t < SHEETS_TTL && Array.isArray(o.d)) return o.d; } } catch (e) {}
  
  const j = await fetchJson(API_URL + "&action=sheets");
  if (j.success === false) throw new Error(j.message);
  
  const sheets = j.sheets || [];
  try { localStorage.setItem(SHEETS_KEY, JSON.stringify({ t: Date.now(), d: sheets })); } catch (e) {}
  return sheets;
}

async function fetchDashboard(sheet, opts) {
  const key = cacheKey(sheet, opts);
  const cached = lireCache(key);
  if (cached) return cached;
  const data = await fetchJson(buildUrl(sheet, opts));
  ecrireCache(key, data);
  return data;
}

/* ---------- Chargement et affichage ---------- */
async function chargerDonneesPubliques() {
  const id = ++requeteId;
  masquerMessage();
  
  const loadingHome = document.getElementById("loading-home");
  if (loadingHome) loadingHome.hidden = false;
  
  let tableContainer = document.getElementById("table-container");
  if (!tableContainer) {
    tableContainer = document.createElement("div");
    tableContainer.id = "table-container";
    const homeView = document.getElementById("home-view");
    if (homeView) homeView.appendChild(tableContainer);
  }
  if (tableContainer) tableContainer.innerHTML = "";

  const globalBanner = document.getElementById("global-satisfaction");
  if (globalBanner) globalBanner.style.display = "none";

  try { if (!sheetsList.length) sheetsList = await getSheets(); } catch (err) {
    if (id !== requeteId) return;
    if (loadingHome) loadingHome.hidden = true;
    afficherMessage("❌ Impossible de charger les résultats : " + err.message);
    return;
  }

  if (loadingHome) loadingHome.hidden = true;
  
  if (!sheetsList.length) { 
    if (tableContainer) tableContainer.innerHTML = '<div class="box empty">Aucune formation disponible.</div>'; 
    return; 
  }

  const filters = getDateFilters();
  filters.summary = 1;
  
  let totalReponsesGlobal = 0;
  let totalPointsGlobal = 0;
  const tableData = [];

  await Promise.all(sheetsList.map(async sheet => {
    try {
      const data = await fetchDashboard(sheet, filters);
      if (id !== requeteId) return;
      
      if (data && data.success !== false && (data.reponses || 0) > 0) {
        const hasNote = data.hasNote || (data.criteresNote && data.criteresNote.length > 0);
        if (hasNote && typeof data.satisfactionGlobale === 'number') {
          totalReponsesGlobal += data.reponses;
          totalPointsGlobal += (data.satisfactionGlobale * data.reponses);
        }
        
        // On ne garde que le nom et le taux pour le public
        tableData.push({
          nom: nomEnquete(sheet),
          taux: hasNote ? data.satisfactionGlobale : null
        });
      }
    } catch (err) {
      console.error("Erreur sur la formation " + sheet, err);
    }
  }));
  
  if (id === requeteId && totalReponsesGlobal > 0 && globalBanner) {
    const tauxMoyen = totalPointsGlobal / totalReponsesGlobal;
    const valEl = document.getElementById("global-rate-value");
    if (valEl) valEl.textContent = fmtPct(tauxMoyen);
    
    const lvl = niveau(tauxMoyen);
    globalBanner.className = "box accent detail-header " + lvl;
    globalBanner.style.display = "flex";
  }

  if (id === requeteId && tableContainer) {
    afficherTableauPublic(tableData, tableContainer);
  }

  majBadgeMAJ();
}

function majBadgeMAJ() {
  document.getElementById("updated-date").textContent = new Date().toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  document.getElementById("updated").classList.add("on");
}

/* ---------- Tableau Public (Sans clic, sans données sensibles) ---------- */
function afficherTableauPublic(data, container) {
  if (!data.length) {
    container.innerHTML = '<div class="box empty">Aucune donnée à afficher pour cette période.</div>';
    return;
  }

  let sortKey = "nom";
  let sortAsc = true;

  const renderTable = () => {
    const sorted = [...data].sort((a, b) => {
      let v1 = a[sortKey];
      let v2 = b[sortKey];
      
      if (v1 === null) v1 = -1;
      if (v2 === null) v2 = -1;

      if (typeof v1 === "string") {
        return sortAsc ? v1.localeCompare(v2, "fr") : v2.localeCompare(v1, "fr");
      }
      return sortAsc ? v1 - v2 : v2 - v1;
    });

    const th = (key, label) => {
      const arrow = sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';
      return `<th data-key="${key}" style="cursor:pointer; user-select:none; text-align:left; padding: 15px 20px; background: #e3edf5; color: #1e3a5f; border-bottom: 2px solid #c9d9e8;">${label}${arrow}</th>`;
    };

    let html = `<div class="box accent" style="padding: 0; overflow: hidden; margin-top: 20px;">
      <div style="padding: 15px 20px; border-bottom: 1px solid #e3edf5;">
        <h2 style="margin: 0; font-size: 18px; color: #1e3a5f;">📋 Récapitulatif par formation</h2>
      </div>
      <div class="table-wrap" style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
          <thead>
            <tr>
              ${th("nom", "Formation")}
              ${th("taux", "Taux de satisfaction")}
            </tr>
          </thead>
          <tbody>`;

    sorted.forEach(row => {
      const tauxTxt = row.taux === null ? "N/A" : fmtPct(row.taux);
      const color = row.taux === null ? "var(--muted)" : `var(--${niveau(row.taux) === 'high' ? 'success' : niveau(row.taux) === 'mid' ? 'warning' : 'danger'})`;
      
      // Ligne sans curseur "pointer" et sans événement onclick
      html += `<tr style="border-bottom: 1px solid #f0f5fa;">
        <td style="padding: 15px 20px; font-weight: 600; color: #1e3a5f;">${escapeHtml(row.nom)}</td>
        <td style="padding: 15px 20px; font-weight: 700; color: ${color}; font-size: 16px;">${tauxTxt}</td>
      </tr>`;
    });

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;

    container.querySelectorAll("th[data-key]").forEach(el => {
      el.addEventListener("click", () => {
        const k = el.dataset.key;
        if (sortKey === k) sortAsc = !sortAsc;
        else { sortKey = k; sortAsc = true; }
        renderTable();
      });
    });
  };

  renderTable();
}
