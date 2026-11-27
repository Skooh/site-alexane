// Espace client : accueil, rendez-vous, animaux, profil.
(async function () {
  const C = window.ESPACE_CONFIG;
  $('#siteLink').href = C.SITE_URL;
  $('#contactLine').innerHTML = `<a href="tel:${esc(C.TELEPHONE.replace(/\s/g, ''))}">${esc(C.TELEPHONE)}</a> · <a href="mailto:${esc(C.EMAIL)}">${esc(C.EMAIL)}</a>`;
  demoBanner();

  let me = await API.me();
  if (!me) return location.replace('connexion.html');
  if (me.is_admin) return location.replace('admin.html');

  let animals = [], rdvs = [], docs = [], filter = 'upcoming';
  const now = () => new Date().toISOString();

  $('#logout').onclick = async () => { await API.signOut(); location.replace('connexion.html'); };

  async function load() {
    [animals, rdvs, docs] = await Promise.all([API.animals(), API.appointments(), API.documents()]);
    render();
  }

  function render() {
    const first = (me.full_name || '').split(' ')[0];
    $('#who').textContent = me.full_name || me.email;
    $('#hello').innerHTML = first ? `Bonjour <em>${esc(first)}</em>` : 'Bonjour';

    // Accueil
    const next = rdvs.find((r) => r.status === 'confirmed' && r.starts_at >= now());
    $('#nextCard').innerHTML = next
      ? `<h2>Prochain rendez-vous</h2><p class="big">${esc(fmtFull(next.starts_at))}</p>
         <p style="margin:0">${esc(next.animal?.name || 'Animal')} · ${esc(next.reason || 'Consultation')}</p>
         <p style="margin:4px 0 16px;color:var(--brown-mid)">📍 ${esc(next.location || 'Lieu à préciser')}</p>
         <button class="btn btn-secondary btn-sm" data-goto="rdv">Voir mes rendez-vous</button>`
      : `<h2>Prochain rendez-vous</h2><p class="empty" style="text-align:left;padding:8px 0 16px">Aucun rendez-vous confirmé pour le moment.</p>
         <button class="btn btn-primary" data-request>Demander un rendez-vous</button>`;

    const pending = rdvs.filter((r) => r.status === 'requested');
    $('#pendingList').innerHTML = pending.length
      ? pending.map((r) => `<div class="item">${dateChip(r.starts_at)}<div class="grow"><b>${esc(r.animal?.name || 'Animal')}</b><small>Souhaité le ${esc(fmtDay(r.starts_at))} vers ${fmtTime(r.starts_at)}</small>${statusBadge(r.status)}</div></div>`).join('')
      : '<p class="empty">Aucune demande en attente.</p>';

    $('#animalsMini').innerHTML = animals.length
      ? animals.slice(0, 4).map((a) => `<div class="item"><div class="date" style="font-size:24px;padding:10px 0">${SPECIES[a.species]?.[1] || '🐾'}</div><div class="grow"><b>${esc(a.name)}</b><small>${esc([a.breed, animalAge(a)].filter(Boolean).join(' · ') || SPECIES[a.species]?.[0])}</small></div></div>`).join('')
      : '<p class="empty">Ajoutez votre premier animal pour pouvoir demander un rendez-vous.</p><p style="text-align:center"><button class="btn btn-primary btn-sm" data-add-animal>Ajouter un animal</button></p>';

    // Rendez-vous
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    let list = rdvs;
    if (filter === 'upcoming') list = rdvs.filter((r) => r.starts_at >= now() && r.status !== 'cancelled' && r.status !== 'done');
    if (filter === 'past') list = rdvs.filter((r) => r.starts_at < now() || r.status === 'done' || r.status === 'cancelled').reverse();
    $('#rdvList').innerHTML = list.length ? list.map(rdvItem).join('') : `<p class="empty">${filter === 'upcoming' ? 'Aucun rendez-vous à venir.' : 'Aucun rendez-vous.'}</p>`;

    // Animaux
    $('#animalsList').innerHTML = animals.length
      ? animals.map((a) => `<div class="animal"><div class="emo">${SPECIES[a.species]?.[1] || '🐾'}</div><div style="flex:1;min-width:0"><h3>${esc(a.name)}</h3><small>${esc([SPECIES[a.species]?.[0], a.breed, SEX[a.sex], animalAge(a)].filter(Boolean).join(' · '))}</small>
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-dossier="${a.id}">Dossier</button><button class="btn btn-secondary btn-sm" data-edit-animal="${a.id}">Modifier</button><button class="btn btn-secondary btn-sm" data-request="${a.id}">Rendez-vous</button></div></div></div>`).join('')
      : '<p class="empty" style="grid-column:1/-1">Vous n\'avez pas encore ajouté d\'animal.</p>';

    // Profil
    $('#p-name').value = me.full_name || '';
    $('#p-email').value = me.email || '';
    $('#p-phone').value = me.phone || '';
    $('#p-addr').value = me.address || '';
  }

  function rdvItem(r) {
    const canCancel = (r.status === 'requested' || r.status === 'confirmed') && r.starts_at >= now();
    const when = r.status === 'requested' ? `Souhaité le ${fmtDay(r.starts_at)} vers ${fmtTime(r.starts_at)}` : rdvWhen(r);
    return `<div class="item">${dateChip(r.starts_at)}<div class="grow"><b>${esc(r.animal?.name || 'Animal')} · ${esc(r.reason || 'Consultation')}</b>
      <small>${esc(when)}${r.location ? ' · 📍 ' + esc(r.location) : ''}</small>
      ${r.admin_note ? `<small style="color:var(--brown-dark);margin-top:4px">💬 Alexane : ${esc(r.admin_note)}</small>` : ''}
      <div style="margin-top:6px">${statusBadge(r.status)}</div></div>
      <div class="actions">${docs.filter((x) => x.appointment_id === r.id).map((x) => `<button class="btn btn-secondary btn-sm" data-open-doc="${x.id}">📄 Fiche</button>`).join('')}${canCancel ? `<button class="btn btn-danger btn-sm" data-cancel="${r.id}">Annuler</button>` : ''}</div></div>`;
  }

  function requestModal(animalId) {
    if (!animals.length) { toast('Ajoutez d\'abord votre animal.'); return animalModal(); }
    const tomorrow = new Date(Date.now() + 864e5); const min = localDate(tomorrow.toISOString());
    openModal('Demander un rendez-vous', `
      <p style="margin-top:0;color:var(--brown-mid);font-size:14px">Alexane vous confirmera le créneau exact (ou vous en proposera un autre) dans votre espace.</p>
      <div class="field"><label for="r-an">Animal *</label><select class="inp" id="r-an" name="animal_id" required>${animalOptions(animals, animalId)}</select></div>
      <div class="row2"><div class="field"><label for="r-d">Date souhaitée *</label><input class="inp" id="r-d" type="date" name="date" min="${min}" value="${min}" required></div>
      <div class="field"><label for="r-t">Moment de la journée</label><select class="inp" id="r-t" name="time"><option value="09:00">Matin</option><option value="14:00">Après-midi</option><option value="17:30">Fin de journée</option></select></div></div>
      <div class="field"><label for="r-loc">Lieu de la consultation *</label><input class="inp" id="r-loc" name="location" required value="${esc(me.address || '')}" placeholder="Écurie, ferme ou domicile + commune"></div>
      <div class="field"><label for="r-re">Motif *</label><input class="inp" id="r-re" name="reason" required placeholder="Boiterie, suivi, après une chute…"></div>
      <div class="field"><label for="r-no">Précisions</label><textarea class="inp" id="r-no" name="client_note" placeholder="Disponibilités, accès, comportement de l'animal…"></textarea></div>`,
    async (fd) => {
      await API.requestAppointment({ animal_id: fd.get('animal_id'), starts_at: toIso(fd.get('date'), fd.get('time')), location: fd.get('location').trim(), reason: fd.get('reason').trim(), client_note: fd.get('client_note').trim() || null });
      toast('Demande envoyée à Alexane'); filter = 'upcoming'; await load();
    }, 'Envoyer la demande');
  }

  function animalModal(a) {
    const m = openModal(a ? 'Modifier ' + a.name : 'Ajouter un animal', animalFields(a) + (a ? '<p style="margin:0"><button type="button" class="link-btn" id="delAnimal" style="color:var(--ko)">Supprimer cette fiche</button></p>' : ''),
      async (fd) => { await API.saveAnimal({ ...(a ? { id: a.id } : {}), ...readAnimal(fd) }); toast(a ? 'Fiche mise à jour' : 'Animal ajouté'); await load(); });
    const del = $('#delAnimal', m.form);
    if (del) del.onclick = async () => { if (confirm(`Supprimer la fiche de ${a.name} ? Ses rendez-vous passés sont conservés.`)) { await API.deleteAnimal(a.id); m.close(); toast('Fiche supprimée'); await load(); } };
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-request],[data-add-animal],[data-edit-animal],[data-cancel],[data-filter],[data-goto],[data-dossier],[data-open-doc]');
    if (!t) return;
    const d = t.dataset;
    if (d.openDoc) openDocument(docs.find((x) => x.id === d.openDoc));
    else if (d.dossier) { const a = animals.find((x) => x.id === d.dossier); openModal('Dossier de ' + a.name, dossierHtml(a, rdvs, docs), null); }
    else if (d.request !== undefined) requestModal(d.request || undefined);
    else if (d.addAnimal !== undefined) animalModal();
    else if (d.editAnimal) animalModal(animals.find((a) => a.id === d.editAnimal));
    else if (d.filter) { filter = d.filter; render(); }
    else if (d.goto) selectTab(d.goto);
    else if (d.cancel) {
      const r = rdvs.find((x) => x.id === d.cancel);
      if (!confirm(`Annuler le rendez-vous du ${fmtDay(r.starts_at)} pour ${r.animal?.name || 'votre animal'} ?`)) return;
      try { await API.cancelAppointment(r.id); toast('Rendez-vous annulé'); await load(); } catch (err) { toast(err.message); }
    }
  });

  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const fd = new FormData(f);
    try { me = await API.updateProfile(me.id, { full_name: fd.get('full_name').trim(), phone: fd.get('phone').trim() || null, address: fd.get('address').trim() || null }); showMsg($('.msg', f), 'Coordonnées enregistrées.', 'ok'); render(); }
    catch (err) { showMsg($('.msg', f), err.message); }
  });
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const fd = new FormData(f);
    if (fd.get('a') !== fd.get('b')) return showMsg($('.msg', f), 'Les deux mots de passe ne correspondent pas.');
    try { await API.updatePassword(fd.get('a')); f.reset(); showMsg($('.msg', f), 'Mot de passe modifié.', 'ok'); }
    catch (err) { showMsg($('.msg', f), err.message); }
  });

  const selectTab = initTabs();
  await load();
})();
