// Petits utilitaires partagés par les pages de l'espace client.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SPECIES = { cheval: ['Cheval / équidé', '🐴'], bovin: ['Bovin', '🐮'], chien: ['Chien', '🐶'], chat: ['Chat', '🐱'], nac: ['NAC', '🐰'], autre: ['Autre', '🐾'] };
const SEX = { femelle: 'Femelle', male: 'Mâle', hongre: 'Hongre', castre: 'Mâle castré' };
const STATUS = { requested: 'En attente de confirmation', confirmed: 'Confirmé', cancelled: 'Annulé', done: 'Effectué' };

const statusBadge = (s) => `<span class="status st-${s}">${STATUS[s] || s}</span>`;
const fmtDay = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtFull = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + fmtTime(iso);
// Date d'un RDV, sans heure quand elle n'est pas connue (consultations importées)
const rdvWhen = (r) => r.time_unknown ? new Date(r.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : fmtFull(r.starts_at);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dateChip = (iso) => { const d = new Date(iso); return `<div class="date"><b>${d.getDate()}</b><span>${d.toLocaleDateString('fr-FR', { month: 'short' })}</span></div>`; };
const pad = (n) => String(n).padStart(2, '0');
const localDate = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localTime = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toIso = (date, time) => new Date(`${date}T${time || '09:00'}`).toISOString();
const animalAge = (a) => age(a.birth_date) || a.age_text || '';
const KINDS = { fiche: 'Fiche de consultation', 'a-traiter': 'Feuille déposée, visible par vous seule', 'fiche-a-verifier': 'Fiche générée à vérifier, visible par vous seule', ordonnance: 'Ordonnance', radio: 'Radio / imagerie', autre: 'Document' };
const fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

// Dossier d'un animal : ses rendez-vous (dates) et ses documents, du plus récent au plus ancien.
// opts.admin : affiche les boutons d'ajout / suppression de documents.
function dossierHtml(animal, rdvs, docs, opts = {}) {
  const mine = rdvs.filter((r) => r.animal_id === animal.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const ds = docs.filter((d) => d.animal_id === animal.id);
  // Les fichiers rangés sur le disque (url) se gèrent dans le dossier Consultation, pas depuis l'espace
  const docLine = (d) => {
    const meta = `${esc(KINDS[d.kind] || 'Document')}${d.doc_date ? ' · ' + esc(fmtDate(d.doc_date)) : ''}`;
    const open = (label = 'Ouvrir') => `<button type="button" class="btn btn-secondary btn-sm" data-open-doc="${d.id}">${label}</button>`;
    let icon = '📄', extra = '', actions = open();
    if (d.kind === 'a-traiter') {
      icon = '📝';
      if (d.etat === 'en-cours') {
        icon = '⏳';
        extra = `<small class="working" data-progress="${esc(d.file || '')}">${esc(d.message || 'Mise au propre en cours…')}</small><small>Comptez 4 à 6 minutes. Vous pouvez fermer cette fenêtre : la fiche apparaîtra « à vérifier » une fois prête.</small>`;
        actions = '';
      } else if (d.etat === 'erreur') {
        extra = `<small class="failed">⚠ ${esc(d.message || 'La mise au propre a échoué.')}</small>`;
        actions = `<button type="button" class="btn btn-primary btn-sm" data-clean="${d.id}">Réessayer</button>${open('Voir')}`;
      } else {
        actions = `<button type="button" class="btn btn-primary btn-sm" data-clean="${d.id}">Mettre au propre</button><button type="button" class="link-btn" data-open-doc="${d.id}">voir</button>`;
      }
    } else if (d.kind === 'fiche-a-verifier') {
      icon = '🔎';
      extra = '<small>Relisez la fiche, puis validez-la : elle sera alors visible par le client.</small>';
      actions = `${open()}<button type="button" class="btn btn-primary btn-sm" data-validate="${d.id}">Valider</button><button type="button" class="btn btn-secondary btn-sm" data-redo="${d.id}">Refaire</button>`;
    } else if (d.kind === 'fiche') {
      extra = '<small class="verified">✓ Consultation vérifiée</small>';
    }
    if (opts.admin && !d.url) actions += `<button type="button" class="btn btn-danger btn-sm" data-del-doc="${d.id}" aria-label="Supprimer ${esc(d.title)}">✕</button>`;
    return `<div class="item${d.kind === 'a-traiter' || d.kind === 'fiche-a-verifier' ? ' pending' : ''}"><div class="date" style="font-size:22px;padding:8px 0">${icon}</div><div class="grow"><b>${esc(d.title)}</b><small>${meta}</small>${extra}</div>
      <div class="actions">${actions}</div></div>`;
  };
  return `<h3 class="sub-title">Rendez-vous</h3>
    ${mine.length ? mine.map((r) => `<div class="item">${dateChip(r.starts_at)}<div class="grow"><b>${esc(r.reason || 'Consultation')}</b><small>${esc(rdvWhen(r))}</small>${r.admin_note ? `<small style="color:var(--brown-dark)">💬 ${esc(r.admin_note)}</small>` : ''}<div style="margin-top:4px">${statusBadge(r.status)}</div></div>
      ${ds.filter((d) => d.appointment_id === r.id).map((d) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-open-doc="${d.id}">📄 Fiche</button></div>`).join('')}</div>`).join('') : '<p class="empty">Aucun rendez-vous.</p>'}
    <h3 class="sub-title sub-title-row"><span>Documents ${opts.admin ? `<button type="button" class="btn btn-primary btn-sm" data-add-doc="${animal.id}" style="margin-left:8px">Ajouter</button>` : ''}</span>
      ${opts.admin ? `<button type="button" class="btn btn-secondary btn-sm" data-gen-sheet="${animal.id}">✦ Générer ma fiche</button>` : ''}</h3>
    ${ds.length ? ds.map(docLine).join('') : '<p class="empty">Aucun document pour le moment.</p>'}`;
}

// Ouvre un document dans un nouvel onglet (lien signé Supabase ou fichier local)
async function openDocument(doc) {
  const w = window.open('', '_blank');
  try { const url = await API.documentUrl(doc); if (w) w.location = url; else location.href = url; }
  catch (e) { if (w) w.close(); toast(e.message); }
}

const age = (b) => { if (!b) return ''; const d = new Date(b), n = new Date(); let y = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) y--; return y < 1 ? 'moins d\'un an' : y + ' an' + (y > 1 ? 's' : ''); };

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }

function showMsg(el, text, kind = 'err') { el.className = 'msg ' + kind; el.textContent = text; el.hidden = !text; }

// Ouvre une fenêtre avec un formulaire. onSubmit(FormData) peut renvoyer une promesse ;
// en cas d'erreur, le message s'affiche dans la fenêtre au lieu de la fermer.
function openModal(title, bodyHtml, onSubmit, submitLabel = 'Enregistrer') {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2><div class="msg" hidden></div>${bodyHtml}
    <div class="form-actions"><button type="button" class="btn btn-secondary" data-close>${onSubmit ? 'Annuler' : 'Fermer'}</button>${onSubmit ? `<button class="btn btn-primary">${esc(submitLabel)}</button>` : ''}</div></form>`;
  document.body.append(bg);
  const form = $('form', bg);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const btn = $('button.btn-primary', form); btn.disabled = true;
    try { await onSubmit(new FormData(form), form); close(); }
    catch (err) { showMsg($('.msg', form), err.message); btn.disabled = false; }
  });
  const first = $('input:not([type=hidden]),select,textarea', form); if (first) first.focus();
  return { form, close };
}

