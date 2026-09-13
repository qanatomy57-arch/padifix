// ===== LOKATOR — APP.JS =====

// ===== SCENE DATA DEFINITIONS (9 STAGES) =====
const SCENES = [
  {
    index: 0,
    key: 'master',
    title: 'Master Marketplace',
    icon: '⚡',
    proName: 'Verified Artisan Community',
    proSub: '📍 Closest Providers in Real-Time',
    badgeText: '01 / 09',
    glow: 'radial-gradient(circle, rgba(212, 175, 55, 0.22) 0%, rgba(0, 107, 63, 0.28) 45%, transparent 70%)',
    rotateZ: 0,
    scale: 1
  },
  {
    index: 1,
    key: 'electrician',
    title: 'Electrical Services',
    icon: '⚡',
    proName: 'Adebayo Okafor · Master Electrician',
    proSub: '📍 0.8 km away · Surulere, Lagos',
    badgeText: '02 / 09',
    glow: 'radial-gradient(circle, rgba(245, 158, 11, 0.28) 0%, rgba(0, 107, 63, 0.32) 45%, transparent 70%)',
    rotateZ: -1.2,
    scale: 1.02
  },
  {
    index: 2,
    key: 'plumber',
    title: 'Plumbing Services',
    icon: '🔧',
    proName: 'Emeka Musa · Rapid Response Plumber',
    proSub: '📍 1.1 km away · Ikeja, Lagos',
    badgeText: '03 / 09',
    glow: 'radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, rgba(0, 107, 63, 0.3) 45%, transparent 70%)',
    rotateZ: 1.2,
    scale: 1.01
  },
  {
    index: 3,
    key: 'beauty',
    title: 'Beauty & Nail Services',
    icon: '💅',
    proName: 'Chidinma Ikenna · Nail & Beauty Tech',
    proSub: '📍 1.2 km away · Lekki, Lagos',
    badgeText: '04 / 09',
    glow: 'radial-gradient(circle, rgba(244, 114, 182, 0.26) 0%, rgba(212, 175, 55, 0.25) 45%, transparent 70%)',
    rotateZ: -1,
    scale: 1.02
  },
  {
    index: 4,
    key: 'tailor',
    title: 'Fashion & Tailoring',
    icon: '🧵',
    proName: 'Fatima Kawu · Bespoke Fashion Designer',
    proSub: '📍 1.5 km away · Wuse, Abuja',
    badgeText: '05 / 09',
    glow: 'radial-gradient(circle, rgba(168, 85, 247, 0.26) 0%, rgba(0, 107, 63, 0.25) 45%, transparent 70%)',
    rotateZ: 1.4,
    scale: 1.015
  },
  {
    index: 5,
    key: 'mechanic',
    title: 'Auto Services',
    icon: '🔩',
    proName: 'Kabiru Sani · Certified Auto Mechanic',
    proSub: '📍 1.8 km away · Garki, Abuja',
    badgeText: '06 / 09',
    glow: 'radial-gradient(circle, rgba(251, 146, 60, 0.28) 0%, rgba(0, 107, 63, 0.3) 45%, transparent 70%)',
    rotateZ: -1.3,
    scale: 1.02
  },
  {
    index: 6,
    key: 'carpenter',
    title: 'Carpentry & Woodwork',
    icon: '🪚',
    proName: 'Godwin Bassey · Master Wood Craftsman',
    proSub: '📍 2.0 km away · Yaba, Lagos',
    badgeText: '07 / 09',
    glow: 'radial-gradient(circle, rgba(217, 119, 6, 0.26) 0%, rgba(0, 107, 63, 0.25) 45%, transparent 70%)',
    rotateZ: 1.1,
    scale: 1.015
  },
  {
    index: 7,
    key: 'cleaner',
    title: 'Home & Cleaning Services',
    icon: '✨',
    proName: 'Grace Alabi · Professional Cleaner',
    proSub: '📍 0.9 km away · Victoria Island, Lagos',
    badgeText: '08 / 09',
    glow: 'radial-gradient(circle, rgba(45, 212, 191, 0.28) 0%, rgba(0, 107, 63, 0.3) 45%, transparent 70%)',
    rotateZ: -1.2,
    scale: 1.02
  },
  {
    index: 8,
    key: 'finale',
    title: '18,000+ Verified Network',
    icon: '🇳🇬',
    proName: 'PadiFix Verified Network',
    proSub: '📍 Across All 36 Nigerian States',
    badgeText: '09 / 09',
    glow: 'radial-gradient(circle, rgba(34, 197, 94, 0.32) 0%, rgba(212, 175, 55, 0.32) 45%, transparent 70%)',
    rotateZ: 0,
    scale: 1.03
  }
];

