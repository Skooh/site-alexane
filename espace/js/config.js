// Réglages de l'espace client.
// Tant que SUPABASE_URL est vide (ou sur le Mac, voir js/api.js), l'espace tourne en MODE LOCAL :
// les données restent dans le navigateur, rien n'est envoyé nulle part.
//
// Pour passer en vrai : Supabase > Project Settings > API, puis copier
//   - "Project URL"            -> SUPABASE_URL
//   - "anon public" key        -> SUPABASE_ANON_KEY  (clé publique, prévue pour être dans le site)
window.ESPACE_CONFIG = {
  SUPABASE_URL: 'https://bmfyvkzshrepijvlhvzo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_eWNiOBT6w6xtTtZHphBq0A_Ad1lawgt',  // clé publique (publishable), faite pour être dans le site

  // Inscription des clients depuis le site : fermée tant que l'envoi d'emails n'est pas branché
  // (les comptes sont créés dans Supabase > Authentication > Users > Add user). Mettre true pour ouvrir.
  INSCRIPTIONS_OUVERTES: true,

  // Coordonnées affichées aux clients
  PRATICIENNE: 'Alexane Thomas',
  TELEPHONE: '07 81 78 78 30',
  EMAIL: 'Alexaneosteoanimalier@gmail.com',
  SITE_URL: '../index.html'
};
