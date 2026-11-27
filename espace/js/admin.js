// Espace d'Alexane : traiter les demandes, agenda, fiches clients.
(async function () {
  $('#siteLink').href = window.ESPACE_CONFIG.SITE_URL;
  demoBanner();

  const me = await API.me();
  if (!me) return location.replace('connexion.html');
  if (!me.is_admin) return location.replace('index.html');
  $('#who').textContent = me.full_name || me.email;
  $('#logout').onclick = async () => { await API.signOut(); location.replace('connexion.html'); };

  let rdvs = [], clients = [], animals = [], docs = [], afilter = 'upcoming', search = '';
  // Agenda : vue calendrier (mois ou année) ou liste. Le choix d'affichage est gardé dans ce navigateur.
  const memo = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  let aview = memo('agenda-vue') === 'list' ? 'list' : 'cal';
  let cmode = memo('agenda-echelle') === 'annee' ? 'annee' : 'mois';
  let cursor = new Date(); cursor.setDate(1);
  const now = () => new Date().toISOString();
  const clientName = (r) => r.client?.full_name || r.client?.email || 'Client';

  async function load() {
    [rdvs, clients, animals, docs] = await Promise.all([API.appointments(), API.clients(), API.animals(), API.documents()]);
    render();
  }

  function line(r, actions) {
    const tel = r.client?.phone ? ` · <a href="tel:${esc(r.client.phone.replace(/\s/g, ''))}">${esc(r.client.phone)}</a>` : '';
    return `<div class="item">${dateChip(r.starts_at)}<div class="grow">
      <b>${r.time_unknown ? '' : esc(fmtTime(r.starts_at)) + ' · '}${esc(r.animal?.name || 'Animal non précisé')} ${r.animal ? SPECIES[r.animal.species]?.[1] || '' : ''} · ${esc(clientName(r))}</b>
      <small>${esc(r.reason || '')}${r.location ? ' · 📍 ' + esc(r.location) : ''}${tel}</small>
      ${r.client_note ? `<small style="color:var(--brown-dark)">📝 ${esc(r.client_note)}</small>` : ''}
      ${r.admin_note ? `<small style="color:var(--brown-dark)">💬 ${esc(r.admin_note)}</small>` : ''}
      <div style="margin-top:6px">${statusBadge(r.status)}</div></div>
      <div class="actions">${actions}</div></div>`;
  }

  // ---------- Agenda en calendrier ----------
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Jours à afficher pour un mois : semaines complètes du lundi au dimanche
  const grille = (y, m) => {
    const debut = new Date(y, m, 1); debut.setDate(1 - ((debut.getDay() + 6) % 7));
    const fin = new Date(y, m + 1, 0); fin.setDate(fin.getDate() + (6 - ((fin.getDay() + 6) % 7)));
    const jours = []; for (const d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) jours.push(new Date(d));
    return jours;
  };

  function renderCalendar() {
    $$('[data-aview]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.aview === aview)));
    $('#agendaCal').hidden = aview !== 'cal';
    $('#agendaListWrap').hidden = aview !== 'list';
    if (aview !== 'cal') return;

    const actifs = rdvs.filter((r) => r.status !== 'cancelled');
    const parJour = {};
    actifs.forEach((r) => { (parJour[localDate(r.starts_at)] ||= []).push(r); });
    Object.values(parJour).forEach((l) => l.sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    const auj = ymd(new Date());
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const titre = cmode === 'annee' ? String(y) : `${MOIS[m].charAt(0).toUpperCase() + MOIS[m].slice(1)} ${y}`;
    const total = actifs.filter((r) => { const d = new Date(r.starts_at); return d.getFullYear() === y && (cmode === 'annee' || d.getMonth() === m); }).length;

    let html = `<div class="cal-bar">
      <div class="cal-nav"><button type="button" class="btn btn-secondary btn-sm" data-cnav="prev" aria-label="${cmode === 'annee' ? 'Année précédente' : 'Mois précédent'}">‹</button>
        <h3 class="cal-title">${titre}</h3>
        <button type="button" class="btn btn-secondary btn-sm" data-cnav="next" aria-label="${cmode === 'annee' ? 'Année suivante' : 'Mois suivant'}">›</button>
        <button type="button" class="link-btn" data-cnav="today">Aujourd'hui</button></div>
      <div class="filters"><button class="chip" data-cmode="mois" aria-pressed="${cmode === 'mois'}">Mois</button><button class="chip" data-cmode="annee" aria-pressed="${cmode === 'annee'}">Année</button></div>
    </div>
    <p class="cal-total">${total ? `${total} rendez-vous ${cmode === 'annee' ? 'cette année' : 'ce mois-ci'}` : 'Aucun rendez-vous sur cette période'}
      <span class="cal-legend"><i class="ev-confirmed"></i>confirmé <i class="ev-requested"></i>demande <i class="ev-done"></i>effectué</span></p>`;

    if (cmode === 'mois') {
      html += `<div class="cal-month">${JOURS.map((j) => `<div class="cal-head">${j}</div>`).join('')}` + grille(y, m).map((d) => {
        const k = ymd(d), evs = parJour[k] || [];
        const cls = ['cal-day', d.getMonth() !== m ? 'out' : '', k === auj ? 'today' : '', evs.length ? 'has' : ''].filter(Boolean).join(' ');
        return `<div class="${cls}" data-cday="${k}" title="Nouveau rendez-vous le ${d.toLocaleDateString('fr-FR')}"><span class="cal-num">${d.getDate()}</span>
          ${evs.slice(0, 3).map((r) => `<button type="button" class="cal-ev ev-${r.status}" data-cev="${r.id}" title="${esc(`${r.time_unknown ? '' : fmtTime(r.starts_at) + ' · '}${r.animal?.name || ''} · ${clientName(r)} · ${STATUS[r.status] || ''}`)}">
            <span>${r.time_unknown ? '' : esc(fmtTime(r.starts_at)) + ' '}${esc(r.animal?.name || clientName(r))}</span></button>`).join('')}
          ${evs.length > 3 ? `<span class="cal-more">+${evs.length - 3}</span>` : ''}</div>`;
      }).join('') + '</div>';
    } else {
      html += '<div class="cal-year">' + MOIS.map((nom, mo) => {
        const n = actifs.filter((r) => { const d = new Date(r.starts_at); return d.getFullYear() === y && d.getMonth() === mo; }).length;
        return `<div class="cal-mini"><button type="button" class="cal-mini-title" data-cmonth="${y}-${mo + 1}">${nom.charAt(0).toUpperCase() + nom.slice(1)}${n ? ` <small>${n} RDV</small>` : ''}</button>
          <div class="cal-mini-grid">${JOURS.map((j) => `<span class="cal-head">${j[0]}</span>`).join('')}${grille(y, mo).map((d) => {
            const k = ymd(d), c = (parJour[k] || []).length;
            if (d.getMonth() !== mo) return '<span></span>';
            return `<button type="button" class="cal-mini-day${c ? ' has' : ''}${k === auj ? ' today' : ''}" data-cmonth="${y}-${mo + 1}" title="${c ? c + ' rendez-vous' : ''}">${d.getDate()}</button>`;
          }).join('')}</div></div>`;
      }).join('') + '</div>';
    }
    $('#agendaCal').innerHTML = html;
  }

  function render() {
    const req = rdvs.filter((r) => r.status === 'requested');
    $('#reqCount').textContent = req.length; $('#reqCount').hidden = !req.length;
    $('#reqList').innerHTML = req.length
      ? req.map((r) => line(r, `<button class="btn btn-primary btn-sm" data-confirm="${r.id}">Confirmer / ajuster</button><button class="btn btn-danger btn-sm" data-refuse="${r.id}">Refuser</button>`)).join('')
      : '<p class="empty">Aucune demande en attente. 🎉</p>';

    $$('[data-afilter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.afilter === afilter)));
    let list;
    if (afilter === 'upcoming') list = rdvs.filter((r) => r.status === 'confirmed' && r.starts_at >= localDate(now()));
    else if (afilter === 'past') list = rdvs.filter((r) => r.status === 'done' || (r.status === 'confirmed' && r.starts_at < localDate(now()))).reverse();
    else list = rdvs.filter((r) => r.status === 'cancelled').reverse();
    let html = '', day = '';
    list.forEach((r) => {
      const d = fmtDay(r.starts_at);
      if (d !== day) { day = d; html += `<h3 class="day-title">${esc(d.charAt(0).toUpperCase() + d.slice(1))}</h3>`; }
      const acts = r.status === 'confirmed'
        ? `<button class="btn btn-secondary btn-sm" data-confirm="${r.id}">Modifier</button><button class="btn btn-primary btn-sm" data-done="${r.id}">Effectué</button><button class="btn btn-danger btn-sm" data-refuse="${r.id}">Annuler</button>`
        : r.status === 'done' ? (ficheDe(r) ? `<button class="btn btn-secondary btn-sm" data-done="${r.id}">📄 Voir la fiche</button>` : `<button class="btn btn-secondary btn-sm" data-done="${r.id}">Compte rendu</button>`) : '';
      html += line(r, acts);
    });
    $('#agendaList').innerHTML = html || '<p class="empty">Rien à afficher.</p>';
    renderCalendar();

    const q = search.toLowerCase();
    const rows = clients.filter((c) => !q || (c.full_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || animals.some((a) => a.owner_id === c.id && a.name.toLowerCase().includes(q)));
    $('#clientRows').innerHTML = rows.length ? rows.map((c) => {
      const an = animals.filter((a) => a.owner_id === c.id);
      const nx = rdvs.find((r) => r.client_id === c.id && r.status === 'confirmed' && r.starts_at >= now());
      return `<tr class="click" data-client="${c.id}" tabindex="0"><td><b>${esc(c.full_name || 'Sans nom')}</b><br><small style="color:var(--brown-mid)">${esc(c.email || '')}</small></td><td>${esc(c.phone || '')}</td><td>${an.map((a) => (SPECIES[a.species]?.[1] || '') + ' ' + esc(a.name)).join(', ') || 'Aucun'}</td><td>${nx ? esc(fmtFull(nx.starts_at)) : 'Aucun'}</td></tr>`;
    }).join('') : '<tr><td colspan="4" class="empty">Aucun client.</td></tr>';
  }

  // Confirmer une demande, ou modifier un RDV confirmé
  function confirmModal(r) {
    openModal(r.status === 'requested' ? 'Confirmer la demande' : 'Modifier le rendez-vous', `
      <p style="margin-top:0"><b>${esc(clientName(r))}</b> · ${esc(r.animal?.name || '')}<br><small style="color:var(--brown-mid)">${esc(r.reason || '')}</small></p>
      ${r.client_note ? `<div class="msg info">📝 ${esc(r.client_note)}</div>` : ''}
      <div class="row2"><div class="field"><label for="c-d">Date</label><input class="inp" id="c-d" type="date" name="date" required value="${localDate(r.starts_at)}"></div>
      <div class="field"><label for="c-t">Heure</label><input class="inp" id="c-t" type="time" name="time" required value="${localTime(r.starts_at)}"></div></div>
      <div class="row2"><div class="field"><label for="c-du">Durée</label><select class="inp" id="c-du" name="duration_min">${[30, 45, 60, 75, 90, 120].map((m) => `<option value="${m}" ${m === r.duration_min ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>
      <div class="field"><label for="c-l">Lieu</label><input class="inp" id="c-l" name="location" value="${esc(r.location)}"></div></div>
      <div class="field"><label for="c-n">Message au client</label><textarea class="inp" id="c-n" name="admin_note" placeholder="Ex. : prévoir l'animal au box, à jeun…">${esc(r.admin_note)}</textarea><span class="hint">Visible par le client dans son espace.</span></div>`,
    async (fd) => {
      await API.updateAppointment(r.id, { starts_at: toIso(fd.get('date'), fd.get('time')), duration_min: +fd.get('duration_min'), location: fd.get('location').trim(), admin_note: fd.get('admin_note').trim() || null, status: 'confirmed' });
      toast('Rendez-vous confirmé'); await load();
    }, 'Confirmer');
  }

  function refuseModal(r) {
    openModal(r.status === 'requested' ? 'Refuser la demande' : 'Annuler le rendez-vous', `
      <p style="margin-top:0">${esc(clientName(r))} · ${esc(r.animal?.name || '')}, ${esc(fmtFull(r.starts_at))}</p>
      <div class="field"><label for="x-n">Message au client</label><textarea class="inp" id="x-n" name="admin_note" placeholder="Ex. : je ne me déplace pas à cette date, pouvez-vous refaire une demande pour…">${esc(r.admin_note)}</textarea></div>`,
    async (fd) => { await API.updateAppointment(r.id, { status: 'cancelled', admin_note: fd.get('admin_note').trim() || null }); toast('Rendez-vous annulé'); await load(); }, 'Confirmer l\'annulation');
  }

  // Fiche de consultation liée à un rendez-vous (par le rendez-vous, sinon même animal et même date)
  const ficheDe = (r) => docs.find((x) => x.appointment_id === r.id && x.kind === 'fiche')
    || docs.find((x) => x.kind === 'fiche' && x.animal_id === r.animal_id && x.doc_date && x.doc_date === localDate(r.starts_at));

  // Consultation effectuée avec sa fiche : la fiche s'affiche dans une petite visionneuse
  async function ficheModal(r, doc) {
    const m = openModal('Consultation effectuée', `
      <p style="margin-top:0">${esc(clientName(r))} · ${esc(r.animal?.name || '')}, ${esc(rdvWhen(r))}</p>
      <div class="pdf-view" id="fvView"><p class="hint">Chargement de la fiche…</p></div>
      ${r.admin_note ? `<p class="hint" style="margin:10px 0 0">💬 ${esc(r.admin_note)}</p>` : ''}
      <div class="form-actions" style="justify-content:flex-start;margin-top:14px">
        <button type="button" class="btn btn-primary btn-sm" id="fvAdd">Ajouter des informations</button>
        <button type="button" class="btn btn-secondary btn-sm" id="fvOpen">Ouvrir en grand</button></div>`, null);
    m.form.classList.add('modal-pdf');
    $('#fvAdd', m.form).onclick = () => { m.close(); const a = animals.find((x) => x.id === r.animal_id); if (a) animalFileModal(a); };
    $('#fvOpen', m.form).onclick = () => openDocument(doc);
    try {
      const url = await API.documentUrl(doc);
      const image = /\.(jpe?g|png|webp|heic|gif)$/i.test(doc.file_path || doc.file_name || doc.file || doc.url || '');
      $('#fvView', m.form).innerHTML = image
        ? `<img src="${esc(url)}" alt="${esc(doc.title)}">`
        : `<iframe src="${esc(url)}#navpanes=0&view=FitH" title="${esc(doc.title)}"></iframe>`;
    } catch (e) { $('#fvView', m.form).innerHTML = `<p class="msg">${esc(e.message)}</p>`; }
  }

  function doneModal(r) {
    const fiche = r.status === 'done' && ficheDe(r);
    if (fiche) return ficheModal(r, fiche);
    openModal('Consultation effectuée', `
      <p style="margin-top:0">${esc(clientName(r))} · ${esc(r.animal?.name || '')}, ${esc(rdvWhen(r))}</p>
      <div class="field"><label for="d-n">Compte rendu / conseils pour le client</label><textarea class="inp" id="d-n" name="admin_note" style="min-height:140px" placeholder="Zones travaillées, repos conseillé, prochaine visite…">${esc(r.admin_note)}</textarea><span class="hint">Visible par le client dans son espace.</span></div>
      ${r.animal_id ? `<div class="field"><label for="d-f">Fiche de consultation (PDF)</label><input class="inp" id="d-f" type="file" name="file" accept="application/pdf,image/*"><span class="hint">Facultatif. Rangée dans le dossier de l'animal, visible par le client.</span></div>` : ''}`,
    async (fd) => {
      await API.updateAppointment(r.id, { status: 'done', admin_note: fd.get('admin_note').trim() || null });
      const f = fd.get('file');
      if (f && f.size) await API.addDocument({ file: f, animal_id: r.animal_id, client_id: r.client_id, appointment_id: r.id, kind: 'fiche', title: `Fiche de consultation ${r.animal?.name || ''} - ${localDate(r.starts_at).split('-').reverse().join('/')}`.trim(), doc_date: localDate(r.starts_at) });
      toast('Consultation enregistrée'); await load();
    });
  }

  function newModal(clientId, date) {
    if (!clients.length) return toast('Aucun client inscrit pour le moment.');
    const m = openModal('Nouveau rendez-vous', `
      <div class="field"><label for="n-c">Client</label><select class="inp" id="n-c" name="client_id">${clients.map((c) => `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${esc(c.full_name || c.email)}</option>`).join('')}</select></div>
      <div class="field"><label for="n-a">Animal</label><select class="inp" id="n-a" name="animal_id"></select><span class="hint" id="n-a-hint"></span></div>
      <div class="row2"><div class="field"><label for="n-d">Date</label><input class="inp" id="n-d" type="date" name="date" required value="${date || localDate(new Date(Date.now() + 864e5).toISOString())}"></div>
      <div class="field"><label for="n-t">Heure</label><input class="inp" id="n-t" type="time" name="time" required value="09:00"></div></div>
      <div class="row2"><div class="field"><label for="n-du">Durée</label><select class="inp" id="n-du" name="duration_min">${[30, 45, 60, 75, 90, 120].map((x) => `<option ${x === 60 ? 'selected' : ''} value="${x}">${x} min</option>`).join('')}</select></div>
      <div class="field"><label for="n-l">Lieu</label><input class="inp" id="n-l" name="location"></div></div>
      <div class="field"><label for="n-r">Motif</label><input class="inp" id="n-r" name="reason"></div>
      <div class="field"><label for="n-n">Message au client</label><textarea class="inp" id="n-n" name="admin_note"></textarea></div>`,
    async (fd) => {
      await API.createAppointment({ client_id: fd.get('client_id'), animal_id: fd.get('animal_id') || null, starts_at: toIso(fd.get('date'), fd.get('time')), duration_min: +fd.get('duration_min'), location: fd.get('location').trim() || null, reason: fd.get('reason').trim() || null, admin_note: fd.get('admin_note').trim() || null, status: 'confirmed' });
      toast('Rendez-vous ajouté'); await load();
    }, 'Ajouter');
    const sel = $('#n-c', m.form);
    const fill = () => {
      const c = clients.find((x) => x.id === sel.value); const an = animals.filter((a) => a.owner_id === sel.value);
      $('#n-a', m.form).innerHTML = an.length ? animalOptions(an) : '<option value="">(aucun animal enregistré)</option>';
      $('#n-a-hint', m.form).textContent = an.length ? '' : 'Ce client n\'a pas encore ajouté d\'animal.';
      $('#n-l', m.form).value = c?.address || '';
    };
    sel.onchange = fill; fill();
  }

  // Ajout manuel d'un client (et de ses animaux) par Alexane
  function animalBlock(n) {
    const sp = Object.entries(SPECIES).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('');
    const sx = Object.entries(SEX).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    return `<details class="animal-block" open data-animal-block>
      <summary><span data-animal-title>Animal ${n}</span><button type="button" class="link-btn" data-remove-animal>Retirer</button></summary>
      <div class="row2"><div class="field"><label>Nom *</label><input class="inp" data-f="nom" required aria-label="Nom de l’animal"></div>
      <div class="field"><label>Espèce</label><select class="inp" data-f="espece" aria-label="Espèce">${sp}</select></div></div>
      <div class="row2"><div class="field"><label>Race</label><input class="inp" data-f="race" aria-label="Race" placeholder="Ex. : Selle français, Maine coon…"></div>
      <div class="field"><label>Sexe</label><select class="inp" data-f="sexe" aria-label="Sexe"><option value="">Non précisé</option>${sx}</select></div></div>
      <div class="row2"><div class="field"><label>Date de naissance</label><input class="inp" type="date" data-f="naissance" aria-label="Date de naissance"></div>
      <div class="field"><label>Ou âge</label><input class="inp" data-f="age" aria-label="Âge" placeholder="Ex. : 6 ans"></div></div>
    </details>`;
  }

  function newClientModal() {
    const m = openModal('Ajouter un client', `
      <div class="row2"><div class="field"><label for="nc-p">Prénom *</label><input class="inp" id="nc-p" name="prenom" required autocomplete="off"></div>
      <div class="field"><label for="nc-n">Nom *</label><input class="inp" id="nc-n" name="nom" required autocomplete="off"></div></div>
      <div class="row2"><div class="field"><label for="nc-e">Adresse mail</label><input class="inp" id="nc-e" type="email" name="email" autocomplete="off"></div>
      <div class="field"><label for="nc-t">Téléphone</label><input class="inp" id="nc-t" type="tel" name="telephone" autocomplete="off"></div></div>
      <div class="field"><label for="nc-a">Adresse postale</label><input class="inp" id="nc-a" name="adresse" placeholder="N° et rue, lieu-dit, écurie…" autocomplete="off"></div>
      <div class="row2"><div class="field"><label for="nc-cp">Code postal</label><input class="inp" id="nc-cp" name="code_postal" inputmode="numeric" autocomplete="off"></div>
      <div class="field"><label for="nc-v">Ville</label><input class="inp" id="nc-v" name="ville" autocomplete="off"></div></div>
      <div class="private"><label for="nc-notes" class="private-label">🔒 Notes privées sur le client</label><textarea class="inp" id="nc-notes" name="notes" placeholder="Visibles uniquement par vous"></textarea></div>
      <h3 class="sub-title sub-title-row"><span>Animaux</span><button type="button" class="btn btn-secondary btn-sm" id="ncAddAnimal">+ Ajouter un animal</button></h3>
      <div id="ncAnimals"></div>
      <p class="hint" id="ncNoAnimal">Aucun animal pour l'instant : vous pourrez aussi en ajouter plus tard.</p>`,
    async (fd, form) => {
      const v = (k) => (fd.get(k) || '').trim();
      const animaux = $$('[data-animal-block]', form).map((b) => {
        const a = {}; $$('[data-f]', b).forEach((i) => { a[i.dataset.f] = i.value.trim(); }); return a;
      }).filter((a) => a.nom);
      const noms = animaux.map((a) => a.nom.toLowerCase());
      if (new Set(noms).size !== noms.length) throw new Error('Deux animaux ont le même nom.');
      const p = await API.createClient({ prenom: v('prenom'), nom: v('nom'), email: v('email'), telephone: v('telephone'), adresse: v('adresse'), code_postal: v('code_postal'), ville: v('ville'), notes: v('notes'), animaux });
      toast(!API.demo ? `${p.full_name} ajouté(e)` : p.surDisque ? `${p.full_name} ajouté(e), dossier créé dans Consultation` : `${p.full_name} ajouté(e) (serveur local éteint : dossier Consultation non créé)`);
      await load();
    }, 'Ajouter le client');
    const box = $('#ncAnimals', m.form);
    const sync = () => {
      $$('[data-animal-block]', box).forEach((b, i) => { const n = $('[data-f="nom"]', b).value.trim(); $('[data-animal-title]', b).textContent = n || `Animal ${i + 1}`; });
      $('#ncNoAnimal', m.form).hidden = !!box.children.length;
    };
    $('#ncAddAnimal', m.form).onclick = () => {
      $$('[data-animal-block]', box).forEach((b) => { b.open = false; });
      box.insertAdjacentHTML('beforeend', animalBlock(box.children.length + 1));
      sync(); $('[data-f="nom"]', box.lastElementChild).focus();
    };
    box.addEventListener('input', sync);
    box.addEventListener('click', (e) => {
      const r = e.target.closest('[data-remove-animal]');
      if (r) { e.preventDefault(); r.closest('[data-animal-block]').outerHTML = ''; sync(); }
    });
  }

  // Modifier les coordonnées d'un client. L'email d'un client qui a déjà un compte est son identifiant
  // de connexion : il ne se change pas ici.
  function editClientModal(c) {
    const aUnCompte = API.demo ? !!c.pw_sha256 : c.has_account !== false;
    openModal('Coordonnées de ' + (c.full_name || c.email || 'ce client'), `
      <div class="field"><label for="ec-n">Nom et prénom *</label><input class="inp" id="ec-n" name="full_name" required value="${esc(c.full_name)}"></div>
      <div class="field"><label for="ec-e">Adresse mail</label><input class="inp" id="ec-e" type="email" name="email" value="${esc(c.email)}" ${aUnCompte ? 'disabled' : ''}>
        ${aUnCompte ? '<span class="hint">C\'est l\'identifiant de connexion du client : il ne se modifie pas ici.</span>' : '<span class="hint">Quand le client créera son compte avec cette adresse, il retrouvera ses animaux et ses fiches.</span>'}</div>
      <div class="field"><label for="ec-t">Téléphone</label><input class="inp" id="ec-t" type="tel" name="phone" value="${esc(c.phone)}"></div>
      <div class="field"><label for="ec-a">Adresse postale</label><textarea class="inp" id="ec-a" name="address" rows="2" placeholder="N° et rue, code postal, ville">${esc(c.address)}</textarea></div>`,
    async (fd) => {
      const patch = { full_name: fd.get('full_name').trim(), phone: fd.get('phone').trim() || null, address: fd.get('address').trim() || null };
      if (!patch.full_name) throw new Error('Indiquez le nom du client.');
      if (!aUnCompte) {
        const email = (fd.get('email') || '').trim().toLowerCase();
        if (email && clients.some((x) => x.id !== c.id && (x.email || '').toLowerCase() === email)) throw new Error('Un autre client a déjà cette adresse mail.');
        patch.email = email || null;
      }
      await API.updateProfile(c.id, patch);
      toast('Coordonnées enregistrées');
      await load();
      clientModal(clients.find((x) => x.id === c.id) || { ...c, ...patch });
    });
  }

  async function clientModal(c) {
    const an = animals.filter((a) => a.owner_id === c.id);
    const rs = rdvs.filter((r) => r.client_id === c.id).reverse();
    const rec = await API.clientRecord(c.id);
    const m = openModal(c.full_name || c.email || 'Client', `
      <p style="margin-top:0">${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a><br>` : ''}${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a><br>` : ''}${esc(c.address || '')}
        ${!c.email && !c.phone ? '<span class="hint">Coordonnées à compléter.</span>' : ''}</p>
      <p style="margin-top:-6px"><button type="button" class="btn btn-secondary btn-sm" id="cEdit">Modifier les coordonnées</button></p>
      <div class="private"><label for="cn" class="private-label">🔒 Notes privées sur le client</label><textarea class="inp" id="cn" name="notes" placeholder="Visibles uniquement par vous">${esc(rec.notes)}</textarea>
        <div class="form-actions" style="margin-top:6px"><button type="button" class="btn btn-secondary btn-sm" id="cnSave">Enregistrer la note</button></div></div>
      <h3 class="sub-title">Animaux</h3>
      ${an.length ? an.map((a) => `<div class="item"><div class="date" style="font-size:22px;padding:8px 0">${SPECIES[a.species]?.[1] || '🐾'}</div><div class="grow"><b>${esc(a.name)}</b><small>${esc([SPECIES[a.species]?.[0], a.breed, SEX[a.sex], animalAge(a)].filter(Boolean).join(' · '))}</small></div>
        <div class="actions"><button type="button" class="btn btn-primary btn-sm" data-animal-file="${a.id}">Dossier</button></div></div>`).join('') : '<p class="empty">Aucun animal.</p>'}
      <h3 class="sub-title">Historique</h3>
      ${rs.length ? rs.map((r) => `<div class="item">${dateChip(r.starts_at)}<div class="grow"><b>${esc(r.animal?.name || 'Animal')} · ${esc(r.reason || 'Consultation')}</b><small>${esc(rdvWhen(r))}</small>${r.admin_note ? `<small style="color:var(--brown-dark)">💬 ${esc(r.admin_note)}</small>` : ''}<div>${statusBadge(r.status)}</div></div></div>`).join('') : '<p class="empty">Aucun rendez-vous.</p>'}
      <p><button type="button" class="btn btn-primary btn-sm" id="cNew">Nouveau rendez-vous pour ce client</button></p>`, null);
    $('#cNew', m.form).onclick = () => { m.close(); newModal(c.id); };
    $('#cEdit', m.form).onclick = () => { m.close(); editClientModal(c); };
    $('#cnSave', m.form).onclick = async () => { await API.saveClientRecord(c.id, { notes: $('#cn', m.form).value.trim() || null }); toast('Note enregistrée'); };
  }

  // Dossier complet d'un animal, vu par Alexane : dossier praticienne (privé) + rendez-vous + documents
  async function animalFileModal(a) {
    $$('.modal-bg').forEach((x) => x.parentNode.removeChild(x));
    const rec = await API.animalRecord(a.id);
    const owner = clients.find((c) => c.id === a.owner_id);
    const area = (k, label, ph) => `<div class="field"><label for="ar-${k}">${label}</label><textarea class="inp" id="ar-${k}" name="${k}" rows="${Math.max(2, String(rec[k] || '').split('\n').length + 1)}" placeholder="${ph}">${esc(rec[k])}</textarea></div>`;
    const m = openModal(`${SPECIES[a.species]?.[1] || ''} ${a.name} · ${owner?.full_name || ''}`, `
      <p style="margin-top:0;color:var(--brown-mid)">${esc([SPECIES[a.species]?.[0], a.breed, SEX[a.sex], animalAge(a)].filter(Boolean).join(' · '))}</p>
      <div class="private"><p class="private-label">🔒 Dossier praticienne, visible uniquement par vous</p>
        ${area('antecedents', 'Antécédents', 'Une ligne par antécédent')}
        ${area('vecu', 'Vécu avant la prise en charge', 'Histoire, mode de vie, activité, alimentation…')}
        ${area('entre_seances', 'Entre les séances', 'Une ligne datée par info')}
        ${area('notes', 'Notes', '')}
        <div class="form-actions"><button type="button" class="btn btn-secondary btn-sm" id="arSave">Enregistrer le dossier</button></div></div>
      <div id="dossier">${dossierHtml(a, rdvs, docs, { admin: true })}</div>`, null);
    $('#arSave', m.form).onclick = async () => {
      const v = (k) => $('#ar-' + k, m.form).value.trim() || null;
      await API.saveAnimalRecord(a.id, { antecedents: v('antecedents'), vecu: v('vecu'), entre_seances: v('entre_seances'), notes: v('notes') });
      toast('Dossier enregistré');
    };
  }

  // « Ajouter » : un document (fiche de consultation, ordonnance, radio…)
  function addDocModal(a) {
    const mine = rdvs.filter((r) => r.animal_id === a.id).sort((x, y) => y.starts_at.localeCompare(x.starts_at));
    openModal('Ajouter un document pour ' + a.name, `
      <div class="field"><label for="ad-f">Fichier (PDF ou image) *</label><input class="inp" id="ad-f" type="file" name="file" accept="application/pdf,image/*" required></div>
      <div class="row2"><div class="field"><label for="ad-k">Type</label><select class="inp" id="ad-k" name="kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="field"><label for="ad-d">Date</label><input class="inp" id="ad-d" type="date" name="doc_date" value="${localDate(new Date().toISOString())}"></div></div>
      <div class="field"><label for="ad-t">Titre</label><input class="inp" id="ad-t" name="title" placeholder="Par défaut : le nom du fichier"></div>
      <div class="field"><label for="ad-r">Rendez-vous associé</label><select class="inp" id="ad-r" name="appointment_id"><option value="">Aucun</option>${mine.map((r) => `<option value="${r.id}">${esc(fmtDate(r.starts_at))} · ${esc(r.reason || 'Consultation')}</option>`).join('')}</select></div>
      <p class="hint" style="margin:0">Le client pourra ouvrir ce document depuis le dossier de son animal.</p>`,
    async (fd) => {
      const f = fd.get('file');
      if (!f || !f.size) throw new Error('Choisissez un fichier.');
      if (f.size > 15 * 1024 * 1024) throw new Error('Fichier trop lourd (15 Mo maximum).');
      await API.addDocument({ file: f, animal_id: a.id, client_id: a.owner_id, appointment_id: fd.get('appointment_id') || null, kind: fd.get('kind'), title: fd.get('title').trim() || f.name.replace(/\.[^.]+$/, ''), doc_date: fd.get('doc_date') || null });
      toast('Document ajouté'); await load(); animalFileModal(a);
    }, 'Ajouter');
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-confirm],[data-refuse],[data-done],[data-new],[data-new-client],[data-afilter],[data-aview],[data-cmode],[data-cnav],[data-cmonth],[data-cev],[data-cday],[data-client],[data-animal-file],[data-add-doc],[data-del-doc],[data-open-doc]');
    if (!t) return;
    const d = t.dataset; const find = (id) => rdvs.find((r) => r.id === id);
    if (d.openDoc) return openDocument(docs.find((x) => x.id === d.openDoc));
    if (d.animalFile) return animalFileModal(animals.find((a) => a.id === d.animalFile));
    if (d.addDoc) return addDocModal(animals.find((a) => a.id === d.addDoc));
    if (d.delDoc) {
      const doc = docs.find((x) => x.id === d.delDoc);
      if (!confirm(`Supprimer « ${doc.title} » ? Le client ne le verra plus.`)) return;
      return API.deleteDocument(doc).then(load).then(() => { toast('Document supprimé'); animalFileModal(animals.find((a) => a.id === doc.animal_id)); });
    }
    if (d.confirm) confirmModal(find(d.confirm));
    else if (d.refuse) refuseModal(find(d.refuse));
    else if (d.done) doneModal(find(d.done));
    else if (d.new !== undefined) newModal();
    else if (d.newClient !== undefined) newClientModal();
    else if (d.aview) { aview = d.aview; memo('agenda-vue', aview); render(); }
    else if (d.cmode) { cmode = d.cmode; memo('agenda-echelle', cmode); render(); }
    else if (d.cnav) {
      const step = cmode === 'annee' ? 12 : 1;
      if (d.cnav === 'today') { cursor = new Date(); cursor.setDate(1); } else cursor.setMonth(cursor.getMonth() + (d.cnav === 'prev' ? -step : step));
      render();
    }
    else if (d.cmonth) { const [y, mo] = d.cmonth.split('-').map(Number); cursor = new Date(y, mo - 1, 1); cmode = 'mois'; memo('agenda-echelle', cmode); render(); }
    else if (d.cev) {
      const r = find(d.cev);
      if (r.status === 'done') doneModal(r); else confirmModal(r);
    }
    else if (d.cday) newModal(null, d.cday);
    else if (d.afilter) { afilter = d.afilter; render(); }
    else if (d.client) clientModal(clients.find((c) => c.id === d.client));
  });
  document.addEventListener('keydown', (e) => { const r = e.target.closest && e.target.closest('[data-client]'); if (r && e.key === 'Enter') r.click(); });
  $('#clientSearch').addEventListener('input', (e) => { search = e.target.value; render(); });

  initTabs();
  await load();

  // Mode en ligne, sur le Mac : bouton pour envoyer les données locales (clients, animaux, RDV, fiches) dans Supabase
  const surLeMac = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!API.demo && surLeMac && API.importLocal) {
    const b = document.createElement('button');
    b.className = 'btn btn-secondary btn-sm'; b.textContent = 'Importer mes données locales';
    $('#logout').before(b);
    b.onclick = () => {
      const m = openModal('Importer les données du Mac', `
        <p style="margin-top:0">Envoie dans l'espace en ligne les clients, animaux, dossiers privés, rendez-vous et fiches de consultation de l'espace local de ce Mac.</p>
        <p class="hint">Peut être relancé sans créer de doublons : seuls les nouveaux éléments sont envoyés.</p>
        <p id="impEtat" class="hint" style="color:var(--brown-dark)"></p>`,
      async () => {
        const etat = $('#impEtat', m.form);
        const r = await API.importLocal((t) => { etat.textContent = t; });
        await load();
        alert(`Import terminé.\n\nAjoutés : ${r.clients} client(s), ${r.animaux} animal(aux), ${r.rdv} rendez-vous, ${r.documents} document(s).\nDéjà présents : ${r.deja}.` +
          (r.erreurs.length ? `\n\nNon importés :\n- ${r.erreurs.join('\n- ')}` : ''));
      }, 'Lancer l\'import');
    };
  }

})();
