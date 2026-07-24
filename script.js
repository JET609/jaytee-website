document.addEventListener('DOMContentLoaded', () => {
  const defaultSettings = {
    enableScramble: true,
    enableNavSpy: true,
    enableParallax: true,
    enableTilt: true,
    enableMagnet: true,
    enableCounters: true,
    enableCursor: true,
    enableHeroTilt: true,
    enableAurora: true,
    revealStagger: 70,
    magnetStrength: 14,
    magnetScale: 1.04,
    tiltStrength: 10,
    tiltScale: 1.015,
    tiltMaxTranslation: 8,
    navThreshold: 0.42,
    parallaxIntensity: 0.12,
    counterDuration: 1600,
    anchorScrollDuration: 800
  };

  const settings = {
    ...defaultSettings,
    ...(window.siteFX || {})
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointerFine = window.matchMedia('(pointer: fine)');
  const smallScreen = window.matchMedia('(max-width: 768px)');
  const hasMotion = () => !prefersReducedMotion.matches;
  const nav = document.querySelector('nav');
  const navIndicator = nav ? nav.querySelector('.nav-indicator') : null;
  let activeNavLink;
  let setActiveNavLink = () => {};
  let heroTiltInitialized = false;
  let parallaxInitialized = false;

  const maybeInitHeroTilt = () => {
    if (
      heroTiltInitialized ||
      !hasMotion() ||
      !pointerFine.matches ||
      smallScreen.matches ||
      !settings.enableHeroTilt
    ) {
      return;
    }
    initHeroTilt();
    heroTiltInitialized = true;
  };

  const maybeInitParallax = () => {
    if (
      parallaxInitialized ||
      !hasMotion() ||
      smallScreen.matches ||
      !settings.enableParallax
    ) {
      return;
    }
    initSectionParallax();
    parallaxInitialized = true;
  };

  initYear();
  document.body.classList.add('is-ready');

  initRevealSections();
  initScrollTracker();

  if (hasMotion() && pointerFine.matches && settings.enableCursor) {
    initCursor();
  }

  maybeInitHeroTilt();

  if (hasMotion() && settings.enableScramble) {
    initTextScramble();
  }

  if (settings.enableNavSpy) {
    initNavSpy();
  }

  initSmoothAnchors();

  maybeInitParallax();

  const handleScreenChange = (event) => {
    if (!event.matches) {
      maybeInitHeroTilt();
      maybeInitParallax();
    }
  };

  if (typeof smallScreen.addEventListener === 'function') {
    smallScreen.addEventListener('change', handleScreenChange);
  } else if (typeof smallScreen.addListener === 'function') {
    smallScreen.addListener(handleScreenChange);
  }

  if (hasMotion() && pointerFine.matches && settings.enableTilt) {
    initTiltElements();
  }

  if (hasMotion() && pointerFine.matches && settings.enableMagnet) {
    initMagneticHover();
  }

  if (settings.enableCounters) {
    initStatCounters();
  }

  if (hasMotion() && settings.enableAurora) {
    initAuroraCanvas();
  }

  initContentLoaderPlaceholder();
  initSpotifyEmbed();
  initLanguageParticles();

  function initYear() {
    const yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  function initRevealSections() {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.reveal').forEach((section, index) => {
      section.style.transitionDelay = `${index * settings.revealStagger}ms`;
      revealObserver.observe(section);
    });
  }

  function initScrollTracker() {
    const scrollBar = document.querySelector('.scroll-tracker');
    if (!scrollBar) {
      return;
    }

    const updateScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? (window.scrollY / max) * 100 : 0;
      scrollBar.style.setProperty('--scroll-progress', `${progress}%`);
    };

    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll);
  }

  function initCursor() {
    const cursorOrb = document.querySelector('.cursor-orb');
    if (!cursorOrb) {
      return;
    }

    let orbOffset = cursorOrb.offsetWidth / 2 || 85;
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    let lastX = pointerX;
    let lastY = pointerY;
    // The orb's position is a guess (viewport center) until the first real
    // pointermove; showing it before then paints a stray blob mid-screen on
    // scroll-only interactions.
    let pointerSeen = false;
    let targetScale = 0.92;
    let currentScale = targetScale;
    let framePending = false;
    let hideTimeout;

    const applyTransform = () => {
      framePending = false;
      cursorOrb.style.transform = `translate3d(${pointerX - orbOffset}px, ${pointerY - orbOffset}px, 0) scale(${currentScale.toFixed(3)})`;
    };

    const requestRender = () => {
      if (framePending) {
        return;
      }
      framePending = true;
      requestAnimationFrame(() => {
        currentScale += (targetScale - currentScale) * 0.18;
        applyTransform();
        if (Math.abs(targetScale - currentScale) > 0.005) {
          requestRender();
        }
      });
    };

    const show = () => {
      if (!pointerSeen) {
        return;
      }
      document.body.classList.add('cursor-active');
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        document.body.classList.remove('cursor-active');
        targetScale = 0.92;
        requestRender();
      }, 1400);
    };

    const move = (event) => {
      pointerSeen = true;
      pointerX = event.clientX;
      pointerY = event.clientY;

      if (lastX !== undefined && lastY !== undefined) {
        const distance = Math.min(Math.hypot(pointerX - lastX, pointerY - lastY), 110);
        targetScale = 0.9 + (distance / 110) * 0.4;
      }

      lastX = pointerX;
      lastY = pointerY;
      show();
      requestRender();
    };

    const down = () => {
      targetScale = 0.78;
      show();
      requestRender();
    };

    const up = () => {
      targetScale = 1.08;
      show();
      requestRender();
    };

    const reset = () => {
      clearTimeout(hideTimeout);
      document.body.classList.remove('cursor-active');
      targetScale = 0.9;
      lastX = pointerX;
      lastY = pointerY;
      requestRender();
    };

    const handleResize = () => {
      orbOffset = cursorOrb.offsetWidth / 2 || 85;
      requestRender();
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    window.addEventListener('pointercancel', reset);
    window.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('resize', handleResize);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reset();
      }
    });
    window.addEventListener('scroll', show, { passive: true });

    requestRender();
  }

  function initHeroTilt() {
    const hero = document.querySelector('.hero');
    if (!hero) {
      return;
    }

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const animate = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      hero.style.setProperty('--hero-tilt-x', `${currentX * 6}deg`);
      hero.style.setProperty('--hero-tilt-y', `${currentY * -4}deg`);
      requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener('pointermove', (event) => {
      const bounds = hero.getBoundingClientRect();
      if (event.clientY < bounds.top - 40 || event.clientY > bounds.bottom + 40) {
        return;
      }

      const relativeX = (event.clientX - bounds.left) / bounds.width - 0.5;
      const relativeY = (event.clientY - bounds.top) / bounds.height - 0.5;
      targetX = Math.max(-1, Math.min(1, relativeX * 2));
      targetY = Math.max(-1, Math.min(1, relativeY * 2));
    });

    const resetTilt = () => {
      targetX = 0;
      targetY = 0;
    };

    window.addEventListener('pointerleave', resetTilt);
    window.addEventListener('blur', resetTilt);
  }

  function initTextScramble() {
    const heroTitle = document.querySelector('.hero h1');
    if (!heroTitle) {
      return;
    }

    const finalText = heroTitle.textContent;
    const chars = '!<>-_\\/[]{}—=+*^?#________';
    const queue = finalText.split('').map((char) => {
      const start = Math.floor(Math.random() * 20);
      const end = start + Math.floor(Math.random() * 20) + 10;
      return { char, start, end };
    });

    let frame = 0;
    heroTitle.dataset.scrambleActive = 'true';

    const update = () => {
      let output = '';
      let complete = 0;

      queue.forEach((item) => {
        if (frame >= item.end) {
          complete += 1;
          output += item.char;
        } else if (frame >= item.start) {
          output += chars[Math.floor(Math.random() * chars.length)];
        } else {
          output += item.char;
        }
      });

      heroTitle.textContent = output;

      if (complete === queue.length) {
        heroTitle.textContent = finalText;
        heroTitle.dataset.scrambleActive = 'false';
      } else {
        frame += 1;
        requestAnimationFrame(update);
      }
    };

    requestAnimationFrame(update);
  }

  function initNavSpy() {
    const sections = Array.from(document.querySelectorAll('[data-section]'));
    const navLinks = Array.from(document.querySelectorAll('[data-nav-link]'));

    if (!sections.length || !navLinks.length) {
      return;
    }

    const thresholds = Array.from({ length: 21 }, (_, index) => index / 20);
    const linkMap = new Map(
      navLinks.map((link) => [link.dataset.navLink, link])
    );
    const visibilityMap = new Map();

    const pickActiveSection = () => {
      const viewportFocus = window.innerHeight * 0.32;
      const visibleSections = sections
        .map((section) => {
          const ratio = visibilityMap.get(section) || 0;
          const distance = Math.abs(section.getBoundingClientRect().top - viewportFocus);
          return { section, ratio, distance };
        })
        .filter((item) => item.ratio > 0.04);

      if (visibleSections.length) {
        visibleSections.sort((a, b) => {
          if (Math.abs(b.ratio - a.ratio) > 0.08) {
            return b.ratio - a.ratio;
          }
          return a.distance - b.distance;
        });
        const candidate = visibleSections[0];
        if (candidate.section.id) {
          setActive(candidate.section.id);
        }
        return;
      }

      const fallbackLine = window.scrollY + viewportFocus;
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        if (fallbackLine >= section.offsetTop) {
          setActive(section.id);
          return;
        }
      }
    };

    const updateNavIndicator = (target) => {
      if (!nav || !navIndicator || !target) {
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const linkRect = target.getBoundingClientRect();
      const left = linkRect.left - navRect.left;
      const top = linkRect.top - navRect.top;
      nav.style.setProperty('--nav-indicator-left', `${left}px`);
      nav.style.setProperty('--nav-indicator-top', `${top}px`);
      nav.style.setProperty('--nav-indicator-width', `${linkRect.width}px`);
      nav.style.setProperty('--nav-indicator-height', `${linkRect.height}px`);
      navIndicator.classList.add('is-visible');
    };

    const setActive = (id) => {
      let nextActive = null;
      navLinks.forEach((link) => {
        if (link.dataset.navLink === id) {
          link.classList.add('is-active');
          nextActive = link;
        } else {
          link.classList.remove('is-active');
        }
      });
      if (nextActive) {
        activeNavLink = nextActive;
        updateNavIndicator(nextActive);
      }
    };

    setActiveNavLink = setActive;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibilityMap.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
        });
        pickActiveSection();
      },
      {
        threshold: thresholds,
        rootMargin: '-30% 0px -50% 0px'
      }
    );

    sections.forEach((section) => {
      if (section.id && linkMap.has(section.id)) {
        observer.observe(section);
      }
    });

    let navTicking = false;
    const handleScroll = () => {
      if (navTicking) {
        return;
      }
      navTicking = true;
      requestAnimationFrame(() => {
        navTicking = false;
        pickActiveSection();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    pickActiveSection();

    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        activeNavLink = link;
        updateNavIndicator(link);
      });
    });

    window.addEventListener('resize', () => {
      if (activeNavLink) {
        updateNavIndicator(activeNavLink);
      }
    });
  }

  function initSectionParallax() {
    const sections = Array.from(document.querySelectorAll('[data-scroll-speed]'));
    if (!sections.length) {
      return;
    }

    const states = sections.map(() => ({ current: 0, target: 0 }));
    let rafId = null;

    const computeTargets = () => {
      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        const speed = parseFloat(section.dataset.scrollSpeed || '0.12');
        const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
        const shift = -offset * (speed * settings.parallaxIntensity);
        states[index].target = shift;
      });
    };

    const animate = () => {
      let shouldContinue = false;

      sections.forEach((section, index) => {
        const state = states[index];
        state.current += (state.target - state.current) * 0.12;
        section.style.setProperty('--section-shift', `${state.current}px`);
        if (Math.abs(state.target - state.current) > 0.5) {
          shouldContinue = true;
        }
      });

      if (shouldContinue) {
        rafId = requestAnimationFrame(animate);
      } else {
        rafId = null;
      }
    };

    const handle = () => {
      computeTargets();
      if (!rafId) {
        rafId = requestAnimationFrame(animate);
      }
    };

    handle();
    window.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
  }

  function initSmoothAnchors() {
    const links = Array.from(document.querySelectorAll('a[href^="#"]'));
    if (!links.length) {
      return;
    }

    const navOffset = () => (nav ? nav.offsetHeight + 30 : 20);

    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        const href = link.getAttribute('href');
        if (!href || href.length < 2 || href === '#') {
          return;
        }

        const target = document.querySelector(href);
        if (!target) {
          return;
        }

        const offsetTop = target.getBoundingClientRect().top + window.scrollY - navOffset();
        const navKey = link.dataset.navLink;
        if (navKey) {
          setActiveNavLink(navKey);
        }

        event.preventDefault();
        if (!hasMotion()) {
          window.scrollTo({ top: offsetTop });
          return;
        }

        smoothScrollTo(offsetTop);
      });
    });
  }

  let anchorScrollRaf = null;
  const supportsNativeSmoothScroll = 'scrollBehavior' in document.documentElement.style;

  function smoothScrollTo(targetY) {
    if (anchorScrollRaf) {
      cancelAnimationFrame(anchorScrollRaf);
    }

    if (supportsNativeSmoothScroll) {
      window.scrollTo({
        top: targetY,
        behavior: 'smooth'
      });
      anchorScrollRaf = null;
      return;
    }

    const startY = window.scrollY;
    const distance = targetY - startY;
    const baseDuration = settings.anchorScrollDuration || 800;
    const distanceFactor = Math.min(1.1, Math.abs(distance) / window.innerHeight);
    const duration = Math.max(260, baseDuration * (distanceFactor || 0.6));
    const startTime = performance.now();

    const ease = (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = ease(progress);
      window.scrollTo(0, startY + distance * eased);

      if (progress < 1) {
        anchorScrollRaf = requestAnimationFrame(step);
      } else {
        anchorScrollRaf = null;
      }
    };

    anchorScrollRaf = requestAnimationFrame(step);
  }

  function initSpotifyEmbed() {
    const embed = document.querySelector('.spotify-embed[data-spotify]');
    if (!embed) {
      return;
    }

    const launchButton = embed.querySelector('.spotify-launch');
    const playlistSrc = embed.dataset.playlistSrc;
    if (!launchButton || !playlistSrc) {
      return;
    }

    // A cross-origin iframe's 'load' event fires whether the navigation
    // succeeded or was blocked (by an ad blocker or network policy) --
    // browsers intentionally don't expose that distinction to the embedding
    // page. So instead of guessing at success, only load on an explicit
    // click, and always keep a working direct Spotify link next to it as an
    // unconditional fallback.
    launchButton.addEventListener(
      'click',
      () => {
        const iframe = document.createElement('iframe');
        iframe.title = 'Spotify playlist';
        iframe.width = '100%';
        iframe.height = '152';
        iframe.frameBorder = '0';
        iframe.loading = 'lazy';
        iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
        iframe.src = playlistSrc;
        embed.replaceChildren(iframe);
      },
      { once: true }
    );
  }

  function initLanguageParticles() {
    const wrapper = document.querySelector('.language-particles');
    if (!wrapper) {
      return;
    }

    const languages = [
      'python',
      'typescript',
      'java',
      'c++',
      'go',
      'sql',
      'react',
      'next.js',
      'node',
      'flutter'
    ];

    if (!hasMotion()) {
      languages.slice(0, 6).forEach((language, index) => {
        const tag = document.createElement('span');
        tag.className = 'language-particle is-static';
        tag.textContent = language;
        tag.style.left = `${25 + index * 10}%`;
        tag.style.top = `${30 + (index % 3) * 5}%`;
        wrapper.appendChild(tag);
      });
      return;
    }

    let activeParticles = 0;
    const maxParticles = 14;

    const spawnParticle = () => {
      if (activeParticles >= maxParticles || document.hidden) {
        return;
      }

      const particle = document.createElement('span');
      particle.className = 'language-particle';
      particle.textContent = languages[Math.floor(Math.random() * languages.length)];

      const duration = 2200 + Math.random() * 1800;
      const offsetX = `${(Math.random() * 320 - 160).toFixed(0)}px`;
      const offsetY = `${(Math.random() * 180 - 90).toFixed(0)}px`;
      const rotation = `${(Math.random() * 60 - 30).toFixed(1)}deg`;

      particle.style.setProperty('--duration', `${Math.round(duration)}ms`);
      particle.style.setProperty('--x', offsetX);
      particle.style.setProperty('--y', offsetY);
      particle.style.setProperty('--rot', rotation);
      particle.style.left = `${46 + Math.random() * 8}%`;
      particle.style.top = `${34 + Math.random() * 10}%`;

      activeParticles += 1;
      wrapper.appendChild(particle);

      const cleanup = () => {
        particle.removeEventListener('animationend', cleanup);
        if (particle.parentNode) {
          wrapper.removeChild(particle);
        }
        activeParticles -= 1;
      };

      particle.addEventListener('animationend', cleanup);
    };

    const loop = () => {
      spawnParticle();
      window.setTimeout(loop, 720 + Math.random() * 680);
    };

    loop();
  }

  function initTiltElements() {
    const elements = Array.from(document.querySelectorAll('[data-tilt]'));
    if (!elements.length) {
      return;
    }

    const states = new Map();
    let rafId;

    const ensureState = (element) => {
      if (!states.has(element)) {
        states.set(element, {
          rotateX: 0,
          rotateY: 0,
          targetRotateX: 0,
          targetRotateY: 0,
          translateX: 0,
          translateY: 0,
          targetTranslateX: 0,
          targetTranslateY: 0,
          scale: 1,
          targetScale: 1,
          isPointerOver: false
        });
      }
      return states.get(element);
    };

    const apply = () => {
      const stale = [];

      states.forEach((state, element) => {
        state.rotateX += (state.targetRotateX - state.rotateX) * 0.12;
        state.rotateY += (state.targetRotateY - state.rotateY) * 0.12;
        state.translateX += (state.targetTranslateX - state.translateX) * 0.12;
        state.translateY += (state.targetTranslateY - state.translateY) * 0.12;
        state.scale += (state.targetScale - state.scale) * 0.12;

        element.style.setProperty('--tilt-rotate-x', `${state.rotateX.toFixed(2)}deg`);
        element.style.setProperty('--tilt-rotate-y', `${state.rotateY.toFixed(2)}deg`);
        element.style.setProperty('--tilt-translate-x', `${state.translateX.toFixed(2)}px`);
        element.style.setProperty('--tilt-translate-y', `${state.translateY.toFixed(2)}px`);
        element.style.setProperty('--tilt-scale', state.scale.toFixed(3));

        const almostSettled =
          Math.abs(state.rotateX) < 0.01 &&
          Math.abs(state.rotateY) < 0.01 &&
          Math.abs(state.translateX) < 0.2 &&
          Math.abs(state.translateY) < 0.2 &&
          Math.abs(state.scale - 1) < 0.001;

        if (!state.isPointerOver && almostSettled) {
          stale.push(element);
        }
      });

      stale.forEach((element) => {
        states.delete(element);
        element.classList.remove('is-tilting');
      });

      if (states.size) {
        rafId = requestAnimationFrame(apply);
      } else {
        rafId = null;
      }
    };

    const startRaf = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(apply);
      }
    };

    const handlePointerMove = (event) => {
      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      const relativeX = (event.clientX - rect.left) / rect.width - 0.5;
      const relativeY = (event.clientY - rect.top) / rect.height - 0.5;
      const strength = parseFloat(element.dataset.tiltStrength || settings.tiltStrength);
      const scale = parseFloat(element.dataset.tiltScale || settings.tiltScale || 1.015);
      const translateMax = settings.tiltMaxTranslation;
      const state = ensureState(element);

      state.targetRotateX = relativeY * -strength;
      state.targetRotateY = relativeX * strength;
      state.targetTranslateX = relativeX * translateMax;
      state.targetTranslateY = relativeY * translateMax;
      state.targetScale = scale;
      state.isPointerOver = true;
      element.classList.add('is-tilting');
      startRaf();
    };

    const reset = (event) => {
      const element = event.currentTarget;
      const state = ensureState(element);
      state.targetRotateX = 0;
      state.targetRotateY = 0;
      state.targetTranslateX = 0;
      state.targetTranslateY = 0;
      state.targetScale = 1;
      state.isPointerOver = false;
    };

    elements.forEach((element) => {
      element.addEventListener('pointermove', handlePointerMove);
      element.addEventListener('pointerleave', reset);
      element.addEventListener('blur', reset);
    });
  }

  function initMagneticHover() {
    const targets = Array.from(document.querySelectorAll('[data-magnetic]'));
    if (!targets.length) {
      return;
    }

    targets.forEach((target) => {
      const strength = parseFloat(target.dataset.magneticStrength || settings.magnetStrength);
      const hoverScale = parseFloat(target.dataset.magneticScale || settings.magnetScale);

      const move = (event) => {
        const rect = target.getBoundingClientRect();
        const relativeX = event.clientX - (rect.left + rect.width / 2);
        const relativeY = event.clientY - (rect.top + rect.height / 2);
        const magnetX = (relativeX / rect.width) * strength;
        const magnetY = (relativeY / rect.height) * strength;
        target.style.setProperty('--magnet-x', `${magnetX.toFixed(2)}px`);
        target.style.setProperty('--magnet-y', `${magnetY.toFixed(2)}px`);
        target.style.setProperty('--magnet-scale', hoverScale.toFixed(3));
      };

      const reset = () => {
        target.style.setProperty('--magnet-x', '0px');
        target.style.setProperty('--magnet-y', '0px');
        target.style.setProperty('--magnet-scale', '1');
      };

      target.addEventListener('pointermove', move);
      target.addEventListener('pointerleave', reset);
      target.addEventListener('blur', reset);
    });
  }

  function initStatCounters() {
    const counters = Array.from(document.querySelectorAll('[data-count-to]'));
    if (!counters.length) {
      return;
    }

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const observer = new IntersectionObserver(
      (entries, ob) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target);
            ob.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );

    counters.forEach((counter) => {
      observer.observe(counter);
    });

    function animate(element) {
      const target = Number(element.dataset.countTo);
      if (Number.isNaN(target)) {
        return;
      }
      const suffix = element.dataset.countSuffix || '';
      const duration = Number(element.dataset.countDuration || settings.counterDuration);
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = easeOut(progress);
        const value = Math.round(target * eased);
        element.textContent = `${value}${suffix}`;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          element.textContent = `${target}${suffix}`;
        }
      };

      requestAnimationFrame(tick);
    }
  }

  function initAuroraCanvas() {
    const canvas = document.querySelector('.aurora-canvas');
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const particles = Array.from({ length: 24 }, () => createParticle());
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = 'lighter';

      particles.forEach((particle, index) => {
        particle.angle += particle.speed;
        const baseX = window.innerWidth * (0.15 + particle.orbitX * 0.7);
        const baseY = window.innerHeight * (0.15 + particle.orbitY * 0.7);
        const x = baseX + Math.cos(particle.angle + index) * particle.radius;
        const y = baseY + Math.sin(particle.angle * 1.25) * particle.radius * 0.6;
        const gradient = context.createRadialGradient(x, y, 0, x, y, particle.size);
        gradient.addColorStop(0, `hsla(${particle.hue}, 95%, 65%, ${particle.alpha})`);
        gradient.addColorStop(1, 'transparent');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fill();
      });

      requestAnimationFrame(render);
    };

    resize();
    render();

    window.addEventListener('resize', resize);
  }

  function createParticle() {
    return {
      angle: Math.random() * Math.PI * 2,
      speed: 0.0004 + Math.random() * 0.0009,
      radius: 120 + Math.random() * 260,
      size: 80 + Math.random() * 140,
      hue: 180 + Math.random() * 120,
      alpha: 0.05 + Math.random() * 0.07,
      orbitX: Math.random(),
      orbitY: Math.random()
    };
  }

  function initContentLoaderPlaceholder() {
    // Reserved for future dynamic content hooks.
  }
});
