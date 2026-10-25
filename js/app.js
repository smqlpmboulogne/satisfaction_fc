/* ============================================================
   Tableau de bord Satisfaction — Projet FC (Proxy Cloudflare)
   ============================================================ */

const API_URL = "https://proxy-satisfaction.smqlpmboulogne.workers.dev/?target=fc";

const NOMS_ENQUETES = {
  "Formations": "Formations"
};

const CACHE_PREFIX = "sat_dash_fc_v64_";
const CACHE_TTL    = 0; // Cache désactivé pour voir les nouvelles réponses immédiatement
const SHEETS_KEY   = "sat_sheets_fc_v64";
const SHEETS_TTL   = 60 * 60 * 1000;

let sheetsList = [];
let currentSheet = null;
let detailVerbatims = [];
let requeteId = 0;
const surveysData = {};

document.addEventListener("DOMContentLoaded", initialiser);

function initialiser() {
  document.getElementById("year").textContent = new Date().getFullYear();
  initialiserAnnees();
  
  document.getElementById("btnVerbatims").addEventListener("click", telechargerVerbatims);
  document.getElementById("btnPrint").addEventListener("click", imprimerRapport);
  
  document.getElementById("anneeScolaire").addEventListener("change", (e) => {
    appliquerAnneeScolaire(e.target.value);
    if (currentSheet) rechargerDetail(); else chargerToutesLesCartes();
  });

  ["dateDebut", "dateFin"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      synchroniserAnneeDepuisDates();
      if (currentSheet) rechargerDetail(); else chargerToutesLesCartes();
    });
  });

  window.addEventListener("hashchange", gererNavigation);
  chargerToutesLesCartes();
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

/* ---------- Navigation ---------- */
function gererNavigation() {
  const hash = window.location.hash;
  if (hash.startsWith("#detail/")) {
    const sheet = decodeURIComponent(hash.replace("#detail/", ""));
    if (currentSheet !== sheet) { currentSheet = sheet; afficherVueDetail(); }
  } else {
    if (currentSheet !== null) { currentSheet = null; afficherVueAccueil(); }
  }
}

function afficherVueAccueil() {
  document.getElementById("home-view").hidden = false;
  document.getElementById("detail-view").hidden = true;
  document.getElementById("page-title").textContent = "📊 Tableau de bord Satisfaction FC";
  document.getElementById("btnVerbatims").hidden = true;
  document.getElementById("verbCount").textContent = "0";
  
  const btnHome = document.getElementById("btnHome");
  if (btnHome) btnHome.style.display = "none";
  
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function afficherVueDetail() {
  document.getElementById("home-view").hidden = true;
  document.getElementById("detail-view").hidden = false;
  document.getElementById("page-title").textContent = "📊 " + nomEnquete(currentSheet);
  
  const btnHome = document.getElementById("btnHome");
  if (btnHome) btnHome.style.display = "inline-block";

  if (surveysData[currentSheet]) { afficherDetail(surveysData[currentSheet]); } else { rechargerDetail(); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function ouvrirDetail(sheet) { window.location.hash = "detail/" + encodeURIComponent(sheet); }

/* ---------- Helpers ---------- */
function nomEnquete(sheet) { return NOMS_ENQUETES[sheet] || String(sheet).replace(/^Enquete_/, "").replace(/_/g, " "); }
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
  if (opts.classe) url += "&classe=" + encodeURIComponent(opts.classe);
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

/* ---------- Chargement des cartes et du tableau ---------- */
async function chargerToutesLesCartes() {
  const id = ++requeteId;
  masquerMessage();
  
  const loadingHome = document.getElementById("loading-home");
  if (loadingHome) loadingHome.hidden = false;
  
  // On cible le conteneur du tableau
  let tableContainer = document.getElementById("table-container");
  if (!tableContainer) {
    tableContainer = document.createElement("div");
    tableContainer.id = "table-container";
    const homeView = document.getElementById("home-view");
    if (homeView) homeView.appendChild(tableContainer);
  }
  tableContainer.innerHTML = "";

  const globalBanner = document.getElementById("global-satisfaction");
  if (globalBanner) globalBanner.style.display = "none";

  try { if (!sheetsList.length) sheetsList = await getSheets(); } catch (err) {
    if (id !== requeteId) return;
    if (loadingHome) loadingHome.hidden = true;
    afficherMessage("❌ Impossible de lister les formations : " + err.message);
    return;
  }

  if (loadingHome) loadingHome.hidden = true;
  if (!sheetsList.length) { tableContainer.innerHTML = '<div class="box empty">Aucune formation disponible.</div>'; return; }
  document.getElementById("loading-home").hidden = true;
  if (!sheetsList.length) { zone.innerHTML = '<div class="box empty">Aucune formation disponible.</div>'; return; }

  const filters = getDateFilters();
  filters.summary = 1;
  sheetsList.forEach(sheet => zone.appendChild(squeletteCarte(sheet)));

  let totalReponsesGlobal = 0;
  let totalPointsGlobal = 0;
  const tableData = []; // Pour stocker les données du tableau

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
        
        tableData.push({
          nom: nomEnquete(sheet),
          reponses: data.reponses,
          refus: data.refus || 0,
          taux: hasNote ? data.satisfactionGlobale : null,
          id: sheet
        });
      }

      remplacerCarte(sheet, carteFinale(sheet, data));
    } catch (err) {
      if (id !== requeteId) return;
      remplacerCarte(sheet, carteErreur(sheet, err.message));
    }
  }));
  
  if (id === requeteId && totalReponsesGlobal > 0 && globalBanner) {
    const tauxMoyen = totalPointsGlobal / totalReponsesGlobal;
    const valEl = document.getElementById("global-rate-value");
    valEl.textContent = fmtPct(tauxMoyen);
    
    const lvl = niveau(tauxMoyen);
    globalBanner.className = "box accent detail-header " + lvl;
    globalBanner.style.display = "flex";
  }

  if (id === requeteId) {
    afficherTableauRecap(tableData, tableContainer);
  }

  majBadgeMAJ();
  gererNavigation();
}