// ===== SCROLL DISCOVERY ENGINE (DOCUMENT-DRIVEN STICKY PINNED HERO) =====
class ScrollDiscoveryEngine {
  constructor() {
    this.heroWrapper = document.getElementById('hero');
    this.heroStage = document.getElementById('hero-stage');
    if (!this.heroWrapper) return;

    this.slides = Array.from(document.querySelectorAll('.hero-slide'));
    this.videos = Array.from(document.querySelectorAll('.hero-video'));
    this.timelineSteps = Array.from(document.querySelectorAll('.t-step'));
    this.scrollPrompt = document.getElementById('scroll-prompt');

    this.currentIndex = 0;
    this.currentProgress = 0;
    this.isHeroInViewport = true;
    this.isTicking = false;
    this.activeProgressVideo = null;
    this.activeProgressHandler = null;

    // Explicit Scene Lifecycle states: DISTANT (0), READY (1), ACTIVE (2)
    this.SCENE_STATE = { DISTANT: 0, READY: 1, ACTIVE: 2 };
    this.videoStates = new Array(this.videos.length).fill(this.SCENE_STATE.DISTANT);
    this.loadedVideos = new Set([0]);

    this.init();
  }

  init() {
    // 0. Network, Save-Data, and Reduced Motion Detection
    this.detectNetworkAndDeviceCapabilities();

    // 1. Configure and prime initial video preloads
    this.primeAllVideos();

    // 2. Setup document scroll engine
    this.setupScrollEngine();

    // 3. Viewport observer for hero section (pause all videos when scrolled down page)
    this.setupHeroViewportObserver();

    // 4. Mobile user interaction listener to ensure mobile media autoplay permission on active video
    const unlockActiveVideo = () => {
      if (this.isHeroInViewport) {
        this.playVideo(this.currentIndex);
      }
      this.bindVideoProgress(this.currentIndex);
      window.removeEventListener('touchstart', unlockActiveVideo);
      window.removeEventListener('pointerdown', unlockActiveVideo);
      window.removeEventListener('scroll', unlockActiveVideo);
    };
    window.addEventListener('touchstart', unlockActiveVideo, { passive: true, once: true });
    window.addEventListener('pointerdown', unlockActiveVideo, { passive: true, once: true });
    window.addEventListener('scroll', unlockActiveVideo, { passive: true, once: true });

    // 5. Interactive timeline step clicks
    this.timelineSteps.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const stepIndex = parseInt(btn.dataset.step, 10);
        if (!isNaN(stepIndex)) {
          this.scrollToStep(stepIndex);
        }
      });
    });

    // 6. Scroll prompt click
    if (this.scrollPrompt) {
      this.scrollPrompt.addEventListener('click', () => {
        this.scrollToStep(1);
      });
    }

    // 7. Initial render pass & active state on slide 0
    this.renderProgress(0);
    this.bindVideoProgress(0);
    if (!this.prefersReducedMotion) {
      this.transitionVideoState(0, this.SCENE_STATE.ACTIVE);
    }
  }

  detectNetworkAndDeviceCapabilities() {
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};

    this.effectiveType = conn.effectiveType || '4g';
    this.saveData = conn.saveData === true;
    this.isSlowConnection = ['slow-2g', '2g', '3g'].includes(this.effectiveType) || this.saveData;

    this.prefersReducedMotion = typeof window !== 'undefined' &&
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setupScrollEngine() {
    const onScroll = () => {
      if (this.isTicking) return;
      this.isTicking = true;
      window.requestAnimationFrame(() => {
        this.isTicking = false;
        this.updateScroll();
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  updateScroll() {
    const heroRect = this.heroWrapper.getBoundingClientRect();
    const heroHeight = this.heroWrapper.offsetHeight;
    const windowH = window.innerHeight;
    const scrollDistance = Math.max(1, heroHeight - windowH);
    const scrolledPx = -heroRect.top;

    const rawProgress = scrolledPx / scrollDistance;
    const progress = Math.min(1, Math.max(0, rawProgress));

    this.currentProgress = progress;
    this.renderProgress(progress);
  }

  renderProgress(progress) {
    const totalSlides = this.slides.length;
    const maxIdx = totalSlides - 1;
    const floatIdx = progress * maxIdx;
    const baseIdx = Math.min(maxIdx, Math.floor(floatIdx));
    const nextIdx = Math.min(maxIdx, baseIdx + 1);
    const fraction = floatIdx - baseIdx;

    // Smooth cubic S-curve (3t^2 - 2t^3) for velvety cinematic crossfade transition
    const blend = fraction * fraction * (3 - 2 * fraction);

    // Dominant active scene index
    const dominantIdx = Math.min(maxIdx, Math.max(0, Math.round(floatIdx)));
    if (dominantIdx !== this.currentIndex) {
      this.onDominantSceneChanged(dominantIdx);
    }

    // Explicit Scene Lifecycle state update: At most 2 adjacent videos decode during crossfades
    for (let i = 0; i < totalSlides; i++) {
      let targetState = this.SCENE_STATE.DISTANT;

      if (i === baseIdx) {
        targetState = this.SCENE_STATE.ACTIVE;
      } else if (i === nextIdx && blend > 0.15) {
        targetState = this.SCENE_STATE.ACTIVE;
      } else if (progress > 0.005 && Math.abs(i - dominantIdx) <= 1) {
        targetState = this.SCENE_STATE.READY;
      } else {
        targetState = this.SCENE_STATE.DISTANT;
      }

      this.transitionVideoState(i, targetState);
    }

    // Interpolate slide visibility, opacity and subtle scale/translation
    for (let i = 0; i < totalSlides; i++) {
      const slide = this.slides[i];
      const card = slide.querySelector('.story-card');
      const isDominant = i === dominantIdx;

      if (i === baseIdx) {
        const op = nextIdx === baseIdx ? 1 : 1 - blend;
        slide.style.opacity = op.toFixed(3);
        slide.style.visibility = op > 0.002 ? 'visible' : 'hidden';
        slide.style.zIndex = isDominant ? '10' : '5';
        slide.style.pointerEvents = isDominant ? 'auto' : 'none';
        if (!this.prefersReducedMotion) {
          slide.style.transform = `scale(${(1 + 0.02 * blend).toFixed(4)}) translate3d(0, 0, 0)`;
        } else {
          slide.style.transform = 'none';
        }
        if (card) {
          if (!this.prefersReducedMotion) {
            card.style.transform = `translate3d(0, ${(-16 * blend).toFixed(1)}px, 0)`;
          } else {
            card.style.transform = 'none';
          }
          card.style.opacity = '1';
          card.style.pointerEvents = isDominant ? 'auto' : 'none';
        }
      } else if (i === nextIdx && nextIdx !== baseIdx) {
        const op = blend;
        slide.style.opacity = op.toFixed(3);
        slide.style.visibility = op > 0.002 ? 'visible' : 'hidden';
        slide.style.zIndex = isDominant ? '10' : '5';
        slide.style.pointerEvents = isDominant ? 'auto' : 'none';
        if (!this.prefersReducedMotion) {
          slide.style.transform = `scale(${(0.98 + 0.02 * blend).toFixed(4)}) translate3d(0, 0, 0)`;
        } else {
          slide.style.transform = 'none';
        }
        if (card) {
          if (!this.prefersReducedMotion) {
            card.style.transform = `translate3d(0, ${(16 * (1 - blend)).toFixed(1)}px, 0)`;
          } else {
            card.style.transform = 'none';
          }
          card.style.opacity = '1';
          card.style.pointerEvents = isDominant ? 'auto' : 'none';
        }
      } else {
        slide.style.opacity = '0';
        slide.style.visibility = 'hidden';
        slide.style.zIndex = '1';
        slide.style.pointerEvents = 'none';
        slide.style.transform = 'none';
        if (card) {
          card.style.transform = 'translate3d(0, 0, 0)';
          card.style.opacity = '0';
          card.style.pointerEvents = 'none';
        }
      }
    }

    // Scroll prompt fadeout
    if (this.scrollPrompt) {
      const promptOp = progress < 0.03 ? 1 : 0;
      this.scrollPrompt.style.opacity = promptOp;
      this.scrollPrompt.style.pointerEvents = promptOp ? 'auto' : 'none';
    }

    // Timeline dots progress fill
    this.timelineSteps.forEach((step, idx) => {
      const stepPct = idx / maxIdx;
      const isPast = progress >= stepPct;
      const isActive = idx === dominantIdx;
      step.classList.toggle('active', isActive);
      step.setAttribute('aria-selected', isActive ? 'true' : 'false');
      step.setAttribute('aria-current', isActive ? 'true' : 'false');
      if (isActive || isPast) {
        step.style.setProperty('--video-progress', '100%');
      } else {
        step.style.removeProperty('--video-progress');
      }
    });
  }

  transitionVideoState(idx, targetState) {
    if (this.videoStates[idx] === targetState) return;
    const vid = this.videos[idx];
    if (!vid) return;

    this.videoStates[idx] = targetState;

    if (targetState === this.SCENE_STATE.ACTIVE) {
      if (this.isHeroInViewport) {
        this.playVideo(idx);
      }
    } else if (targetState === this.SCENE_STATE.READY) {
      if (!this.loadedVideos.has(idx)) {
        this.loadedVideos.add(idx);
        vid.preload = 'auto';
        vid.setAttribute('preload', 'auto');
      }
    } else if (targetState === this.SCENE_STATE.DISTANT) {
      this.pauseVideo(idx);
    }
  }

  onDominantSceneChanged(newIndex) {
    this.currentIndex = newIndex;

    this.slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === newIndex);
    });

    // Immediately play the active video and replay on continuous loop
    if (this.isHeroInViewport) {
      this.playVideo(newIndex);
      this.pauseAllVideosExcept(newIndex);
    }

    this.bufferAdjacentVideos(newIndex);
    this.bindVideoProgress(newIndex);
  }

  primeAllVideos() {
    this.videos.forEach((vid, i) => {
      vid.muted = true;
      vid.defaultMuted = true;
      vid.playsInline = true;
      vid.loop = true;
      vid.setAttribute('playsinline', '');
      vid.setAttribute('webkit-playsinline', '');
      vid.setAttribute('muted', '');
      vid.setAttribute('loop', '');

      if (i === 0) {
        vid.preload = 'auto';
        vid.setAttribute('preload', 'auto');
      } else {
        vid.preload = 'none';
        vid.setAttribute('preload', 'none');
      }

      // Continuous loop replay handler
      vid.addEventListener('ended', () => {
        vid.currentTime = 0;
        vid.play().catch(() => {});
      });

      // Error handler for graceful poster image fallback
      vid.addEventListener('error', () => {
        vid.style.opacity = '0';
      }, { once: true });

      // Pause non-initial videos at boot
      if (i !== 0) {
        vid.pause();
      }
    });

    // Start video 0 immediately
    this.playVideo(0);
  }

  setupHeroViewportObserver() {
    // Pause hero videos when user scrolls down to downstream homepage sections
    this.heroViewportObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        this.isHeroInViewport = entry.isIntersecting;
        if (!this.isHeroInViewport) {
          this.pauseAllVideos();
          if (this.activeProgressVideo && this.activeProgressHandler) {
            this.activeProgressVideo.removeEventListener('timeupdate', this.activeProgressHandler);
          }
        } else {
          this.playVideo(this.currentIndex);
          this.bindVideoProgress(this.currentIndex);
        }
      });
    }, { threshold: 0.05 });

    this.heroViewportObserver.observe(this.heroWrapper);
  }

  bindVideoProgress(idx) {
    if (this.activeProgressVideo && this.activeProgressHandler) {
      this.activeProgressVideo.removeEventListener('timeupdate', this.activeProgressHandler);
      this.activeProgressVideo = null;
      this.activeProgressHandler = null;
    }

    const currentVideo = this.videos[idx];
    const currentStep = this.timelineSteps[idx];
    if (!currentVideo || !currentStep) return;

    this.activeProgressHandler = () => {
      if (currentVideo.duration && !isNaN(currentVideo.duration) && currentVideo.duration > 0) {
        const pct = Math.min(100, Math.max(0, (currentVideo.currentTime / currentVideo.duration) * 100));
        currentStep.style.setProperty('--video-progress', `${pct.toFixed(1)}%`);
      }
    };

    currentVideo.addEventListener('timeupdate', this.activeProgressHandler, { passive: true });
    this.activeProgressVideo = currentVideo;
  }

  bufferAdjacentVideos(centerIdx) {
    if (this.isSlowConnection || this.saveData) {
      return;
    }

    this.videos.forEach((vid, idx) => {
      if (Math.abs(idx - centerIdx) <= 1) {
        if (!this.loadedVideos.has(idx)) {
          this.loadedVideos.add(idx);
          vid.preload = 'auto';
          vid.setAttribute('preload', 'auto');
        }
      } else if (idx !== centerIdx) {
        vid.pause();
      }
    });
  }

  playVideo(idx) {
    if (idx < 0 || idx >= this.videos.length) return;
    const vid = this.videos[idx];
    if (!vid) return;

    vid.muted = true;
    vid.defaultMuted = true;
    vid.playsInline = true;
    vid.loop = true;
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.setAttribute('muted', '');
    vid.setAttribute('loop', '');

    if (!this.loadedVideos.has(idx)) {
      this.loadedVideos.add(idx);
      vid.preload = 'auto';
      vid.setAttribute('preload', 'auto');
    }

    if (vid.ended) {
      vid.currentTime = 0;
    }

    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        const retryPlay = () => {
          if (this.currentIndex === idx || this.videoStates[idx] === this.SCENE_STATE.ACTIVE) {
            vid.play().catch(() => {});
          }
        };
        vid.addEventListener('canplay', retryPlay, { once: true });
        vid.addEventListener('loadeddata', retryPlay, { once: true });
      });
    }
  }

  pauseVideo(idx) {
    if (idx < 0 || idx >= this.videos.length) return;
    const vid = this.videos[idx];
    if (!vid || vid.paused) return;
    vid.pause();
  }

  pauseAllVideosExcept(activeIdx) {
    this.videos.forEach((vid, i) => {
      if (i !== activeIdx) {
        vid.pause();
      }
    });
  }

  pauseAllVideos() {
    this.videos.forEach(vid => vid.pause());
  }

  scrollToStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.slides.length) return;
    if (this.prefersReducedMotion) {
      this.currentIndex = stepIndex;
      this.currentProgress = stepIndex / (this.slides.length - 1);
      this.renderProgress(this.currentProgress);
      this.onDominantSceneChanged(stepIndex);
      return;
    }

    const heroRect = this.heroWrapper.getBoundingClientRect();
    const runwayTop = heroRect.top + window.scrollY;
    const scrollDistance = Math.max(1, this.heroWrapper.offsetHeight - window.innerHeight);
    const targetScroll = runwayTop + (stepIndex / (this.slides.length - 1)) * scrollDistance;

    window.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  }

  // Smooth hero scroll release helper for downstream sections after scene 9
  releaseToDownstream() {
    const downstreamSection = document.getElementById('browse-skills') || document.getElementById('how-it-works') || document.querySelector('.why-padifix') || document.querySelector('.why-lokator');
    if (downstreamSection) {
      downstreamSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

// Initialize Discovery Engine on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.lokatorDiscovery = new ScrollDiscoveryEngine();
  window.padiFixDiscovery = window.lokatorDiscovery;
});

// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// ===== PHASE 10.19: MOBILE NAVIGATION DRAWER & HAMBURGER CONTROL =====
const hamburger = document.getElementById('hamburger');
const mobileDrawer = document.getElementById('mobile-nav-drawer');
const mobileBackdrop = document.getElementById('mobile-nav-backdrop');
const drawerCloseBtn = document.getElementById('mobile-nav-close-btn');
const navLinks = document.getElementById('nav-links');

function openMobileNav() {
  if (mobileDrawer) {
    mobileDrawer.classList.add('open');
    mobileDrawer.setAttribute('aria-hidden', 'false');
  }
  if (mobileBackdrop) {
    mobileBackdrop.classList.add('open');
    mobileBackdrop.setAttribute('aria-hidden', 'false');
  }
  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'true');
  }
  if (navLinks) {
    navLinks.classList.add('open');
  }
  document.body.classList.add('mobile-nav-open');
  if (drawerCloseBtn) drawerCloseBtn.focus();
}

function closeMobileNav() {
  if (mobileDrawer) {
    mobileDrawer.classList.remove('open');
    mobileDrawer.setAttribute('aria-hidden', 'true');
  }
  if (mobileBackdrop) {
    mobileBackdrop.classList.remove('open');
    mobileBackdrop.setAttribute('aria-hidden', 'true');
  }
  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.focus();
  }
  if (navLinks) {
    navLinks.classList.remove('open');
  }
  document.body.classList.remove('mobile-nav-open');
}