function demoBanner() {
  if (!API.demo) return;
  const b = document.createElement('div');
  b.className = 'demo-banner';
  b.innerHTML = 'Mode démo : les données restent dans ce navigateur. <button class="link-btn" id="demoReset">Réinitialiser la démo</button>';
  document.body.prepend(b);
  $('#demoReset').onclick = () => { API.reset(); location.href = 'connexion.html'; };
}

function animalOptions(list, selected) {
  return list.map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)} (${SPECIES[a.species]?.[0] || a.species})</option>`).join('');
}

function animalFields(a = {}) {
  return `<div class="field"><label for="an-name">Nom de l'animal *</label><input class="inp" id="an-name" name="name" required value="${esc(a.name)}"></div>
  <div class="row2"><div class="field"><label for="an-sp">Espèce *</label><select class="inp" id="an-sp" name="species">${Object.entries(SPECIES).map(([k, [l]]) => `<option value="${k}" ${a.species === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="field"><label for="an-sex">Sexe</label><select class="inp" id="an-sex" name="sex"><option value="">Non précisé</option>${Object.entries(SEX).map(([k, l]) => `<option value="${k}" ${a.sex === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
  <div class="row2"><div class="field"><label for="an-br">Race</label><input class="inp" id="an-br" name="breed" value="${esc(a.breed)}"></div>
  <div class="field"><label for="an-bd">Date de naissance</label><input class="inp" id="an-bd" type="date" name="birth_date" value="${esc(a.birth_date)}"></div></div>
  <div class="field"><label for="an-age">Ou âge approximatif</label><input class="inp" id="an-age" name="age_text" placeholder="Ex. : environ 2 ans" value="${esc(a.age_text)}"></div>
  <div class="field"><label for="an-no">Informations utiles</label><textarea class="inp" id="an-no" name="notes" placeholder="Antécédents, traitements, comportement…">${esc(a.notes)}</textarea></div>`;
}
function readAnimal(fd) {
  return { name: fd.get('name').trim(), species: fd.get('species'), sex: fd.get('sex') || null, breed: fd.get('breed').trim() || null, birth_date: fd.get('birth_date') || null, age_text: fd.get('age_text').trim() || null, notes: fd.get('notes').trim() || null };
}

// Onglets accessibles : boutons [role=tab][data-tab] et sections [data-panel]
function initTabs(onChange) {
  const tabs = $$('[role=tab]');
  function select(name, push = true) {
    if (!tabs.some((t) => t.dataset.tab === name)) name = tabs[0].dataset.tab;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (push) history.replaceState(null, '', '#' + name);
    onChange && onChange(name);
  }
  tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.tab)));
  select(location.hash.slice(1), false);
  window.addEventListener('hashchange', () => select(location.hash.slice(1), false));
  return select;
}