function squeletteCarte(sheet) {
  const card = document.createElement("div");
  card.className = "box accent survey-card";
  card.dataset.sheet = sheet;
  card.innerHTML = '<div class="name">' + escapeHtml(nomEnquete(sheet)) + '</div><div class="rate" style="color:var(--muted)">…</div><div class="meta-line"><span>Chargement…</span></div>';
  return card;
}

function remplacerCarte(sheet, newCard) {
  const old = document.querySelector('.survey-card[data-sheet="' + CSS.escape(sheet) + '"]');
  if (old) old.replaceWith(newCard);
}

function carteFinale(sheet, data) {
  const ok = data && data.success !== false && (data.reponses || 0) > 0;
  const hasNote = ok && (data.hasNote || (data.criteresNote && data.criteresNote.length > 0));
  const levelClass = hasNote ? niveau(data.satisfactionGlobale) : "";
  const card = document.createElement("div");
  card.dataset.sheet = sheet;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.className = "box accent survey-card" + (levelClass ? " " + levelClass : "");
  if (!ok) card.classList.add("empty");
  if (ok && !hasNote) card.classList.add("no-notes");

  let rateTxt = "—", metaTxt = "Aucune réponse";
  
  if (data && data.success === false) { 
    rateTxt = "⚠"; 
    metaTxt = "Erreur"; 
  } 
  else if (ok) {
    let txtReponses = data.reponses + " réponse" + (data.reponses > 1 ? "s" : "");
    if (data.refus && Number(data.refus) > 0) {
      txtReponses += " • " + data.refus + " refus";
    }
    rateTxt = hasNote ? fmtPct(data.satisfactionGlobale) : (data.nps ? data.nps.npsScore + " NPS" : "N/A"); 
    metaTxt = txtReponses; 
  }

  card.innerHTML = '<div class="name">' + escapeHtml(nomEnquete(sheet)) + '</div><div class="rate">' + escapeHtml(rateTxt) + '</div><div class="meta-line"><span>' + escapeHtml(metaTxt) + '</span><span class="arrow">→</span></div>';
  card.addEventListener("click", () => ouvrirDetail(sheet));
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrirDetail(sheet); } });
  return card;
}