if (hamburger) {
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = mobileDrawer ? mobileDrawer.classList.contains('open') : (navLinks && navLinks.classList.contains('open'));
    if (isOpen) {
      closeMobileNav();
    } else {
      openMobileNav();
    }
  });
}

if (drawerCloseBtn) {
  drawerCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMobileNav();
  });
}

if (mobileBackdrop) {
  mobileBackdrop.addEventListener('click', closeMobileNav);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mobileDrawer && mobileDrawer.classList.contains('open')) {
    closeMobileNav();
  }
});

if (navLinks) {
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      closeMobileNav();
    });
  });
}

// ===== SCROLL REVEAL ANIMATION (Downstream Sections) =====
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

const revealElements = document.querySelectorAll(
  '.step, .cat-item, .why-card, .tp-card, .provider-card'
);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  revealElements.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = `opacity 0.45s ${i * 0.05}s ease, transform 0.45s ${i * 0.05}s ease`;
    revealObserver.observe(el);
  });
}

// ===== COUNTER ANIMATION =====
function animateCounter(el, target, suffix = '') {
  const duration = 1600;
  const startTime = performance.now();
  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(target * eased);
    el.textContent = current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

const heroStats = document.querySelector('.hero-stats');
if (heroStats && !prefersReducedMotion) {
  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const stats = heroStats.querySelectorAll('.hstat strong');
        if (stats[0]) animateCounter(stats[0], 18000, '+');
        if (stats[1]) animateCounter(stats[1], 36, '');
        statsObserver.unobserve(heroStats);
      }
    });
  }, { threshold: 0.2 });
  statsObserver.observe(heroStats);
}

