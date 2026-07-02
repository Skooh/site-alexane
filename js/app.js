document.addEventListener('DOMContentLoaded', function () {
  initProcessScroller();
  initWhenTabs();
  initBurgerMenu();
});

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
