// Couche de données : Supabase si configuré, sinon mode démo (localStorage).
// Les pages n'appellent que window.API.*, jamais Supabase directement.
(function () {
  const cfg = window.ESPACE_CONFIG || {};
  // Sur le Mac (serveur local avec les vrais dossiers Consultation/), l'espace reste en mode local
  // même si les clés Supabase sont remplies. Pour tester la version en ligne en local : ajouter
  // ?mode=en-ligne à l'adresse (?mode=local pour revenir). Une fois publié, Supabase est utilisé.
  const modeVoulu = (() => {
    const m = new URLSearchParams(location.search).get('mode');
    try {
      if (m === 'en-ligne' || m === 'local') sessionStorage.setItem('espace-mode', m);
      return sessionStorage.getItem('espace-mode');
    } catch (e) { return m; }
  })();
  const surLeMac = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !!window.DONNEES_LOCALES;
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase) && (!surLeMac || modeVoulu === 'en-ligne');
  const baseUrl = location.href.replace(/[^/]*([?#].*)?$/, '');
  const safeName = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-80);

  /* ================= Supabase ================= */
  function supabaseApi() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const ok = ({ data, error }) => { if (error) throw new Error(translate(error.message)); return data; };
    const RDV_SELECT = '*, animal:animals(id,name,species), client:profiles(id,full_name,phone,email)';

    return {
      demo: false,
      async session() { const { data } = await sb.auth.getSession(); return data.session; },
      onRecovery(cb) { sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') cb(); }); },
      async signUp({ email, password, full_name, phone }) {
        const data = ok(await sb.auth.signUp({ email, password, options: { data: { full_name, phone }, emailRedirectTo: baseUrl + 'index.html' } }));
        return { needsConfirmation: !data.session };
      },
      async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async signOut() { await sb.auth.signOut(); },
      async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: baseUrl + 'connexion.html' })); },
      async updatePassword(password) { ok(await sb.auth.updateUser({ password })); },

      async me() {
        const s = await this.session(); if (!s) return null;
        return ok(await sb.from('profiles').select('*').eq('id', s.user.id).single());
      },
      async updateProfile(id, patch) { return ok(await sb.from('profiles').update(patch).eq('id', id).select().single()); },

      async animals(ownerId) {
        let q = sb.from('animals').select('*').order('name');
        if (ownerId) q = q.eq('owner_id', ownerId);
        return ok(await q);
      },
      async saveAnimal(a) {
        const { id, ...rest } = a;
        if (id) return ok(await sb.from('animals').update(rest).eq('id', id).select().single());
        return ok(await sb.from('animals').insert(rest).select().single());
      },
      async deleteAnimal(id) { ok(await sb.from('animals').delete().eq('id', id)); },

      async appointments(clientId) {
        let q = sb.from('appointments').select(RDV_SELECT).order('starts_at');
        if (clientId) q = q.eq('client_id', clientId);
        return ok(await q);
      },
      async requestAppointment(r) { return ok(await sb.from('appointments').insert(r).select().single()); },
      async cancelAppointment(id) { return ok(await sb.from('appointments').update({ status: 'cancelled' }).eq('id', id).select().single()); },

      // Documents (lecture : client propriétaire ou admin ; ajout/suppression : admin)
      async documents(animalId) {
        let q = sb.from('documents').select('*').order('doc_date', { ascending: false });
        if (animalId) q = q.eq('animal_id', animalId);
        return ok(await q);
      },
      async documentUrl(doc) {
        const data = ok(await sb.storage.from('documents').createSignedUrl(doc.file_path, 600));
        return data.signedUrl;
      },
      async addDocument({ file, ...meta }) {
        const path = `${meta.client_id}/${meta.animal_id}/${Date.now()}-${safeName(file.name)}`;
        ok(await sb.storage.from('documents').upload(path, file, { contentType: file.type }));
        return ok(await sb.from('documents').insert({ ...meta, file_path: path }).select().single());
      },
      async deleteDocument(doc) {
        ok(await sb.from('documents').delete().eq('id', doc.id));
        await sb.storage.from('documents').remove([doc.file_path]);
      },

      // Admin
      // Fiche client créée à la main (sans compte) : reliée au compte de la personne quand elle
      // s'inscrit avec le même email et le confirme (voir supabase/schema-2-clients-sans-compte.sql).
      async createClient(c) {
        const full_name = `${c.prenom} ${c.nom}`.trim();
        const address = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        const { data: p, error } = await sb.from('profiles').insert({
          email: (c.email || '').trim().toLowerCase() || null, full_name, phone: c.telephone || null,
          address: address || null, postal_code: c.code_postal || null, city: c.ville || null, has_account: false
        }).select().single();
        if (error) throw new Error(error.code === '23505' ? 'Un client existe déjà avec cet email.' : error.message);
        const animaux = (c.animaux || []).map((a) => ({ owner_id: p.id, name: a.nom, species: a.espece || 'autre', breed: a.race || null,
          sex: a.sexe || null, birth_date: a.naissance || null, age_text: a.age || null }));
        if (animaux.length) ok(await sb.from('animals').insert(animaux));
        if (c.notes) ok(await sb.from('client_records').upsert({ client_id: p.id, notes: c.notes }));
        return p;
      },
      // Import des données du Mac (mode local : localStorage + IndexedDB + fichiers de Consultation/)
      // vers Supabase, avec la session d'Alexane (admin). Relançable : chaque élément garde sa
      // référence locale (local_ref) et n'est créé qu'une fois.
      async importLocal(onProgress = () => {}) {
        const KINDS_OK = ['fiche', 'ordonnance', 'radio', 'autre'];
        let db = null;
        try { db = JSON.parse(localStorage.getItem('espace-client-demo-v2') || 'null'); } catch (e) { /* rien */ }
        if (!db || !db.profiles) throw new Error('Aucune donnée locale : ouvrez d\'abord l\'espace en mode local (?mode=local) sur ce Mac.');
        const idbGet = (key) => new Promise((res) => {
          const q = indexedDB.open('espace-client-fichiers', 1);
          q.onupgradeneeded = () => q.result.createObjectStore('f');
          q.onerror = () => res(null);
          q.onsuccess = () => { const t = q.result.transaction('f', 'readonly').objectStore('f').get(key); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); };
        });
        const one = async (table, ref) => ok(await sb.from(table).select('id').eq('local_ref', ref).maybeSingle());
        const bilan = { clients: 0, animaux: 0, rdv: 0, documents: 0, deja: 0, erreurs: [] };
        const ids = { profiles: {}, animals: {}, appointments: {} };
        const clients = db.profiles.filter((p) => !p.is_admin);

        for (const [i, p] of clients.entries()) {
          onProgress(`Client ${i + 1}/${clients.length} : ${p.full_name || p.email}`);
          const ref = 'client:' + (p.folder || p.id);
          let row = await one('profiles', ref);
          if (!row && p.email) {
            row = ok(await sb.from('profiles').select('id').ilike('email', p.email.trim()).maybeSingle());
            if (row) ok(await sb.from('profiles').update({ local_ref: ref }).eq('id', row.id));
          }
          if (row) bilan.deja++;
          else {
            row = ok(await sb.from('profiles').insert({ email: (p.email || '').trim().toLowerCase() || null, full_name: p.full_name || null,
              phone: p.phone || null, address: p.address || null, has_account: false, local_ref: ref }).select('id').single());
            bilan.clients++;
          }
          ids.profiles[p.id] = row.id;
          const notes = db.client_records?.[p.id]?.notes;
          if (notes) ok(await sb.from('client_records').upsert({ client_id: row.id, notes }));
        }

        for (const a of db.animals) {
          const owner = ids.profiles[a.owner_id]; if (!owner) continue;
          const op = db.profiles.find((p) => p.id === a.owner_id);
          const ref = 'animal:' + (a.folder && op?.folder ? `${op.folder}/${a.folder}` : a.id);
          let row = await one('animals', ref);
          if (row) bilan.deja++;
          else {
            const date = /^\d{4}-\d{2}-\d{2}$/.test(a.birth_date || '') ? a.birth_date : null;
            row = ok(await sb.from('animals').insert({ owner_id: owner, name: a.name, species: a.species || 'autre', breed: a.breed || null,
              sex: a.sex || null, birth_date: date, age_text: a.age_text || null, notes: a.notes || null, local_ref: ref }).select('id').single());
            bilan.animaux++;
          }
          ids.animals[a.id] = row.id;
          const rec = db.animal_records?.[a.id];
          if (rec && ['antecedents', 'vecu', 'entre_seances', 'notes'].some((k) => (rec[k] || '').trim())) {
            ok(await sb.from('animal_records').upsert({ animal_id: row.id, antecedents: rec.antecedents || null, vecu: rec.vecu || null,
              entre_seances: rec.entre_seances || null, notes: rec.notes || null }));
          }
        }

        for (const r of db.appointments) {
          const client = ids.profiles[r.client_id]; if (!client) continue;
          const ref = 'rdv:' + r.id;
          let row = await one('appointments', ref);
          if (row) bilan.deja++;
          else {
            row = ok(await sb.from('appointments').insert({ client_id: client, animal_id: ids.animals[r.animal_id] || null, starts_at: r.starts_at,
              time_unknown: !!r.time_unknown, duration_min: r.duration_min || 60, location: r.location || null, reason: r.reason || null,
              client_note: r.client_note || null, admin_note: r.admin_note || null, status: r.status || 'done', local_ref: ref }).select('id').single());
            bilan.rdv++;
          }
          ids.appointments[r.id] = row.id;
        }

        const docs = db.documents.filter((d) => ids.animals[d.animal_id] && ids.profiles[d.client_id]);
        for (const [i, d] of docs.entries()) {
          onProgress(`Document ${i + 1}/${docs.length} : ${d.title}`);
          const ref = 'doc:' + (d.url || d.id);
          if (await one('documents', ref)) { bilan.deja++; continue; }
          try {
            const blob = d.url ? await (await fetch(d.url, { cache: 'no-store' })).blob() : await idbGet(d.id);
            if (!blob || !blob.size) throw new Error('fichier introuvable');
            const nom = d.file || d.file_name || `${d.title}.pdf`;
            const path = `${ids.profiles[d.client_id]}/${ids.animals[d.animal_id]}/${safeName(nom)}`;
            ok(await sb.storage.from('documents').upload(path, blob, { contentType: blob.type || 'application/pdf', upsert: true }));
            ok(await sb.from('documents').insert({ animal_id: ids.animals[d.animal_id], client_id: ids.profiles[d.client_id],
              appointment_id: ids.appointments[d.appointment_id] || null, kind: KINDS_OK.includes(d.kind) ? d.kind : 'fiche', title: d.title,
              doc_date: /^\d{4}-\d{2}-\d{2}$/.test(d.doc_date || '') ? d.doc_date : null, file_path: path, local_ref: ref }));
            bilan.documents++;
          } catch (e) { bilan.erreurs.push(`${d.title} : ${e.message}`); }
        }
        return bilan;
      },
      async clients() { return ok(await sb.from('profiles').select('*').eq('is_admin', false).order('full_name')); },
      async createAppointment(r) { return ok(await sb.from('appointments').insert(r).select().single()); },
      async updateAppointment(id, patch) { return ok(await sb.from('appointments').update(patch).eq('id', id).select().single()); },
      async animalRecord(animalId) { return ok(await sb.from('animal_records').select('*').eq('animal_id', animalId).maybeSingle()) || {}; },
      async saveAnimalRecord(animalId, rec) { return ok(await sb.from('animal_records').upsert({ animal_id: animalId, ...rec, updated_at: new Date().toISOString() }).select().single()); },
      async clientRecord(clientId) { return ok(await sb.from('client_records').select('*').eq('client_id', clientId).maybeSingle()) || {}; },
      async saveClientRecord(clientId, rec) { return ok(await sb.from('client_records').upsert({ client_id: clientId, ...rec, updated_at: new Date().toISOString() }).select().single()); }
    };
  }

  function translate(m) {
    const map = {
      'Invalid login credentials': 'Email ou mot de passe incorrect.',
      'Email not confirmed': 'Votre email n\'est pas encore confirmé : cliquez sur le lien reçu par email.',
      'User already registered': 'Un compte existe déjà avec cet email.',
      'Password should be at least 6 characters': 'Le mot de passe doit faire au moins 6 caractères.'
    };
    for (const k in map) if (m && m.includes(k)) return map[k];
    return m || 'Une erreur est survenue.';
  }

  /* ================= Démo locale (localStorage + IndexedDB pour les fichiers) ================= */
  function demoApi() {
    const KEY = 'espace-client-demo-v2';
    const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    const at = (days, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const dayAt = (isoDate, h = 9) => new Date(`${isoDate}T${String(h).padStart(2, '0')}:00`).toISOString();
    const admin = () => ({ id: id(), email: 'alexane@local', full_name: 'Alexane Thomas', phone: '', address: '', is_admin: true });

    // Clients réels importés depuis le dossier Consultation (js/donnees-locales.js)
    function seedFromLocal(src) {
      const db = { session: null, profiles: [admin()], animals: [], appointments: [], documents: [], animal_records: {}, client_records: {} };
      src.clients.forEach((c) => {
        const p = { id: id(), email: c.email || '', full_name: c.full_name, phone: c.phone || '', address: c.address || '', is_admin: false };
        db.profiles.push(p);
        if (c.notes) db.client_records[p.id] = { notes: c.notes };
        c.animals.forEach((a) => {
          const an = { id: id(), owner_id: p.id, name: a.name, species: a.species, breed: null, birth_date: null, sex: null, age_text: a.age || null, notes: null };
          db.animals.push(an);
          db.animal_records[an.id] = { ...a.record };
          const rdvByDate = {};
          a.consultations.forEach((k) => {
            const r = { id: id(), client_id: p.id, animal_id: an.id, starts_at: dayAt(k.date, 12), time_unknown: true, duration_min: 60, location: p.address || null, reason: k.reason, client_note: null, admin_note: null, status: 'done', created_at: new Date().toISOString() };
            db.appointments.push(r); rdvByDate[k.date] = r.id;
          });
          a.documents.forEach((d) => db.documents.push({ id: id(), animal_id: an.id, client_id: p.id, appointment_id: rdvByDate[d.doc_date] || null, kind: d.kind, title: d.title, doc_date: d.doc_date, url: d.url, created_at: new Date().toISOString() }));
        });
      });
      return db;
    }
    // Données fictives, quand aucun import local n'est présent
    function seedFake() {
      const ad = admin();
      const c1 = { id: id(), email: 'claire@demo', full_name: 'Claire Etcheverry', phone: '06 11 22 33 44', address: 'Écurie du Lan, Arcangues', is_admin: false };
      const a1 = { id: id(), owner_id: c1.id, name: 'Tornade', species: 'cheval', breed: 'Selle français', birth_date: '2015-04-10', sex: 'femelle', notes: null };
      const r = (o) => ({ id: id(), duration_min: 60, client_note: null, admin_note: null, created_at: new Date().toISOString(), ...o });
      return {
        session: null, profiles: [ad, c1], animals: [a1], documents: [], animal_records: {}, client_records: {},
        appointments: [
          r({ client_id: c1.id, animal_id: a1.id, starts_at: at(3, 10), location: c1.address, reason: 'Raideur à droite au travail', status: 'confirmed' }),
          r({ client_id: c1.id, animal_id: a1.id, starts_at: at(-40, 9), location: c1.address, reason: 'Suivi saisonnier', status: 'done', admin_note: 'Revoir dans 3 mois.' })
        ]
      };
    }
    const seed = () => (window.DONNEES_LOCALES ? seedFromLocal(window.DONNEES_LOCALES) : seedFake());

    // localStorage, ou à défaut window.name (garde les données d'une page à l'autre dans le même onglet,
    // utile quand la page est ouverte en double-cliquant sur le fichier et que le navigateur bloque localStorage).
    const store = (() => {
      try {
        localStorage.setItem('__test', '1'); localStorage.removeItem('__test');
        return { get: () => localStorage.getItem(KEY), set: (v) => localStorage.setItem(KEY, v) };
      } catch (e) {
        const all = () => { try { return JSON.parse(window.name || '{}'); } catch (_) { return {}; } };
        return { get: () => all()[KEY] || null, set: (v) => { const o = all(); o[KEY] = v; window.name = JSON.stringify(o); } };
      }
    })();
    let db; try { db = JSON.parse(store.get()); } catch (e) {}
    if (!db || !db.profiles) db = seed();

    // Comptes avec mot de passe (js/comptes-locaux.js, créé par outils/compte_local.py).
    // Quand ce fichier existe, la connexion demande email + mot de passe ; sinon, boutons de démo.
    const ACCOUNTS = Array.isArray(window.COMPTES_LOCAUX) ? window.COMPTES_LOCAUX : null;
    function applyAccounts() {
      (ACCOUNTS || []).forEach((acc) => {
        const email = acc.email.toLowerCase();
        let p = acc.admin ? db.profiles.find((x) => x.is_admin) : db.profiles.find((x) => (x.email || '').toLowerCase() === email);
        if (!p && window.DONNEES_LOCALES) {
          // Données enregistrées avant que l'email soit ajouté à la fiche : on retrouve le client par son nom
          const c = window.DONNEES_LOCALES.clients.find((x) => (x.email || '').toLowerCase() === email);
          if (c) p = db.profiles.find((x) => !x.is_admin && x.full_name === c.full_name);
        }
        if (!p) { p = { id: id(), email, full_name: email.split('@')[0], phone: '', address: '', is_admin: !!acc.admin }; db.profiles.push(p); }
        p.email = email; p.pw_sha256 = acc.pw_sha256;
      });
    }
    applyAccounts();

    // À chaque ouverture : relie clients et animaux à leurs dossiers de Consultation/ et recharge
    // la liste des fichiers présents sur le disque (fiches, feuilles déposées). Les notes, rendez-vous
    // et documents ajoutés dans le navigateur sont conservés.
    function syncFromImport() {
      const src = window.DONNEES_LOCALES; if (!src) return;
      src.clients.forEach((c) => {
        const p = db.profiles.find((x) => !x.is_admin && (x.folder === c.folder || x.full_name === c.full_name));
        if (!p) return;
        p.folder = c.folder;
        c.animals.forEach((a) => {
          const an = db.animals.find((x) => x.owner_id === p.id && (x.folder === a.folder || x.name === a.name));
          if (!an) return;
          an.folder = a.folder;
          if (!an.age_text && a.age) an.age_text = a.age;
          if (!an.breed && a.breed) an.breed = a.breed;
          if (!an.sex && a.sex) an.sex = a.sex;
          if (!an.birth_date && a.birth_date) an.birth_date = a.birth_date;
          if (an.species === 'autre' && a.species !== 'autre') an.species = a.species;
          // Consultations ajoutées dans info.md depuis la dernière fois (ex. fiche générée avec fiche.py)
          a.consultations.forEach((k) => {
            if (db.appointments.some((r) => r.animal_id === an.id && localDay(r.starts_at) === k.date)) return;
            db.appointments.push({ id: id(), client_id: p.id, animal_id: an.id, starts_at: new Date(`${k.date}T12:00`).toISOString(), time_unknown: true, duration_min: 60, location: p.address || null, reason: k.reason, client_note: null, admin_note: null, status: 'done', created_at: new Date().toISOString() });
          });
          const kept = db.documents.filter((d) => !(d.animal_id === an.id && d.url));
          const fresh = a.documents.map((d) => {
            const old = db.documents.find((x) => x.url === d.url);
            const rdv = db.appointments.find((r) => r.animal_id === an.id && d.doc_date && localDay(r.starts_at) === d.doc_date);
            return { id: old ? old.id : id(), animal_id: an.id, client_id: p.id, appointment_id: old ? old.appointment_id : (rdv ? rdv.id : null), kind: d.kind, title: d.title, doc_date: d.doc_date, url: d.url, file: d.file, etat: d.etat || '', message: d.message || '', created_at: old ? old.created_at : new Date().toISOString() };
          });
          db.documents = kept.concat(fresh);
        });
      });
    }
    const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    syncFromImport();
    try { store.set(JSON.stringify(db)); } catch (e) {}

    async function sha256(text) {
      if (!(window.crypto && crypto.subtle)) throw new Error('Ce navigateur bloque la vérification du mot de passe ici. Ouvrez l\'espace avec le lanceur « Site Alexane ».');
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    const hashFor = (email, pw) => sha256(`${email.toLowerCase()}:${pw}`);
    const save = () => { try { store.set(JSON.stringify(db)); } catch (e) { throw new Error('Impossible d\'enregistrer dans ce navigateur. Ouvrez l\'espace avec le lanceur « Site Alexane ».'); } };
    const wait = (v) => new Promise((r) => setTimeout(() => r(v === undefined ? v : JSON.parse(JSON.stringify(v))), 80));
    const meRow = () => db.profiles.find((p) => p.id === db.session);
    const isAdmin = () => !!(meRow() && meRow().is_admin);
    const need = () => { if (!meRow()) throw new Error('Session expirée, reconnectez-vous.'); };
    const needAdmin = () => { need(); if (!isAdmin()) throw new Error('Réservé à Alexane.'); };
    const join = (r) => ({ ...r, animal: db.animals.find((a) => a.id === r.animal_id) || null, client: db.profiles.find((p) => p.id === r.client_id) || null });

    // Fichiers ajoutés en démo : IndexedDB (trop gros pour localStorage)
    const idb = () => new Promise((res, rej) => { const q = indexedDB.open('espace-client-fichiers', 1); q.onupgradeneeded = () => q.result.createObjectStore('f'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const idbDo = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('f', mode); const r = fn(t.objectStore('f')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };

    return {
      demo: true,
      strict: !!ACCOUNTS,
      demoAccounts: () => db.profiles.map((p) => ({ id: p.id, full_name: p.full_name, is_admin: p.is_admin })),
      // Accès direct (mode local uniquement) aux comptes déclarés dans comptes-locaux.js
      quickAccounts: () => (ACCOUNTS || []).map((a) => db.profiles.find((p) => (p.email || '').toLowerCase() === a.email.toLowerCase()))
        .filter(Boolean).map((p) => ({ email: p.email, full_name: p.full_name, is_admin: p.is_admin })),
      async quickSignIn(email) {
        const ok = (ACCOUNTS || []).some((a) => a.email.toLowerCase() === String(email).toLowerCase());
        const p = ok && db.profiles.find((x) => (x.email || '').toLowerCase() === String(email).toLowerCase());
        if (!p) throw new Error('Compte introuvable.');
        db.session = p.id; save(); return wait();
      },
      reset() { db = seed(); applyAccounts(); syncFromImport(); save(); },
      async session() { return wait(meRow() ? { user: { id: db.session } } : null); },
      onRecovery() {},
      async signUp({ email, password, full_name, phone }) {
        if (db.profiles.some((p) => p.email && p.email.toLowerCase() === email.toLowerCase())) throw new Error('Un compte existe déjà avec cet email.');
        const p = { id: id(), email, full_name, phone, address: '', is_admin: false, pw_sha256: await hashFor(email, password) };
        db.profiles.push(p); db.session = p.id; save(); return wait({ needsConfirmation: false });
      },
      async signIn(emailOrId, password) {
        const k = String(emailOrId).trim().toLowerCase();
        if (ACCOUNTS) {
          // Connexion avec mot de passe : même message d'erreur que l'email soit inconnu ou le mot de passe faux
          const p = db.profiles.find((x) => (x.email || '').toLowerCase() === k);
          if (!p || !p.pw_sha256 || (await hashFor(k, password || '')) !== p.pw_sha256) throw new Error('Email ou mot de passe incorrect.');
          db.session = p.id; save(); return wait();
        }
        const p = db.profiles.find((x) => x.id === emailOrId || (x.email && x.email.toLowerCase() === k));
        if (!p) throw new Error('Aucun compte local avec cet email.');
        db.session = p.id; save(); return wait();
      },
      async signOut() { db.session = null; save(); },
      async resetPassword() { return wait(); },
      async updatePassword(password) {
        need();
        if (ACCOUNTS && ACCOUNTS.some((a) => a.email.toLowerCase() === (meRow().email || '').toLowerCase())) {
          throw new Error('En mode local, ce mot de passe se change avec outils/compte_local.py.');
        }
        meRow().pw_sha256 = await hashFor(meRow().email || '', password); save(); return wait();
      },
      async me() { return wait(meRow() || null); },
      async updateProfile(pid, patch) { need(); const p = db.profiles.find((x) => x.id === pid); delete patch.is_admin; Object.assign(p, patch); save(); return wait(p); },
      async animals(ownerId) {
        need();
        let l = db.animals.filter((a) => isAdmin() || a.owner_id === db.session);
        if (ownerId) l = l.filter((a) => a.owner_id === ownerId);
        return wait(l.sort((a, b) => a.name.localeCompare(b.name)));
      },
      async saveAnimal(a) {
        need();
        if (a.id) { const x = db.animals.find((y) => y.id === a.id); Object.assign(x, a); save(); return wait(x); }
        const n = { id: id(), owner_id: a.owner_id || db.session, ...a }; db.animals.push(n); save(); return wait(n);
      },
      async deleteAnimal(aid) {
        need();
        db.animals = db.animals.filter((a) => a.id !== aid);
        db.documents = db.documents.filter((d) => d.animal_id !== aid);
        delete db.animal_records[aid];
        db.appointments.forEach((r) => { if (r.animal_id === aid) r.animal_id = null; });
        save();
      },
      async appointments(clientId) {
        need();
        let l = db.appointments.filter((r) => isAdmin() || r.client_id === db.session);
        if (clientId) l = l.filter((r) => r.client_id === clientId);
        return wait(l.map(join).sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      },
      async requestAppointment(r) { need(); const n = { id: id(), duration_min: 60, admin_note: null, created_at: new Date().toISOString(), ...r, client_id: db.session, status: 'requested' }; db.appointments.push(n); save(); return wait(n); },
      async cancelAppointment(rid) { need(); const r = db.appointments.find((x) => x.id === rid); r.status = 'cancelled'; save(); return wait(r); },

      async documents(animalId) {
        need();
        let l = db.documents.filter((d) => isAdmin() || d.client_id === db.session);
        if (animalId) l = l.filter((d) => d.animal_id === animalId);
        return wait(l.sort((a, b) => (b.doc_date || '').localeCompare(a.doc_date || '')));
      },
      // Recharge les données de Consultation/ sans recharger la page
      async refreshLocal() {
        try {
          const txt = await (await fetch('js/donnees-locales.js', { cache: 'no-store' })).text();
          new Function(txt)();
          syncFromImport(); save();
        } catch (e) { /* données locales indisponibles : on garde l'état actuel */ }
      },
      async documentUrl(doc) {
        if (doc.url) return doc.url;
        const blob = await idbDo('readonly', (s) => s.get(doc.id));
        if (!blob) throw new Error('Fichier introuvable dans ce navigateur.');
        return URL.createObjectURL(blob);
      },
      async addDocument({ file, ...meta }) {
        needAdmin();
        const d = { id: id(), created_at: new Date().toISOString(), ...meta, file_name: file.name };
        await idbDo('readwrite', (s) => s.put(file, d.id));
        db.documents.push(d); save(); return wait(d);
      },
      async deleteDocument(doc) {
        needAdmin();
        db.documents = db.documents.filter((d) => d.id !== doc.id); save();
        if (!doc.url) await idbDo('readwrite', (s) => s.delete(doc.id));
      },

      // Client ajouté à la main par Alexane : fiche dans le navigateur + dossiers dans Consultation/ (serveur local)
      // c = { prenom, nom, email, telephone, adresse, code_postal, ville, notes, animaux: [{ nom, espece, race, sexe, naissance, age }] }
      async createClient(c) {
        needAdmin();
        const full = `${c.prenom} ${c.nom}`.trim();
        if (c.email && db.profiles.some((p) => (p.email || '').toLowerCase() === c.email.toLowerCase())) throw new Error('Un client existe déjà avec cet email.');
        if (db.profiles.some((p) => !p.is_admin && (p.full_name || '').toLowerCase() === full.toLowerCase())) throw new Error(`Un client « ${full} » existe déjà.`);
        let surDisque = false;
        try {
          const res = await fetch('/api/nouveau-client', { method: 'POST', headers: { 'X-Depot': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.erreur || 'Création du dossier impossible.');
          surDisque = true;
        } catch (e) {
          if (e instanceof TypeError) surDisque = false; // serveur local injoignable : fiche dans le navigateur seulement
          else throw e;
        }
        const address = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        const p = { id: id(), email: c.email || '', full_name: full, first_name: c.prenom, last_name: c.nom, phone: c.telephone || '', address, is_admin: false };
        db.profiles.push(p);
        if (c.notes) db.client_records[p.id] = { notes: c.notes };
        (c.animaux || []).forEach((a) => db.animals.push({ id: id(), owner_id: p.id, name: a.nom, species: a.espece || 'autre', breed: a.race || null, sex: a.sexe || null, birth_date: a.naissance || null, age_text: a.age || null, notes: null }));
        save();
        if (surDisque) await this.refreshLocal();
        return wait({ ...p, surDisque });
      },
      async clients() { need(); return wait(db.profiles.filter((p) => !p.is_admin).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))); },
      async createAppointment(r) { needAdmin(); const n = { id: id(), duration_min: 60, client_note: null, admin_note: null, created_at: new Date().toISOString(), status: 'confirmed', ...r }; db.appointments.push(n); save(); return wait(n); },
      async updateAppointment(rid, patch) { need(); const r = db.appointments.find((x) => x.id === rid); Object.assign(r, patch); save(); return wait(r); },
      async animalRecord(aid) { needAdmin(); return wait(db.animal_records[aid] || {}); },
      async saveAnimalRecord(aid, rec) { needAdmin(); db.animal_records[aid] = { ...rec, updated_at: new Date().toISOString() }; save(); return wait(db.animal_records[aid]); },
      async clientRecord(cid) { needAdmin(); return wait(db.client_records[cid] || {}); },
      async saveClientRecord(cid, rec) { needAdmin(); db.client_records[cid] = { ...rec, updated_at: new Date().toISOString() }; save(); return wait(db.client_records[cid]); }
    };
  }

  // La démo ne tourne qu'en local : en ligne, sans Supabase, on affiche un message
  // plutôt que de faux clients.
  const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  // La copie publiée (Websitealexane/espace/) n'a pas les données locales : ouverte sur l'ordinateur,
  // elle renvoie vers l'espace de travail (Espace client) au lieu d'afficher des données fictives.
  const isPublishedCopy = isLocal && !useSupabase && !window.DONNEES_LOCALES && !window.COMPTES_LOCAUX && /\/espace\/[^/]*$/.test(location.pathname);
  if (isPublishedCopy) {
    const page = location.pathname.split('/').pop() || 'connexion.html';
    const target = location.pathname.includes('/Websitealexane/espace/')
      ? location.pathname.replace('/Websitealexane/espace/', '/Espace%20client/')
      : 'http://localhost:8000/Espace%20client/' + page;
    const main = document.querySelector('main');
    if (main) main.innerHTML = `<div class="auth"><div class="card"><h1>Version en ligne</h1><p class="sub">Cette page est la copie qui sera publiée avec le site. Sur l'ordinateur, l'espace client se trouve ici :</p><p style="text-align:center"><a class="btn btn-primary" href="${target}">Ouvrir l'espace client</a></p><p class="hint" style="text-align:center">Si le lien ne répond pas, double-cliquez d'abord sur « Site Alexane » dans le dossier site_alexane.</p></div></div>`;
    if (location.protocol !== 'file:' && target.startsWith('/')) location.replace(target);
    const never = () => new Promise(() => {});
    window.API = new Proxy({ demo: false }, { get: (t, k) => (k in t ? t[k] : never) });
  } else if (useSupabase) window.API = supabaseApi();
  else if (isLocal) window.API = demoApi();
  else {
    const main = document.querySelector('main');
    if (main) main.innerHTML = '<div class="auth"><div class="card"><h1>Bientôt disponible</h1><p class="sub">L\'espace client ouvre très prochainement. En attendant, contactez Alexane par téléphone ou par email.</p></div></div>';
    const never = () => new Promise(() => {});
    window.API = new Proxy({ demo: false }, { get: (t, k) => (k in t ? t[k] : never) });
  }
})();