function carteErreur(sheet, msg) {
  const card = document.createElement("div");
  card.dataset.sheet = sheet;
  card.className = "box accent survey-card empty";
  card.innerHTML = '<div class="name">' + escapeHtml(nomEnquete(sheet)) + '</div><div class="rate">⚠</div><div class="meta-line"><span>Erreur</span></div>';
  return card;
}

function majBadgeMAJ() {
  document.getElementById("updated-date").textContent = new Date().toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  document.getElementById("updated").classList.add("on");
}

/* ---------- Tableau Récapitulatif ---------- */
function afficherTableauRecap(data, container) {
  if (!data.length) return;

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
      return `<th data-key="${key}" style="cursor:pointer; user-select:none; text-align:left; padding: 10px; background: #e3edf5; color: #1e3a5f; border-bottom: 2px solid #c9d9e8;">${label}${arrow}</th>`;
    };

    let html = `<div class="box accent" style="padding: 0; overflow: hidden; margin-top: 20px;">
      <div style="padding: 15px 20px; border-bottom: 1px solid #e3edf5;">
        <h2 style="margin: 0; font-size: 18px; color: #1e3a5f;">📋 Récapitulatif par formation</h2>
      </div>
      <div class="table-wrap" style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr>
              ${th("nom", "Formation")}
              ${th("reponses", "Réponses")}
              ${th("refus", "Refus")}
              ${th("taux", "Taux de satisfaction")}
            </tr>
          </thead>
          <tbody>`;

    sorted.forEach(row => {
      const tauxTxt = row.taux === null ? "N/A" : fmtPct(row.taux);
      const color = row.taux === null ? "var(--muted)" : `var(--${niveau(row.taux) === 'high' ? 'success' : niveau(row.taux) === 'mid' ? 'warning' : 'danger'})`;
      
      html += `<tr style="border-bottom: 1px solid #f0f5fa; cursor: pointer; transition: background 0.2s;" onclick="ouvrirDetail('${row.id}')" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <td style="padding: 12px 10px; font-weight: 600; color: #1e3a5f;">${escapeHtml(row.nom)}</td>
        <td style="padding: 12px 10px;">${row.reponses}</td>
        <td style="padding: 12px 10px; color: var(--muted);">${row.refus > 0 ? row.refus : "—"}</td>
        <td style="padding: 12px 10px; font-weight: 700; color: ${color};">${tauxTxt}</td>
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

/* ---------- Rendu du Détail ---------- */
async function rechargerDetail() {
  if (!currentSheet) return;
  const id = ++requeteId;
  const filters = getDateFilters();
  document.getElementById("detail-content").innerHTML = '<div class="loading"><div class="spin"></div><div>Chargement complet…</div></div>';
  try {
    const data = await fetchDashboard(currentSheet, filters);
    if (id !== requeteId) return;
    afficherDetail(data);
  } catch (err) {
    if (id !== requeteId) return;
    afficherMessage("❌ Erreur : " + err.message);
  }
}

function imprimerRapport() { 
  const list = document.getElementById('verbatims-list');
  if (list) list.hidden = false;
  window.print(); 
  setTimeout(() => {
    const listAfter = document.getElementById('verbatims-list');
    if (listAfter) listAfter.hidden = true;
  }, 1000);
}

function afficherDetail(data) {
  const zone = document.getElementById("detail-content");
  zone.innerHTML = "";
  
  document.getElementById("btnVerbatims").hidden = true;

  if (!data || data.success === false) {
    zone.innerHTML = '<div class="box empty">⚠ ' + escapeHtml((data && data.message) || "Données indisponibles") + '</div>';
    detailVerbatims = []; return;
  }

  detailVerbatims = data.verbatims || [];

  const ok = (data.reponses || 0) > 0;
  const hasNote = (data.criteresNote || []).length > 0;
  const levelClass = hasNote ? niveau(data.satisfactionGlobale) : "";

  const header = document.createElement("div");
  header.className = "box accent detail-header" + (levelClass ? " " + levelClass : "");
  
  let subText = ok ? '<b>' + data.reponses + '</b> réponse' + (data.reponses > 1 ? 's' : '') : 'Aucune réponse';
  if (data.refus && Number(data.refus) > 0) {
    subText += ' <span style="font-size: 0.9em; color: var(--muted);">• ' + data.refus + ' refus</span>';
  }

  header.innerHTML = '<div class="info"><div class="eyebrow">Formation</div><h1>' + escapeHtml(nomEnquete(data.enquete || currentSheet)) + '</h1><div class="sub">' + subText + '</div></div><div class="rate-block"><div class="label">Taux moyen</div><div class="value">' + (!ok ? '—' : (!hasNote ? 'N/A' : fmtPct(data.satisfactionGlobale))) + '</div></div>';
  zone.appendChild(header);

  if (data.nps) zone.appendChild(carteNPS(data.nps));
  const notes = (data.criteres || []).filter(c => c.type === "note");
  if (notes.length) zone.appendChild(construireGraphiqueCriteres(notes));
  
  if ((data.classesDetail || []).length && hasNote) {
    zone.appendChild(construireTableauClasses(data));
  }

  if (detailVerbatims.length > 0) {
    const verbCard = document.createElement("div");
    verbCard.className = "card";
    
    const listHtml = `
      <div style="line-height: 1.6; font-size: 14px; text-align: justify; padding: 5px;">
        ${detailVerbatims.map(v => escapeHtml(v)).join(" - ")}
      </div>
    `;
    
    verbCard.innerHTML = `
      <h2>Verbatims</h2>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:15px; margin-bottom:15px;">
        <button class="btn dark" onclick="telechargerVerbatims()">📥 Télécharger (.txt)</button>
        <button class="btn" onclick="toggleVerbatims()" style="background:#e3edf5; color:#1e3a5f; border-color:#7fb3d9;">👁 Afficher / Masquer</button>
        <button class="btn" onclick="gererIA('${data.enquete || currentSheet}', 'google')" style="background:#f3f4f6; color:#1e3a5f; border-color:#d1d5db;">🔍 Google (AI Overview)</button>
        <button class="btn" onclick="gererIA('${data.enquete || currentSheet}', 'duckai')" style="background:#f3f4f6; color:#1e3a5f; border-color:#d1d5db;">🦆 Duck.ai</button>
        <button class="btn" onclick="gererIA('${data.enquete || currentSheet}', 'qwant')" style="background:#f3f4f6; color:#1e3a5f; border-color:#d1d5db;">🔍 Qwant Chat</button>
        <button class="btn" onclick="afficherPrompt('${data.enquete || currentSheet}')" style="background:#f3f4f6; color:#1e3a5f; border-color:#d1d5db;">📄 Afficher le prompt</button>
      </div>
      <div id="verbatims-list" hidden style="background:var(--ecume); padding:15px 20px; border-radius:8px; border-left:4px solid var(--azur);">
        ${listHtml}
      </div>
    `;
    zone.appendChild(verbCard);
  } else {
    const verbCard = document.createElement("div");
    verbCard.className = "card";
    verbCard.innerHTML = `<h2>Verbatims</h2><p style="color:var(--muted); font-size:13px; margin-top:10px;">Aucun verbatim disponible pour cette sélection.</p>`;
    zone.appendChild(verbCard);
  }

  if (data.evolution && data.evolution.length > 0) {
    const evoCard = document.createElement("div");
    evoCard.className = "card";
    const svg = genererSVGEvolution(data.evolution);
    evoCard.innerHTML = `
      <h2>Évolution de la satisfaction</h2>
      <div style="margin-top:15px; overflow-x:auto;">
        ${svg}
      </div>
      <div style="margin-top:15px;">
        <button class="btn" onclick="telechargerEvolutionPNG('${btoa(encodeURIComponent(JSON.stringify(data.evolution)))}')">⬇ Télécharger l'image</button>
      </div>
    `;
    zone.appendChild(evoCard);
  }
}

/* ---------- Fonctions Verbatims & IA ---------- */
function toggleVerbatims() {
  const el = document.getElementById('verbatims-list');
  if (el) el.hidden = !el.hidden;
}

function getPromptText(sheet) {
  const nom = nomEnquete(sheet);
  return `Pour l'enquête "${nom}" :\n- ${detailVerbatims.join("\n- ")}\n\n1. Analyse satisfaction (court). 2. Préciser "autres" cités (ce sont des moyens utilisés pour communiquer, corriger fautes). 3. Plan d'actions (court).`;
}

function afficherPrompt(sheet) {
  if (!detailVerbatims.length) return;
  const prompt = getPromptText(sheet);
  const win = window.open('', '_blank');
  if (!win) { alert("Autorisez les pop-ups."); return; }
  win.document.write(`
    <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Prompt - ${nomEnquete(sheet)}</title>
    <style>body { font-family: system-ui, sans-serif; padding: 40px; background: #f0f5fa; color: #1a2a3a; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    h1 { color: #1e3a5f; margin-top: 0; }
    pre { background: #f8fafc; padding: 20px; border: 1px solid #d8e3ed; border-radius: 8px; white-space: pre-wrap; font-family: monospace; font-size: 14px; line-height: 1.5; }
    button { background: #5fa02c; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; margin-top: 15px; }
    button:hover { background: #4a8221; }</style></head>
    <body><div class="container"><h1>📄 Prompt généré</h1><p>Copiez ce texte et collez-le dans l'IA de votre choix.</p>
    <pre id="prompt-text">${escapeHtml(prompt)}</pre>
    <button onclick="document.getElementById('prompt-text').select(); document.execCommand('copy'); alert('✅ Copié !');">📋 Copier le prompt</button></div></body></html>
  `);
  win.document.close();
}

function gererIA(sheet, mode) {
  if (!detailVerbatims.length) return;
  const prompt = getPromptText(sheet);
  const copierTexte = (texte) => {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texte);
    else {
      let textArea = document.createElement("textarea"); textArea.value = texte; textArea.style.position = "fixed"; textArea.style.left = "-999999px"; textArea.style.top = "-999999px";
      document.body.appendChild(textArea); textArea.focus(); textArea.select();
      try { document.execCommand('copy'); return Promise.resolve(); } catch (err) { return Promise.reject(err); } finally { textArea.remove(); }
    }
  };

  if (mode === 'google') {
    const googleUrl = "https://www.google.com/search?q=" + encodeURIComponent(prompt);
    if (googleUrl.length < 1800) window.open(googleUrl, '_blank');
    else copierTexte(prompt).then(() => { alert("Le prompt est trop long pour Google. Il a été copié dans le presse-papiers."); window.open("https://www.google.com", '_blank'); });
  } 
  else if (mode === 'duckai') {
    const duckUrl = "https://duck.ai/chat?ia=chat&q=" + encodeURIComponent(prompt);
    if (duckUrl.length < 1800) window.open(duckUrl, '_blank');
    else copierTexte(prompt).then(() => { alert("Le prompt est trop long pour Duck.ai. Il a été copié dans le presse-papiers."); window.open("https://duck.ai/chat", '_blank'); });
  }
  else if (mode === 'qwant') {
    const qwantUrl = "https://www.qwant.com/?q=" + encodeURIComponent(prompt) + "&t=chat";
    if (qwantUrl.length < 1800) window.open(qwantUrl, '_blank');
    else copierTexte(prompt).then(() => { alert("Le prompt est trop long pour Qwant. Il a été copié dans le presse-papiers."); window.open("https://www.qwant.com/?t=chat", '_blank'); });
  }
}

/* ---------- Composants Graphiques ---------- */
function genererSVGEvolution(evolution) {
  const w = Math.max(500, evolution.length * 80), h = 260, pL = 45, pR = 20, pT = 20, pB = 40;
  const cW = w - pL - pR, cH = h - pT - pB;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="width:100%; max-width:${w}px; height:auto; font-family:system-ui, sans-serif;">`;
  for (let i = 0; i <= 4; i++) {
    const val = i * 25, y = pT + cH - (val / 100) * cH;
    svg += `<line x1="${pL}" y1="${y}" x2="${w - pR}" y2="${y}" stroke="#e3edf5" stroke-width="1" /><text x="${pL - 10}" y="${y + 4}" fill="#6b8097" font-size="11" text-anchor="end">${val}%</text>`;
  }
  let points = [];
  const stepX = evolution.length > 1 ? cW / (evolution.length - 1) : cW / 2, offsetX = evolution.length > 1 ? 0 : cW / 2;
  evolution.forEach((d, i) => {
    const x = pL + (i * stepX) + offsetX, y = pT + cH - (d.satisfaction / 100) * cH;
    points.push({ x, y, val: d.satisfaction, label: d.label });
  });
  if (points.length > 1) {
    const pathD = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
    svg += `<path d="${pathD}" fill="none" stroke="#4a90c4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
  }
  points.forEach((p, i) => {
    svg += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="#4a90c4" stroke-width="3" /><text x="${p.x}" y="${p.y - 12}" fill="#1e3a5f" font-size="12" font-weight="700" text-anchor="middle">${fmtPct(p.val)}</text><text x="${p.x}" y="${h - 15}" fill="#6b8097" font-size="11" text-anchor="middle">${p.label}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function telechargerEvolutionPNG(evolutionBase64) {
  const evolution = JSON.parse(decodeURIComponent(atob(evolutionBase64)));
  const svgStr = genererSVGEvolution(evolution);
  const blob = new Blob([svgStr], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width * 2; canvas.height = img.height * 2;
    const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png'); a.download = 'Evolution_satisfaction_' + new Date().toISOString().slice(0, 10) + '.png';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  img.src = url;
}

function carteNPS(nps) {
  const card = document.createElement("div");
  card.className = "card";
  let color = "var(--danger)", label = "Problème (< 0)";
  if (nps.npsScore > 50) { color = "var(--success)"; label = "Excellent (> 50)"; }
  else if (nps.npsScore >= 0) { color = "var(--warning)"; label = "Bon (0 à 50)"; }
  const pP = Math.round((nps.promoteurs / nps.nb) * 100) || 0, pA = Math.round((nps.passifs / nps.nb) * 100) || 0, pD = Math.round((nps.detracteurs / nps.nb) * 100) || 0;
  card.innerHTML = `<h2>Net Promoter Score (NPS)</h2><div style="display:flex; flex-wrap:wrap; gap:20px; align-items:center; padding-top: 10px;"><div style="flex:1; min-width:200px; text-align:center; padding:20px; background:var(--ecume); border-radius:12px; border-left:5px solid ${color};"><div style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Score NPS</div><div style="font-size:48px; font-weight:800; color:${color}; line-height:1;">${nps.npsScore}</div><div style="font-size:13px; font-weight:700; color:${color}; margin-top:8px;">${label}</div></div><div style="flex:2; min-width:250px;"><div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px;"><span style="font-weight:600; color:var(--success);">Promoteurs (9-10)</span><span style="font-weight:700;">${nps.promoteurs} <small style="color:var(--muted); font-weight:400;">(${pP}%)</small></span></div><div style="height:8px; background:var(--ecume-2); border-radius:4px; margin-bottom:12px; overflow:hidden;"><div style="width:${pP}%; background:var(--success); height:100%; border-radius:4px;"></div></div><div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px;"><span style="font-weight:600; color:var(--warning);">Passifs (7-8)</span><span style="font-weight:700;">${nps.passifs} <small style="color:var(--muted); font-weight:400;">(${pA}%)</small></span></div><div style="height:8px; background:var(--ecume-2); border-radius:4px; margin-bottom:12px; overflow:hidden;"><div style="width:${pA}%; background:var(--warning); height:100%; border-radius:4px;"></div></div><div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px;"><span style="font-weight:600; color:var(--danger);">Détracteurs (0-6)</span><span style="font-weight:700;">${nps.detracteurs} <small style="color:var(--muted); font-weight:400;">(${pD}%)</small></span></div><div style="height:8px; background:var(--ecume-2); border-radius:4px; overflow:hidden;"><div style="width:${pD}%; background:var(--danger); height:100%; border-radius:4px;"></div></div></div></div>`;
  return card;
}

function construireGraphiqueCriteres(notes) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = "<h2>Taux de satisfaction par critère</h2>";
  const container = document.createElement("div");
  container.className = "chart-container";
  notes.forEach(c => {
    const lvl = niveau(c.satisfaction);
    const row = document.createElement("div");
    row.className = "chart-row " + lvl;
    row.innerHTML = '<div class="chart-label" title="' + escapeHtml(c.label) + '">' + escapeHtml(c.label) + '</div><div class="chart-bar-wrap"><div class="chart-bar" style="width:0%" data-w="' + Math.max(0, Math.min(100, c.satisfaction)) + '"></div></div><div class="chart-value">' + fmtPct(c.satisfaction) + '</div>';
    container.appendChild(row);
  });
  card.appendChild(container);
  setTimeout(() => { card.querySelectorAll('.chart-bar').forEach(bar => { bar.style.width = bar.dataset.w + "%"; }); }, 50);
  return card;
}

function construireTableauClasses(data) {
  const card = document.createElement("div");
  card.className = "card";
  let cols = data.criteresNote || [];
  if (!cols.length) {
     cols = Object.keys(data.classesDetail[0].criteres || {});
  }
  let sortKey = "nom", sortAsc = true;
  const render = () => {
    const sorted = [...data.classesDetail];
    sorted.sort((a, b) => {
      let v1, v2;
      if (sortKey === "nom") { v1 = a.nom; v2 = b.nom; }
      else if (sortKey === "nb") { v1 = a.nb; v2 = b.nb; }
      else if (sortKey === "global") { v1 = a.satisfactionGlobale; v2 = b.satisfactionGlobale; }
      else { v1 = a.criteres[sortKey] ?? -1; v2 = b.criteres[sortKey] ?? -1; }
      if (typeof v1 === "string") return sortAsc ? v1.localeCompare(v2, "fr") : v2.localeCompare(v1, "fr");
      return sortAsc ? v1 - v2 : v2 - v1;
    });
    const th = (key, label) => {
      const arrow = sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';
      const style = sortKey === key ? 'color: #fff; text-decoration: underline;' : '';
      return `<th data-key="${key}" style="cursor:pointer; user-select:none;"><span style="${style}">${label}${arrow}</span></th>`;
    };
    let html = '<div class="table-wrap"><table><thead><tr>' + th("nom", "Formation") + th("nb", "Réponses");
    cols.forEach(c => html += th(c, c));
    html += th("global", "Taux moyen") + '</tr></thead><tbody>';
    sorted.forEach(c => {
      html += `<tr><td>${escapeHtml(c.nom)}</td><td>${c.nb}</td>`;
      cols.forEach(k => { html += `<td>${c.criteres[k] == null ? "—" : fmtPct(c.criteres[k])}</td>`; });
      html += `<td class="rate-cell">${fmtPct(c.satisfactionGlobale)}</td></tr>`;
    });
    html += '</tbody></table></div>';
    card.innerHTML = "<h2>Détail par formation</h2>" + html;
    card.querySelectorAll("th[data-key]").forEach(el => {
      el.addEventListener("click", () => {
        const k = el.dataset.key;
        if (sortKey === k) sortAsc = !sortAsc;
        else { sortKey = k; sortAsc = true; }
        render();
      });
    });
  };
  render();
  return card;
}

function telechargerVerbatims() {
  if (!detailVerbatims.length) return;
  const now = new Date(), annee = now.getFullYear(), enquete = currentSheet || "enquete";
  const nomFichier = "Verbatims_" + enquete.replace(/[^a-zA-Z0-9]/g, "_") + "_" + now.toISOString().slice(0, 10) + ".txt";
  const entete = "VERBATIMS — " + nomEnquete(enquete) + "\nExporté le " + now.toLocaleString("fr-FR") + "\nNombre d'entrées : " + detailVerbatims.length + "\n" + "=".repeat(64) + "\n\n";
  const corps = detailVerbatims.map((v, i) => (i + 1) + ". " + v).join("\n\n");
  const pied = "\n\n" + "=".repeat(64) + "\nConception et réalisation : ZEG — Lycée Maritime Boulogne, " + annee + "\nProjet réalisé dans le cadre du pacte enseignant\n";
  const blob = new Blob([entete + corps + pied], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nomFichier;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
