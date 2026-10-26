/* ============================================================
   Tableau de bord PUBLIC — Projet FC (Proxy Cloudflare)
   ============================================================ */

const API_URL = "https://proxy-satisfaction.smqlpmboulogne.workers.dev/?target=fc";

let requeteId = 0;

document.addEventListener("DOMContentLoaded", initialiser);

function initialiser() {
  document.getElementById("year").textContent = new Date().getFullYear();
  chargerDonneesPubliques();
}

/* ---------- Helpers ---------- */
function niveau(v) { if (v == null || Number.isNaN(v)) return ""; if (v >= 75) return "high"; if (v >= 50) return "mid"; return "low"; }
function fmtPct(v) { const n = Number(v); return (Number.isFinite(n) ? n : 0).toFixed(2) + "%"; }
function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]); }

function afficherMessage(txt) { const m = document.getElementById("message"); m.textContent = txt; m.style.display = "block"; }
function masquerMessage() { document.getElementById("message").style.display = "none"; }

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

  try {
    const url = API_URL + "&action=public&nocache=" + Date.now();
    const rep = await fetch(url, { cache: "no-store" });
    
    const contentType = rep.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Le script Google a renvoyé du HTML (erreur interne). Vérifiez les logs Google Apps Script.");
    }

    if (!rep.ok) throw new Error("HTTP " + rep.status);
    const data = await rep.json();
    
    if (id !== requeteId) return;

    if (!data.success || !data.formations) {
      throw new Error(data.message || "Données invalides");
    }

    let total = 0, sum = 0;
    data.formations.forEach(f => {
      if (f.taux) { total++; sum += f.taux; }
    });
    const tauxMoyen = total > 0 ? (sum / total) : 0;

    if (globalBanner && total > 0) {
      const valEl = document.getElementById("global-rate-value");
      if (valEl) valEl.textContent = fmtPct(tauxMoyen);
      const lvl = niveau(tauxMoyen);
      globalBanner.className = "box accent detail-header " + lvl;
      globalBanner.style.display = "flex";
    }

    if (tableContainer) {
      afficherTableauPublic(data.formations, tableContainer);
    }

  } catch (err) {
    if (id !== requeteId) return;
    afficherMessage("❌ Erreur : " + err.message);
  } finally {
    if (id === requeteId && loadingHome) loadingHome.hidden = true;
  }

  if (id === requeteId) majBadgeMAJ();
}

function majBadgeMAJ() {
  document.getElementById("updated-date").textContent = new Date().toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  document.getElementById("updated").classList.add("on");
}

/* ---------- Tableau Public (avec tri) ---------- */
function afficherTableauPublic(data, container) {
  if (!data.length) {
    container.innerHTML = '<div class="box empty">Aucune donnée à afficher.</div>';
    return;
  }

  let sortKey = "nom"; // Tri par défaut : nom
  let sortAsc = true;

  const renderTable = () => {
    // 1. Tri des données
    const sorted = [...data].sort((a, b) => {
      let v1 = a[sortKey];
      let v2 = b[sortKey];
      
      // Gestion des valeurs nulles (ex: N/A)
      if (v1 === null) v1 = -1;
      if (v2 === null) v2 = -1;

      if (typeof v1 === "string") {
        return sortAsc ? v1.localeCompare(v2, "fr") : v2.localeCompare(v1, "fr");
      }
      return sortAsc ? v1 - v2 : v2 - v1;
    });

    // 2. Création des en-têtes cliquables
    const th = (key, label) => {
      const arrow = sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';
      const align = key === "nom" ? "left" : "center";
      // Ajout d'un curseur main pour montrer que c'est cliquable
      return `<th data-key="${key}" style="cursor:pointer; user-select:none; text-align:${align}; padding: 15px 20px; background: #e3edf5; color: #1e3a5f; border-bottom: 2px solid #c9d9e8;">${label}${arrow}</th>`;
    };

    // 3. Génération du tableau
    let html = `<div class="box accent" style="padding: 0; overflow: hidden; margin-top: 20px;">
      <div style="padding: 15px 20px; border-bottom: 1px solid #e3edf5;">
        <h2 style="margin: 0; font-size: 18px; color: #1e3a5f;">📋 Récapitulatif par formation</h2>
        <p style="margin: 5px 0 0 0; font-size: 13px; color: var(--muted);">Cliquez sur les en-têtes pour trier.</p>
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
      
      html += `<tr style="border-bottom: 1px solid #f0f5fa;">
        <td style="padding: 15px 20px; font-weight: 600; color: #1e3a5f; text-align: left;">${escapeHtml(row.nom)}</td>
        <td style="padding: 15px 20px; font-weight: 700; color: ${color}; font-size: 16px; text-align: center;">${tauxTxt}</td>
      </tr>`;
    });

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;

    // 4. Ajout des événements de clic sur les en-têtes
    container.querySelectorAll("th[data-key]").forEach(el => {
      el.addEventListener("click", () => {
        const k = el.dataset.key;
        if (sortKey === k) {
          sortAsc = !sortAsc; // Inverse l'ordre si on clique sur la même colonne
        } else {
          sortKey = k; // Sinon on change de colonne
          sortAsc = true;
        }
        renderTable(); // Re-dessine le tableau trié
      });
    });
  };

  renderTable();
}
