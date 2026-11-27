document.addEventListener('DOMContentLoaded', function () {
  initResourcesMenu();
  initPhotoGallery();
  initProcessScroller();
  initWhenTabs();
  initBurgerMenu();
  initZoneMap();
  initAccountLinks();
});

// Les boutons « Mon espace » pointent vers espace/connexion.html (version publiée, reliée à Supabase).
// Sur le Mac d'Alexis (serveur local ou fichier ouvert directement), ils ouvrent l'espace de travail
// local « Espace client » (vrais dossiers Consultation/, génération des fiches).
function initAccountLinks() {
  var local = ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) !== -1;
  if (location.protocol !== 'file:' && !local) {
    return;
  }
  var cible = local ? '../Espace%20client/connexion.html' : 'http://localhost:8000/Espace%20client/connexion.html';
  document.querySelectorAll('a.nav-account, a.btn-account').forEach(function (a) {
    a.href = cible;
  });
}

function initZoneMap() {
  const el = document.getElementById('zone-map');
  // Leaflet is only loaded on pages that show the coverage map.
  if (!el || typeof L === 'undefined') {
    return;
  }

  const BAYONNE = [43.4933, -1.4748];
  const towns = [
    ['Bayonne', 43.4933, -1.4748],
    ['Biarritz', 43.4832, -1.5586],
    ['Anglet', 43.485, -1.514],
    ['Boucau', 43.5279, -1.4869],
    ['Bidart', 43.4386, -1.5911],
    ['Saint-Jean-de-Luz', 43.388, -1.6636],
    ['Hendaye', 43.359, -1.7746],
    ['Ustaritz', 43.396, -1.456],
    ['Cambo-les-Bains', 43.36, -1.403],
    ['Hasparren', 43.386, -1.305],
    ['Saint-Pée-sur-Nivelle', 43.356, -1.548],
    ['La Bastide-Clairence', 43.436, -1.236],
    ['Tarnos', 43.541, -1.461],
    ['Capbreton', 43.642, -1.434],
    ['Hossegor', 43.664, -1.396],
    ['Saint-Vincent-de-Tyrosse', 43.662, -1.306],
    ['Peyrehorade', 43.549, -1.115]
  ];

  // Set an initial view before adding any layers: Leaflet can only project
  // points once the map has a center/zoom, otherwise circle/marker layers
  // throw during creation.
  const map = L.map(el, {
    scrollWheelZoom: false,
    // On touch devices a one-finger drag would trap the page scroll, so pan
    // is disabled there; the +/- controls still allow zooming.
    dragging: !L.Browser.mobile
  }).setView(BAYONNE, 9);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18
  }).addTo(map);

  // 50 km coverage radius around Bayonne.
  const radius = L.circle(BAYONNE, {
    radius: 50000,
    color: '#A9633B',
    weight: 1.5,
    fillColor: '#C9A079',
    fillOpacity: 0.1
  }).addTo(map);

  // Each served commune, coloured in the brand dark.
  towns.forEach(function (t) {
    L.circleMarker([t[1], t[2]], {
      radius: 6,
      color: '#FFFFFF',
      weight: 1.5,
      fillColor: '#3A2A1A',
      fillOpacity: 1
    })
      .addTo(map)
      .bindTooltip(t[0], { direction: 'top', offset: [0, -4] });
  });

  map.fitBounds(radius.getBounds(), { padding: [16, 16] });
}

function initBurgerMenu() {
  const header = document.querySelector('.site-header');
  const toggle = header && header.querySelector('.nav-toggle');
  const nav = header && header.querySelector('.site-nav');
  if (!header || !toggle || !nav) {
    return;
  }

  function setOpen(open) {
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  }

  toggle.addEventListener('click', function () {
    setOpen(!header.classList.contains('nav-open'));
  });

  // Close when a menu link is chosen
  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) {
      setOpen(false);
    }
  });

  // Close on Escape or when clicking outside the header
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });

  document.addEventListener('click', function (event) {
    if (header.classList.contains('nav-open') && !header.contains(event.target)) {
      setOpen(false);
    }
  });
}

function initWhenTabs() {
  const tabs = Array.from(document.querySelectorAll('.when-tab'));
  const panels = Array.from(document.querySelectorAll('.when-panel'));
  if (!tabs.length || !panels.length) {
    return;
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      const target = tab.getAttribute('data-when-target');

      tabs.forEach(function (t) {
        const isActive = t === tab;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      panels.forEach(function (panel) {
        const isActive = panel.getAttribute('data-when-panel') === target;
        panel.classList.toggle('is-active', isActive);
        panel.hidden = !isActive;
      });
    });
  });
}