// ===== DYNAMIC HOMEPAGE TOP-RATED PROVIDERS FROM SUPABASE =====
async function loadDynamicTopProviders() {
  const tpGrid = document.querySelector('.tp-grid');
  if (!tpGrid || typeof LokatorDB === 'undefined') return;

  const escapeHtml = (typeof window !== 'undefined' && window.escapeHtml) ||
                     (typeof LokatorDB !== 'undefined' && LokatorDB.escapeHtml) ||
                     ((v) => (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'));

  try {
    const featured = await LokatorDB.getTopFeaturedProviders(3);
    if (featured && featured.length > 0) {
      tpGrid.innerHTML = featured.map((p, idx) => {
        const safeId = parseInt(p.id, 10) || 0;
        const initials = String(p.name || 'Pro').split(' ').filter(Boolean).map(n => n && n[0] ? n[0] : '').join('').substring(0, 2).toUpperCase() || 'PR';
        const PhoneEngine = (typeof NigeriaPhone !== 'undefined' ? NigeriaPhone : null) || (typeof window !== 'undefined' ? window.NigeriaPhone : null);
        const telUrl = PhoneEngine ? PhoneEngine.buildTelUrl(p) : (p.phone ? `tel:${p.phone}` : '');
        const waUrl = PhoneEngine ? PhoneEngine.buildWhatsAppUrl(p, { service: p.trade, location: p.area }) : '';

        const safeRating = Number(p.rating || 5).toFixed(1);
        const safeReviews = parseInt(p.reviewsCount || 0, 10);
        const safeAvatarBg = (p.avatarBg && typeof p.avatarBg === 'string' && p.avatarBg.startsWith('linear-gradient')) ? p.avatarBg : 'var(--green)';

        const callActionHtml = telUrl ? `<a href="${escapeHtml(telUrl)}" class="action-btn call-btn sm" aria-label="Call ${escapeHtml(p.name)}">📞 Call</a>` : '';
        const waActionHtml = waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="action-btn wa-btn sm" aria-label="WhatsApp ${escapeHtml(p.name)}">💬 WhatsApp</a>` : '';

        return `
          <div class="tp-card ${idx === 1 ? 'tp-featured' : ''}" id="tp-${safeId}">
            ${idx === 1 ? '<span class="tp-featured-label">⭐ Top Rated</span>' : ''}
            <div class="tp-top">
              <a href="profile.html?id=${safeId}" class="tp-card-link">
                <div class="tp-avatar" style="background: ${safeAvatarBg};">${escapeHtml(initials)}</div>
              </a>
              <div class="tp-details">
                <a href="profile.html?id=${safeId}" class="tp-card-link">
                  <strong>${escapeHtml(p.name)}</strong>
                </a>
                <span class="verified-badge sm">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Verified
                </span>
              </div>
            </div>
            <span class="tp-trade">${escapeHtml(p.trade)}</span>
            <div class="tp-rating">★★★★★ <span>${safeRating} (${safeReviews})</span></div>
            <span class="tp-loc">📍 ${escapeHtml(p.area)}</span>
            <div class="tp-actions">
              ${callActionHtml}
              ${waActionHtml}
              <a href="profile.html?id=${safeId}" class="action-btn profile-btn sm">View Profile</a>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (e) {
    console.warn('Could not load dynamic top providers from Supabase:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadDynamicTopProviders();
    setupFunnelTelemetryListeners();
    setupHeroSearchCard();
  });
} else {
  loadDynamicTopProviders();
  setupFunnelTelemetryListeners();
  setupHeroSearchCard();
}

function setupFunnelTelemetryListeners() {
  // Category browse clicks on homepage
  document.querySelectorAll('.cat-item').forEach(cat => {
    cat.addEventListener('click', () => {
      if (typeof LokatorTelemetry !== 'undefined') {
        const href = cat.getAttribute('href') || '';
        const match = href.match(/[?&]service=([^&#]*)/);
        const catSlug = match ? decodeURIComponent(match[1]) : (href.includes('service=') ? (href.split('service=')[1]?.split('&')[0] || 'all') : 'all');
        LokatorTelemetry.trackEvent('category_browse_clicked', {
          category: catSlug,
          source: 'home_categories'
        });
      }
    });
  });

  // Registration CTA clicks on homepage
  document.querySelectorAll('a[href*="register.html"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('registration_cta_clicked', { source: 'home_page' });
      }
    });
  });

  // Testimonials Continuous Marquee Integrity
  const testiTrack = document.getElementById('testi-track');
  if (testiTrack) {
    // Ensure track remains running continuously without disruption
    testiTrack.classList.remove('is-paused');
  }
}

// ===== PHASE 10.17: HERO SEARCH CARD & AUTOCOMPLETE ENGINE =====
function setupHeroSearchCard() {
  const serviceInput = document.getElementById('service-input');
  const locationInput = document.getElementById('location-input');
  const searchBtn = document.getElementById('search-btn');
  const gpsBtn = document.getElementById('gps-btn');
  const serviceSuggestions = document.getElementById('hero-service-suggestions');
  const locationSuggestions = document.getElementById('hero-location-suggestions');

  let selectedState = '';
  let selectedLga = '';
  let userCoords = null;

  // Pre-load previously detected session location
  try {
    const savedLoc = sessionStorage.getItem('lokator_temp_location_name');
    const savedLat = sessionStorage.getItem('lokator_temp_lat');
    const savedLng = sessionStorage.getItem('lokator_temp_lng');
    const savedState = sessionStorage.getItem('lokator_temp_state');
    const savedLga = sessionStorage.getItem('lokator_temp_lga');

    if (savedLoc && locationInput && !locationInput.value) {
      locationInput.value = savedLoc;
      if (savedState) selectedState = savedState;
      if (savedLga) selectedLga = savedLga;
      if (savedLat && savedLng) {
        userCoords = { lat: parseFloat(savedLat), lng: parseFloat(savedLng) };
      }
    }
  } catch (e) {}

  function executeSearch() {
    const service = (serviceInput ? serviceInput.value : '').trim();
    const loc = (locationInput ? locationInput.value : '').trim();

    const params = new URLSearchParams();
    if (service) params.set('service', service);
    if (loc) params.set('location', loc);
    if (selectedState) params.set('state', selectedState);
    if (selectedLga) params.set('lga', selectedLga);
    if (userCoords) {
      params.set('lat', userCoords.lat.toString());
      params.set('lng', userCoords.lng.toString());
      params.set('near_me', 'true');
    }

    if (typeof LokatorTelemetry !== 'undefined') {
      LokatorTelemetry.trackEvent('hero_search_submitted', { service, location: loc, state: selectedState, lga: selectedLga });
    }

    window.location.href = `search.html?${params.toString()}`;
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeSearch();
    });
  }

  if (serviceInput) {
    serviceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
      }
    });

    serviceInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (!serviceSuggestions) return;
      if (!q) {
        serviceSuggestions.style.display = 'none';
        return;
      }

      const suggestions = (typeof LokatorDB !== 'undefined' && LokatorDB.getSkillSuggestions)
        ? LokatorDB.getSkillSuggestions(q, 5)
        : ['Electrician', 'Plumber', 'Solar Installer', 'Nail Tech', 'Carpenter', 'Mechanic'].filter(s => s.toLowerCase().includes(q.toLowerCase()));

      if (suggestions.length === 0) {
        serviceSuggestions.style.display = 'none';
        return;
      }

      serviceSuggestions.innerHTML = suggestions.map(s => `
        <div class="suggestion-item" data-val="${escapeHtml(s)}">
          <span>⚡ ${escapeHtml(s)}</span>
        </div>
      `).join('');
      serviceSuggestions.style.display = 'block';
    });

    serviceInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (serviceSuggestions) serviceSuggestions.style.display = 'none';
      }, 200);
    });
  }

  if (serviceSuggestions) {
    serviceSuggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (item && item.dataset.val) {
        if (serviceInput) serviceInput.value = item.dataset.val;
        serviceSuggestions.style.display = 'none';
        if (locationInput) locationInput.focus();
      }
    });
  }

  if (locationInput) {
    locationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
      }
    });

    locationInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (!locationSuggestions || typeof NigeriaLocations === 'undefined') return;
      if (!q) {
        locationSuggestions.style.display = 'none';
        return;
      }

      const matches = NigeriaLocations.searchLocations(q, 5);
      if (matches.length === 0) {
        locationSuggestions.style.display = 'none';
        return;
      }

      locationSuggestions.innerHTML = matches.map(m => `
        <div class="suggestion-item" data-state="${escapeHtml(m.state)}" data-lga="${escapeHtml(m.lga || '')}" data-formatted="${escapeHtml(m.formatted)}">
          <span>📍 ${escapeHtml(m.formatted)}</span>
        </div>
      `).join('');
      locationSuggestions.style.display = 'block';
    });

    locationInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (locationSuggestions) locationSuggestions.style.display = 'none';
      }, 200);
    });
  }

  if (locationSuggestions) {
    locationSuggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (item && item.dataset.formatted) {
        if (locationInput) locationInput.value = item.dataset.formatted;
        selectedState = item.dataset.state || '';
        selectedLga = item.dataset.lga || '';
        locationSuggestions.style.display = 'none';
      }
    });
  }

  if (gpsBtn) {
    gpsBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!('geolocation' in navigator)) {
        alert('Geolocation is not supported by your device browser.');
        return;
      }

      gpsBtn.classList.add('is-loading');
      if (locationInput) {
        locationInput.value = '';
        locationInput.placeholder = '📍 Detecting precise location...';
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          gpsBtn.classList.remove('is-loading');
          gpsBtn.style.background = '#006B3F';
          gpsBtn.style.color = '#fff';

          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          userCoords = { lat, lng };

          let resolved = null;
          if (typeof NigeriaLocations !== 'undefined' && NigeriaLocations.reverseGeocode) {
            resolved = await NigeriaLocations.reverseGeocode(lat, lng);
          } else if (typeof NigeriaLocations !== 'undefined' && NigeriaLocations.findNearest) {
            resolved = NigeriaLocations.findNearest(lat, lng);
          }

          const detectedName = (resolved && resolved.formatted) ? resolved.formatted : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          if (locationInput) {
            locationInput.value = detectedName;
          }

          if (resolved) {
            selectedState = resolved.state || '';
            selectedLga = resolved.lga || '';
          }

          try {
            sessionStorage.setItem('lokator_temp_lat', lat.toString());
            sessionStorage.setItem('lokator_temp_lng', lng.toString());
            sessionStorage.setItem('lokator_temp_location_name', detectedName);
            if (resolved && resolved.state) sessionStorage.setItem('lokator_temp_state', resolved.state);
            if (resolved && resolved.lga) sessionStorage.setItem('lokator_temp_lga', resolved.lga);
          } catch (err) {}

          if (typeof LokatorTelemetry !== 'undefined' && LokatorTelemetry.trackEvent) {
            LokatorTelemetry.trackEvent('gps_location_detected', { lat, lng, locality: detectedName });
          }
        },
        (err) => {
          gpsBtn.classList.remove('is-loading');
          gpsBtn.style.background = 'rgba(220, 38, 38, 0.15)';
          gpsBtn.style.color = '#EF4444';
          if (locationInput) locationInput.placeholder = 'Your area, LGA or city (e.g. Surulere, Ikeja)...';
          
          let errMsg = 'Could not detect your GPS location.';
          if (err.code === 1) errMsg = 'Location access was denied. Please allow location permissions in your browser or select your city manually.';
          else if (err.code === 2) errMsg = 'Location unavailable. Please check your device location settings.';
          else if (err.code === 3) errMsg = 'Location request timed out.';
          alert(errMsg);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  }
}
