/* Sluis — site behaviour. No dependencies. Everything here enhances a page that already works without it. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const narrow = matchMedia('(max-width: 860px)');
  const EASE_LOCK = 'cubic-bezier(0.65, 0, 0.35, 1)';

  /* ---------- theme ---------- */

  const themeToggles = $$('.theme-toggle');
  const themeMetas = $$('meta[name="theme-color"]');
  const THEME_COLOURS = { light: '#E9ECF1', dark: '#0E1B2C' };
  const theme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  const listeners = [];

  function syncTheme() {
    const t = theme();
    const dark = t === 'dark';
    for (const button of themeToggles) {
      if (button.hasAttribute('data-wide')) {
        button.classList.toggle('is-dark', dark);
        $('.theme-toggle-label', button).textContent = dark ? 'Switch to light' : 'Switch to dark';
      } else {
        button.setAttribute('aria-pressed', String(dark));
      }
    }
    if (root.dataset.theme) for (const meta of themeMetas) meta.setAttribute('content', THEME_COLOURS[t]);
    for (const fn of listeners) fn(t);
  }

  function setTheme(next) {
    try { localStorage.setItem('sluis-theme', next); } catch (e) { /* private mode: the choice lasts for this page only */ }
    const apply = () => { root.dataset.theme = next; syncTheme(); };
    if (document.startViewTransition && !reduceMotion.matches) {
      root.classList.add('theme-rising');
      const transition = document.startViewTransition(apply);
      transition.finished.finally(() => root.classList.remove('theme-rising'));
    } else {
      apply();
    }
  }

  for (const button of themeToggles) {
    button.addEventListener('click', () => setTheme(theme() === 'dark' ? 'light' : 'dark'));
  }
  systemDark.addEventListener('change', () => { if (!root.dataset.theme) syncTheme(); });

  /* ---------- header: a shadow only once it floats over the page ---------- */

  const header = $('.site-header');
  let headerTicking = false;
  const updateHeader = () => { header.classList.toggle('is-floating', window.scrollY > 8); headerTicking = false; };
  window.addEventListener('scroll', () => { if (!headerTicking) { headerTicking = true; requestAnimationFrame(updateHeader); } }, { passive: true });
  updateHeader();

  /* ---------- phone menu ---------- */

  const menu = $('#menu');
  const menuButton = $('.menu-button');
  if (menu && menuButton && typeof menu.showModal === 'function') {
    menuButton.addEventListener('click', () => { menu.showModal(); menuButton.setAttribute('aria-expanded', 'true'); });
    menu.addEventListener('close', () => menuButton.setAttribute('aria-expanded', 'false'));
    $('.menu-close', menu).addEventListener('click', () => menu.close());
    for (const link of $$('a', menu)) link.addEventListener('click', () => menu.close());
    narrow.addEventListener('change', (e) => { if (!e.matches && menu.open) menu.close(); });
  }

  /* ---------- phones: true size, zoomed to fit ---------- */

  const heroPhone = $('#hero-phone');
  const studioPhone = $('#studio-phone');
  const PHONE_W = 360;
  const PHONE_H = 740;

  function fitPhones() {
    if (heroPhone) {
      const column = heroPhone.parentElement.clientWidth;
      let zoom = Math.min(1, column / PHONE_W);
      if (!narrow.matches) {
        // fit the whole screen, tab bar included, inside the first viewport
        let top = 0;
        for (let el = heroPhone; el; el = el.offsetParent) top += el.offsetTop; // layout position, ignoring the entrance transform
        zoom = Math.min(zoom, Math.max(0.68, (window.innerHeight - top - 28) / PHONE_H));
      }
      heroPhone.style.setProperty('--phone-zoom', zoom.toFixed(3));
    }
    if (studioPhone) {
      const stage = studioPhone.parentElement;
      const style = getComputedStyle(stage);
      const inner = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      studioPhone.style.setProperty('--phone-zoom', Math.min(1, inner / PHONE_W).toFixed(3));
    }
  }
  fitPhones();
  window.addEventListener('resize', fitPhones, { passive: true });

  /* ---------- the hero: the same app as a website, then native ---------- */

  const heroSwitch = $('#hero-switch');
  const heroApp = heroPhone && $('.app', heroPhone);
  const heroView = heroApp && $('.app-view', heroApp);
  const water = heroApp && $('.water', heroApp);
  let heroTouched = false;
  let running = null;

  // Plons waves at the website and cheers once the app has risen to native.
  const heroPlons = $('.hero-plons');
  let moodTimer = 0;

  function setMood(mode, delay) {
    if (!heroPlons) return;
    clearTimeout(moodTimer);
    const mood = mode === 'web' ? 'hoi' : 'cheer';
    moodTimer = setTimeout(() => {
      if (heroPlons.dataset.mood === mood) return;
      heroPlons.dataset.mood = mood;
      if (reduceMotion.matches) return;
      $('.plons', heroPlons).animate(
        [{ transform: 'none' }, { transform: 'translateY(-16px)', offset: 0.35 }, { transform: 'scale(1.06, 0.94)', offset: 0.7 }, { transform: 'none' }],
        { duration: 560, easing: 'ease-out' }
      );
    }, delay);
  }

  const modeOf = (view) => (view.dataset.nav === 'web' ? 'web' : view.dataset.platform);

  function applyMode(view, mode) {
    const native = mode !== 'web';
    view.dataset.nav = native ? 'native' : 'web';
    view.dataset.platform = native ? mode : 'ios';
    view.dataset.signin = native ? 'biometric' : 'password';
    view.dataset.reminder = native ? 'push' : 'email';
    view.dataset.scheme = theme();
  }

  function switchHero(mode) {
    const from = modeOf(heroView);
    if (from === mode) return;
    if (running) running.finish();

    const ghost = heroView.cloneNode(true);
    ghost.classList.add('app-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    heroApp.appendChild(ghost);
    applyMode(heroView, mode);

    const changesLevel = (from === 'web') !== (mode === 'web');
    const animations = [];
    setMood(mode, changesLevel && !reduceMotion.matches ? 650 : 0); // as the water reaches the top

    if (reduceMotion.matches) {
      animations.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease', fill: 'forwards' }));
    } else if (changesLevel) {
      // Web to native, the water rises and lifts the new screen in; native to web, it drains.
      const rising = mode !== 'web';
      const duration = 1050;
      animations.push(ghost.animate(
        [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: rising ? 'inset(0 0 100% 0)' : 'inset(100% 0 0 0)' }],
        { duration, easing: EASE_LOCK, fill: 'forwards' }
      ));
      const top = PHONE_H - 4;
      animations.push(water.animate(
        [{ transform: `translateY(${rising ? top : -4}px)`, opacity: 1 }, { opacity: 1, offset: 0.86 }, { transform: `translateY(${rising ? -4 : top}px)`, opacity: 0 }],
        { duration, easing: EASE_LOCK, fill: 'forwards' }
      ));
      animations.push(water.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-40px)' }],
        { duration, easing: 'linear', pseudoElement: '::before' }
      ));
    } else {
      // iOS and Android sit at the same level: a short crossfade.
      animations.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease', fill: 'forwards' }));
    }

    const done = () => { ghost.remove(); water.getAnimations().forEach((a) => a.cancel()); running = null; };
    running = { finish: () => { animations.forEach((a) => a.finish()); done(); } };
    animations[0].finished.then(() => { if (ghost.isConnected) done(); }).catch(() => {});
  }

  if (heroSwitch && heroView) {
    heroSwitch.addEventListener('change', (e) => { heroTouched = true; switchHero(e.target.value); });
    listeners.push(() => { heroView.dataset.scheme = theme(); });
    heroView.dataset.scheme = theme();

    // Play the translation once, shortly after the headline has risen, unless the visitor got there first.
    if (!reduceMotion.matches) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          if (heroTouched) return;
          const r = heroPhone.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) return;
          const ios = $('input[value="ios"]', heroSwitch);
          ios.checked = true;
          switchHero('ios');
        }, 1500);
      });
    }
  }

  /* ---------- the studio: one translation at a time ---------- */

  const controls = $('#studio-controls');
  const studioView = studioPhone && $('.app-view', studioPhone);
  let schemeTouched = false;

  function updateStudio() {
    const f = controls.elements;
    const native = (name) => f[name].value === 'native';
    studioView.dataset.nav = native('nav') ? 'native' : 'web';
    studioView.dataset.sheet = native('sheet') ? 'sheet' : 'modal';
    studioView.dataset.signin = native('signin') ? 'biometric' : 'password';
    studioView.dataset.reminder = native('reminder') ? 'push' : 'email';
    studioView.dataset.platform = f.platform.value;
    studioView.dataset.scheme = f.scheme.value;
    studioView.style.setProperty('--ts', f.size.value);
  }

  if (controls && studioView) {
    const setScheme = (t) => { const radio = $(`input[name="scheme"][value="${t}"]`, controls); if (radio) radio.checked = true; };
    setScheme(theme());
    listeners.push((t) => { if (!schemeTouched) { setScheme(t); updateStudio(); } });
    controls.addEventListener('change', (e) => { if (e.target.name === 'scheme') schemeTouched = true; updateStudio(); });
    controls.addEventListener('input', (e) => { if (e.target.name === 'size') updateStudio(); });
    controls.addEventListener('submit', (e) => e.preventDefault());
    updateStudio();
  }

  /* ---------- the lock: as the drawing passes, the boat is lifted to the upper level ---------- */

  const lockSvg = $('.lock-svg');
  if (lockSvg) {
    const chamber = $('.lock-chamber-water', lockSvg);
    const boat = $('.lock-boat', lockSvg);
    const gateLow = $('.lock-gate-low', lockSvg);
    const gateHigh = $('.lock-gate-high', lockSvg);
    const LOW = 262, HIGH = 152, FLOOR = 352;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const span = (p, a, b) => ease(clamp((p - a) / (b - a), 0, 1));

    const draw = (p) => {
      const enter = span(p, 0.0, 0.22);
      const closeLow = span(p, 0.22, 0.32);
      const fill = span(p, 0.32, 0.66);
      const openHigh = span(p, 0.66, 0.76);
      const leave = span(p, 0.76, 0.98);
      const level = LOW + (HIGH - LOW) * fill;
      chamber.setAttribute('y', level.toFixed(1));
      chamber.setAttribute('height', (FLOOR - level).toFixed(1));
      const x = 112 + (361 - 112) * enter + (612 - 361) * leave;
      boat.setAttribute('transform', `translate(${x.toFixed(1)} ${(level - 8).toFixed(1)})`);
      // tumble gates: each pivots at its foot and lies flat on the bed when open
      gateLow.setAttribute('transform', `rotate(${(-90 * (1 - closeLow)).toFixed(2)} 236 338)`);
      gateHigh.setAttribute('transform', `rotate(${(90 * openHigh).toFixed(2)} 486 234)`);
    };

    if (reduceMotion.matches) {
      draw(0.6); // the boat in the full chamber: the shape of the mark
    } else {
      let near = false;
      let ticking = false;
      const update = () => {
        ticking = false;
        const r = lockSvg.getBoundingClientRect();
        const vh = window.innerHeight;
        draw(clamp((vh * 0.78 - r.top) / (vh * 0.66), 0, 1));
      };
      const onScroll = () => { if (near && !ticking) { ticking = true; requestAnimationFrame(update); } };
      new IntersectionObserver((entries) => { near = entries[0].isIntersecting; if (near) onScroll(); }, { rootMargin: '25% 0px' }).observe(lockSvg);
      window.addEventListener('scroll', onScroll, { passive: true });
      update();
    }
  }

  /* ---------- reveals: once, as each part enters ---------- */

  const revealables = $$('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    revealables.forEach((el) => io.observe(el));
    // never leave a part hidden if the observer is late
    window.addEventListener('load', () => setTimeout(() => {
      for (const el of revealables) {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-in');
      }
    }, 2500));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Plons waves once the close comes into view, and again on hover ---------- */

  const waveArm = $('.book-plons .plons-wave');
  if (waveArm && !reduceMotion.matches && 'IntersectionObserver' in window) {
    const wave = () => {
      if (waveArm.getAnimations().length) return;
      waveArm.animate(
        [{ transform: 'none' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(6deg)' }, { transform: 'none' }],
        { duration: 1700, easing: 'ease-in-out' }
      );
    };
    const plons = waveArm.ownerSVGElement;
    const seen = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      seen.disconnect();
      setTimeout(wave, 700); // after the drawing has risen in
    }, { threshold: 0.6 });
    seen.observe(plons);
    plons.addEventListener('pointerenter', wave);
  }

  /* ---------- questions: on a wide screen, one large answer beside the list ---------- */

  const faq = $('.faq');
  if (faq) {
    const items = $$('.qa', faq);
    const paneText = $('.faq-pane-text', faq);
    let current = null;
    let swap = 0;

    const select = (item) => {
      if (!narrow.matches) item.open = true;
      if (item === current) return;
      current = item;
      const text = $('.qa-answer p', item).textContent;
      clearTimeout(swap);
      paneText.classList.add('is-changing');
      swap = setTimeout(() => { paneText.textContent = text; paneText.classList.remove('is-changing'); }, reduceMotion.matches ? 0 : 150);
    };

    faq.classList.add('is-indexed');
    for (const item of items) {
      const summary = $('summary', item);
      summary.addEventListener('click', (e) => { if (!narrow.matches) { e.preventDefault(); select(item); } });
      summary.addEventListener('mouseenter', () => { if (!narrow.matches) select(item); });
      summary.addEventListener('focus', () => { if (!narrow.matches) select(item); });
    }
    select(items.find((i) => i.open) || items[0]);
  }

  /* ---------- booking: compose the email ---------- */

  const book = $('#book-form');
  if (book) {
    book.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!book.reportValidity()) return;
      const f = book.elements;
      let site = f['Web app'].value.trim();
      if (!/^https?:\/\//i.test(site)) site = 'https://' + site;
      let host = site;
      try { host = new URL(site).host; } catch (err) { /* keep what was typed */ }
      const lines = [`Web app: ${site}`, `Email: ${f.Email.value.trim()}`];
      if (f.Notes.value.trim()) lines.push('', f.Notes.value.trim());
      const href = `mailto:hello@sluis.si?subject=${encodeURIComponent(`Audit request: ${host}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
      window.location.href = href;
    });
  }

  syncTheme();
})();