function initProcessScroller() {
  const scroller = document.getElementById('process-scroller');
  if (!scroller || scroller.dataset.scrollerInit) {
    return;
  }
  scroller.dataset.scrollerInit = 'true';

  const steps = Array.from(scroller.querySelectorAll('.process-step'));
  const dots = Array.from(scroller.querySelectorAll('.process-dot'));
  let activeIndex = 0;
  let ticking = false;

  // Read live rather than cached: content above the scroller (e.g. the
  // "Quand consulter" tabs) can change height and shift this section,
  // so a cached position would drift out of sync with the real layout.
  function getScrollerTop() {
    return scroller.getBoundingClientRect().top + window.scrollY;
  }

  function getScrollableDistance() {
    return scroller.offsetHeight - window.innerHeight;
  }

  function setActive(index) {
    if (index === activeIndex) {
      return;
    }
    activeIndex = index;

    steps.forEach(function (step, i) {
      const isActive = i === index;
      step.classList.toggle('is-active', isActive);
      step.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    dots.forEach(function (dot, i) {
      dot.classList.toggle('is-filled', i <= index);
      if (i === index) {
        dot.setAttribute('aria-current', 'step');
      } else {
        dot.removeAttribute('aria-current');
      }
    });
  }

  function updateFromScroll() {
    ticking = false;
    const scrollableDistance = getScrollableDistance();

    if (scrollableDistance <= 0) {
      setActive(0);
      return;
    }

    const scrolled = window.scrollY - getScrollerTop();
    const progress = Math.min(1, Math.max(0, scrolled / scrollableDistance));
    const index = Math.min(steps.length - 1, Math.floor(progress * steps.length));
    setActive(index);
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateFromScroll);
    }
  }, { passive: true });

  window.addEventListener('resize', updateFromScroll);

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      const scrollableDistance = getScrollableDistance();
      // Aim for the middle of step i's scroll range so it lands solidly
      // on that step regardless of rounding.
      const stepCenter = scrollableDistance <= 0 ? 0 : scrollableDistance * (i + 0.5) / steps.length;
      window.scrollTo({ top: getScrollerTop() + stepCenter, behavior: 'smooth' });
    });
  });

  updateFromScroll();
}


// Menu « Ressources » : s'ouvre au survol (ordinateur) ou au toucher/clavier ; ferme en cliquant ailleurs ou avec Échap
function initResourcesMenu() {
  document.querySelectorAll('.nav-dropdown').forEach(function (dd) {
    var btn = dd.querySelector('.nav-drop-btn');
    function setOpen(open) {
      dd.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!dd.classList.contains('open'));
    });
    document.addEventListener('click', function (e) {
      if (!dd.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  });
}

// Page Photos : filtres par espèce et grande visionneuse (flèches, Échap, glisser sur téléphone)
function initPhotoGallery() {
  var gallery = document.querySelector('.photo-gallery');
  var box = document.getElementById('lightbox');
  if (!gallery || !box) return;
  var items = Array.prototype.slice.call(gallery.querySelectorAll('.photo-item'));
  var img = box.querySelector('img');
  var caption = box.querySelector('figcaption');
  var current = 0;
  var lastFocus = null;

  document.querySelectorAll('.photo-filter').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var cat = chip.getAttribute('data-filter');
      document.querySelectorAll('.photo-filter').forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
      items.forEach(function (it) { it.hidden = cat !== 'tout' && it.getAttribute('data-cat') !== cat; });
    });
  });

  function visibles() { return items.filter(function (it) { return !it.hidden; }); }
  function show(i) {
    var list = visibles();
    current = (i + list.length) % list.length;
    var source = list[current].querySelector('img');
    img.src = source.src;
    img.alt = source.alt;
    caption.textContent = source.alt;
  }
  function open(item) {
    lastFocus = document.activeElement;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    show(visibles().indexOf(item));
    box.querySelector('.lightbox-close').focus();
  }
  function close() {
    box.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  items.forEach(function (it) {
    it.querySelector('.photo-open').addEventListener('click', function () { open(it); });
  });
  box.querySelector('.lightbox-close').addEventListener('click', close);
  box.querySelector('.lightbox-prev').addEventListener('click', function () { show(current - 1); });
  box.querySelector('.lightbox-next').addEventListener('click', function () { show(current + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  document.addEventListener('keydown', function (e) {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
  var startX = null;
  box.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', function (e) {
    if (startX === null) return;
    var dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    startX = null;
  });
}
