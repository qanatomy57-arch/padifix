// ============================================================================
// LOKATOR SEARCH & FILTER ENGINE (search.js) — SUPABASE REAL BACKEND INTEGRATION
// Flexible multi-skill discovery, natural language query intent, live suggestions & distance ranking
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Safe HTML Escaping Helper (Inherits from LokatorDB / window or fallback)
  const escapeHtml = (typeof window !== 'undefined' && window.escapeHtml) ||
                     (typeof LokatorDB !== 'undefined' && LokatorDB.escapeHtml) ||
                     ((v) => (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'));

  // State Management
  const state = {
    keyword: "",
    category: "all",
    industry: "all",
    specialization: "all",
    city: "all",
    state: "all",
    lga: "all",
    locality: "all",
    locationQuery: "",
    source: "marketplace",
    maxDistance: 50,
    minRating: 0,
    verifiedOnly: false,
    availableOnly: false,
    sortBy: "distance-asc",
    userCoords: null,
    page: 1,
    pageSize: 20,
    isLoading: false,
    forceLiteral: false,
    totalCount: 0
  };

  // DOM Elements
  const searchInput = document.getElementById("keyword-search") || document.getElementById("search-input");
  const suggestionsDropdown = document.getElementById("search-suggestions");
  const categorySelect = document.getElementById("category-select");
  const stateSelect = document.getElementById("state-select");
  const lgaSelect = document.getElementById("lga-select");
  const localitySelect = document.getElementById("locality-select");
  const lgaFilterGroup = document.getElementById("lga-filter-group");
  const localityFilterGroup = document.getElementById("locality-filter-group");
  const citySelect = document.getElementById("city-select");
  const locationSearch = document.getElementById("location-search");
  const locationSuggestions = document.getElementById("location-suggestions");
  const gpsTrigger = document.getElementById("gps-trigger");
  const distanceRange = document.getElementById("distance-range");
  const distanceVal = document.getElementById("distance-val");
  const sortSelect = document.getElementById("sort-select");
  const verifiedOnlyCb = document.getElementById("verified-only");
  const availableOnlyCb = document.getElementById("available-only");
  const ratingPills = document.getElementById("rating-pills");
  const resetFiltersBtn = document.getElementById("reset-filters");
  const providersContainer = document.getElementById("providers-container");
  const resultsCountText = document.getElementById("results-count-text");
  const activeFilterTags = document.getElementById("active-filter-tags");
  const emptyState = document.getElementById("empty-state");
  const paginationControls = document.getElementById("pagination-controls");
  const profileModal = document.getElementById("profile-modal");
  const modalBody = document.getElementById("modal-body");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const applyMainSearchBtn = document.getElementById("apply-main-search");
  const breadcrumbsNav = document.getElementById("marketplace-breadcrumbs");
  const browseSection = document.getElementById("marketplace-browse-section");
  const industryCardsGrid = document.getElementById("industry-cards-grid");
  const filterSidebar = document.getElementById("filter-sidebar");
  const filterBackdrop = document.getElementById("filter-backdrop");
  const mobileFilterBtn = document.getElementById("mobile-filter-btn");
  const mobileFilterCloseBtn = document.getElementById("mobile-filter-close-btn");
  const mobileApplyFiltersBtn = document.getElementById("mobile-apply-filters-btn");
  const mobileResetFiltersBtn = document.getElementById("mobile-reset-filters-btn");

  // Debounce Utility
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Safe Avatar Initials Helper
  function getInitials(name) {
    if (!name || typeof name !== 'string') return 'LK';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'LK';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Sync state to URL search parameters for back/forward navigation stability
  function syncUrlParams() {
    if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return;
    try {
      const url = new URL(window.location.href);
      if (state.keyword && state.keyword.trim()) url.searchParams.set('q', state.keyword.trim());
      else url.searchParams.delete('q');

      if (state.category && state.category !== 'all') url.searchParams.set('category', state.category);
      else url.searchParams.delete('category');

      if (state.state && state.state !== 'all') url.searchParams.set('state', state.state);
      else url.searchParams.delete('state');

      if (state.lga && state.lga !== 'all') url.searchParams.set('lga', state.lga);
      else url.searchParams.delete('lga');

      if (state.locality && state.locality !== 'all') url.searchParams.set('locality', state.locality);
      else url.searchParams.delete('locality');

      if (state.locationQuery && state.locationQuery.trim()) url.searchParams.set('location', state.locationQuery.trim());
      else url.searchParams.delete('location');

      if (state.page > 1) url.searchParams.set('page', state.page.toString());
      else url.searchParams.delete('page');

      window.history.replaceState(null, '', url.toString());
    } catch (e) {}
  }

  // 1. Initialize from URL Search Parameters
  function initFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const serviceParam = params.get("service") || params.get("skill") || params.get("category");
    const industryParam = params.get("industry");
    const specParam = params.get("spec") || params.get("specialization");
    const qParam = params.get("q");
    const locParam = params.get("location");
    const stateParam = params.get("state");
    const lgaParam = params.get("lga");
    const localityParam = params.get("locality") || params.get("area");
    const cityParam = params.get("city");
    const sourceParam = params.get("source") || "marketplace";
    const verifiedParam = params.get("verified");
    const availableParam = params.get("available");
    const minRatingParam = params.get("minRating");
    const sortParam = params.get("sort");
    const pageParam = params.get("page");

    state.source = sourceParam;
    if (industryParam) state.industry = industryParam;
    if (specParam) state.specialization = specParam;

    // If q parameter exists (from free-form natural search)
    if (qParam) {
      const qClean = qParam.trim();
      if (searchInput) searchInput.value = qClean;
      state.keyword = qClean;
    }

    // Service category parameter resolution
    if (serviceParam) {
      const resolvedSlug = (typeof CategoryMap !== 'undefined')
        ? CategoryMap.resolveQuery(serviceParam)
        : serviceParam.toLowerCase();

      const catObj = (typeof CategoryMap !== 'undefined') ? CategoryMap.getBySlug(resolvedSlug) : null;
      if (catObj && categorySelect) {
        categorySelect.value = catObj.dropdownValue || catObj.name;
        state.category = resolvedSlug;
      } else {
        // Custom service searched directly
        if (!state.keyword) {
          state.keyword = serviceParam;
          if (searchInput) searchInput.value = serviceParam;
        }
        state.category = "all";
      }
    }

    if (stateParam) state.state = stateParam;
    if (lgaParam) state.lga = lgaParam;
    if (localityParam) state.locality = localityParam;

    if (cityParam) {
      state.city = cityParam;
      if (citySelect) citySelect.value = cityParam;
    }

    const latParam = params.get("lat");
    const lngParam = params.get("lng");
    const nearMeParam = params.get("near_me");

    if (latParam && lngParam && !isNaN(parseFloat(latParam)) && !isNaN(parseFloat(lngParam))) {
      state.userCoords = { lat: parseFloat(latParam), lng: parseFloat(lngParam) };
    }

    if (locParam && locationSearch) {
      locationSearch.value = locParam;
      state.locationQuery = locParam.trim();
    } else {
      // Check temporary session location
      try {
        const savedLoc = sessionStorage.getItem('lokator_temp_location_name');
        const savedLat = sessionStorage.getItem('lokator_temp_lat');
        const savedLng = sessionStorage.getItem('lokator_temp_lng');
        if (savedLoc && locationSearch && !locationSearch.value) {
          locationSearch.value = savedLoc;
          state.locationQuery = savedLoc;
        }
        if (!state.userCoords && savedLat && savedLng) {
          state.userCoords = { lat: parseFloat(savedLat), lng: parseFloat(savedLng) };
        }
      } catch (e) {}
    }

    if ((nearMeParam === "true" || state.userCoords) && (!sortParam || sortParam === "distance-asc")) {
      state.sortBy = "distance-asc";
      if (sortSelect) sortSelect.value = "distance-asc";
    }

    if (verifiedParam === "true" && verifiedOnlyCb) {
      verifiedOnlyCb.checked = true;
      state.verifiedOnly = true;
    }

    if (availableParam === "true" && availableOnlyCb) {
      availableOnlyCb.checked = true;
      state.availableOnly = true;
    }

    if (minRatingParam && !isNaN(parseFloat(minRatingParam))) {
      state.minRating = parseFloat(minRatingParam);
      if (ratingPills) {
        ratingPills.querySelectorAll(".pill-btn").forEach(b => {
          b.classList.toggle("active", parseFloat(b.dataset.rating) === state.minRating);
        });
      }
    }

    if (sortParam && sortSelect) {
      sortSelect.value = sortParam;
      state.sortBy = sortParam;
    }

    if (pageParam && !isNaN(parseInt(pageParam, 10))) {
      state.page = Math.max(1, parseInt(pageParam, 10));
    }

    // Populate and sync Nigerian Location cascading controls
    populateStateSelect();
    if (state.state && state.state !== "all") {
      updateLgaSelect(state.state, state.lga);
      if (state.lga && state.lga !== "all") {
        updateLocalitySelect(state.state, state.lga, state.locality);
      }
    }

    // Render breadcrumbs immediately on init
    renderBreadcrumbs();
  }

  // Populate Nigerian States in Filter Sidebar
  function populateStateSelect() {
    if (!stateSelect || typeof NigeriaLocations === 'undefined') return;
    const states = NigeriaLocations.getStates();
    stateSelect.innerHTML = `<option value="all">All Nigeria (36 States + FCT)</option>` +
      states.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.displayName)}</option>`).join('');
    
    if (state.state && state.state !== 'all') {
      stateSelect.value = state.state;
    }
  }

  // Update LGA dropdown based on selected Nigerian State
  function updateLgaSelect(stateName, selectedLga = 'all') {
    if (!lgaSelect || typeof NigeriaLocations === 'undefined') return;
    if (!stateName || stateName === 'all') {
      lgaSelect.innerHTML = `<option value="all">Select State First...</option>`;
      lgaSelect.disabled = true;
      if (localityFilterGroup) localityFilterGroup.style.display = 'none';
      state.lga = 'all';
      state.locality = 'all';
      return;
    }

    const lgas = NigeriaLocations.getLgas(stateName);
    lgaSelect.disabled = false;
    lgaSelect.innerHTML = `<option value="all">All LGAs in ${escapeHtml(stateName)}</option>` +
      lgas.map(l => `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)}</option>`).join('');
    
    if (selectedLga && selectedLga !== 'all') {
      lgaSelect.value = selectedLga;
      state.lga = selectedLga;
      updateLocalitySelect(stateName, selectedLga, state.locality);
    } else {
      lgaSelect.value = 'all';
      state.lga = 'all';
      if (localityFilterGroup) localityFilterGroup.style.display = 'none';
    }
  }

  // Update Locality dropdown based on selected LGA
  function updateLocalitySelect(stateName, lgaName, selectedLocality = 'all') {
    if (!localitySelect || !localityFilterGroup || typeof NigeriaLocations === 'undefined') return;
    if (!lgaName || lgaName === 'all') {
      localityFilterGroup.style.display = 'none';
      state.locality = 'all';
      return;
    }

    const localities = NigeriaLocations.getLocalities(stateName, lgaName);
    if (!localities || localities.length === 0) {
      localityFilterGroup.style.display = 'none';
      state.locality = 'all';
      return;
    }

    localityFilterGroup.style.display = 'block';
    localitySelect.innerHTML = `<option value="all">All Neighborhoods in ${escapeHtml(lgaName)}</option>` +
      localities.map(loc => `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`).join('');

    if (selectedLocality && selectedLocality !== 'all') {
      localitySelect.value = selectedLocality;
      state.locality = selectedLocality;
    } else {
      localitySelect.value = 'all';
      state.locality = 'all';
    }
  }

  // Phase 10.9: Render Marketplace Discovery Breadcrumbs
  function renderBreadcrumbs() {
    if (!breadcrumbsNav || typeof MarketplaceTaxonomy === 'undefined') return;

    const context = MarketplaceTaxonomy.buildDiscoveryContext({
      industry: state.industry !== 'all' ? state.industry : null,
      category: state.category !== 'all' ? state.category : null,
      skill: state.category !== 'all' ? state.category : (state.keyword || null),
      specialization: state.specialization !== 'all' ? state.specialization : null,
      state: state.state !== 'all' ? state.state : (state.locationQuery || null),
      lga: state.lga !== 'all' ? state.lga : null,
      locality: state.locality !== 'all' ? state.locality : null,
      city: state.city !== 'all' ? state.city : null,
      source: state.source
    });

    if (context.breadcrumbs && context.breadcrumbs.length > 1) {
      breadcrumbsNav.innerHTML = `
        <ol class="breadcrumb-trail-list">
          ${context.breadcrumbs.map((crumb, idx) => {
            const isLast = idx === context.breadcrumbs.length - 1;
            const iconHtml = crumb.icon ? `<span class="crumb-icon">${escapeHtml(crumb.icon)}</span> ` : '';
            return `
              <li class="breadcrumb-item ${isLast ? 'is-active' : ''}">
                ${isLast ? `
                  <span class="crumb-current" aria-current="page">${iconHtml}${escapeHtml(crumb.label)}</span>
                ` : `
                  <a href="${escapeHtml(crumb.url)}" class="crumb-link">${iconHtml}${escapeHtml(crumb.label)}</a>
                  <span class="crumb-separator" aria-hidden="true">›</span>
                `}
              </li>
            `;
          }).join('')}
        </ol>
      `;
      breadcrumbsNav.style.display = "block";
    } else {
      breadcrumbsNav.style.display = "none";
    }
  }

  // Phase 10.10: Render Canonical Nigerian Marketplace Industries Browse Grid
  function buildIndustryCardsHtml(industries) {
    return industries.map(ind => {
      const isSelected = state.industry === ind.id;
      const skillsHtml = (ind.popularSkills || []).slice(0, 4).map(skillSlug => {
        const catObj = (typeof CategoryMap !== 'undefined') ? CategoryMap.getBySlug(skillSlug) : null;
        const skillName = catObj ? catObj.displayName || catObj.name : skillSlug.replace(/-/g, ' ');
        return `<span class="industry-skill-pill-tag" data-skill-slug="${escapeHtml(skillSlug)}">${escapeHtml(skillName)}</span>`;
      }).join('');

      return `
        <div class="industry-browse-card ${isSelected ? 'is-selected' : ''}" data-industry-id="${escapeHtml(ind.id)}" role="button" tabindex="0" title="Browse ${escapeHtml(ind.name)}">
          <div class="industry-card-head">
            <span class="industry-card-icon" aria-hidden="true">${escapeHtml(ind.icon || '⚡')}</span>
            <div class="industry-card-name">${escapeHtml(ind.name)}</div>
          </div>
          <p class="industry-card-desc">${escapeHtml(ind.description || '')}</p>
          <div class="industry-popular-skills-wrap">
            ${skillsHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderBreadcrumbs() {
    const breadcrumbsNav = document.getElementById("marketplace-breadcrumbs");
    if (!breadcrumbsNav) return;

    const crumbs = [{ label: "Home", url: "index.html" }];
    
    let industryName = null;
    let categoryName = null;

    if (state.category && state.category !== "all") {
      const catObj = typeof CategoryMap !== 'undefined' ? CategoryMap.getBySlug(state.category) : null;
      categoryName = catObj ? (catObj.name || catObj.displayName) : (state.category.charAt(0).toUpperCase() + state.category.slice(1));
      industryName = (catObj && catObj.industry) ? catObj.industry : "Technical Repairs";
    } else if (state.keyword) {
      categoryName = state.keyword.charAt(0).toUpperCase() + state.keyword.slice(1);
      industryName = "Technical Repairs";
    }

    if (industryName) {
      crumbs.push({ label: industryName, url: `search.html` });
    }
    if (categoryName) {
      crumbs.push({ label: categoryName, isCurrent: true });
    }

    breadcrumbsNav.innerHTML = crumbs.map((crumb, idx) => {
      if (crumb.isCurrent) {
        return `<span class="breadcrumb-current" aria-current="page">${escapeHtml(crumb.label)}</span>`;
      }
      return `<a href="${crumb.url}" class="breadcrumb-link">${escapeHtml(crumb.label)}</a><span class="breadcrumb-sep">›</span>`;
    }).join(" ");
  }

  function renderBrowseGrid() {
    if (!browseSection || typeof MarketplaceTaxonomy === 'undefined') return;

    const hasActiveQuery = Boolean(state.keyword || (state.category && state.category !== 'all') || (state.industry && state.industry !== 'all') || (state.state && state.state !== 'all') || state.locationQuery);

    // Hide browse banner when user is searching or viewing specific trade/location (matches Image 2)
    if (hasActiveQuery) {
      browseSection.style.display = "none";
      browseSection.innerHTML = "";
      return;
    }

    const industries = MarketplaceTaxonomy.getIndustries();
    if (!industries || industries.length === 0) {
      browseSection.style.display = "none";
      return;
    }

    browseSection.style.display = "block";
    browseSection.classList.remove('is-compact');
    const isMobile = window.innerWidth <= 768;
    const shouldCollapse = browseSection.classList.contains('is-collapsed') || (isMobile && !browseSection._userToggled);
    if (shouldCollapse) {
      browseSection.classList.add('is-collapsed');
    }

    browseSection.innerHTML = `
      <div class="browse-section-header">
        <div class="browse-header-text">
          <span class="browse-badge">⚡ Explore by Trade</span>
          <h3 class="browse-title">Browse Nigeria's Canonical Trades & Industries</h3>
          <p class="browse-subtitle">Select an industry or popular trade to find verified artisans and specialists near you.</p>
        </div>
        <button type="button" class="btn-browse-toggle" id="btn-browse-toggle" aria-expanded="${shouldCollapse ? 'false' : 'true'}">
          <span id="browse-toggle-text">${shouldCollapse ? 'Show Trades' : 'Hide Trades'}</span> <span id="browse-toggle-arrow">${shouldCollapse ? '▾' : '▴'}</span>
        </button>
      </div>
      <div class="industry-cards-grid" id="industry-cards-grid-inner">
        ${buildIndustryCardsHtml(industries)}
      </div>
    `;

    const toggleBtn = browseSection.querySelector('#btn-browse-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        browseSection._userToggled = true;
        const isCollapsed = browseSection.classList.toggle('is-collapsed');
        const textEl = document.getElementById('browse-toggle-text');
        const arrowEl = document.getElementById('browse-toggle-arrow');
        if (textEl) textEl.textContent = isCollapsed ? 'Show Trades' : 'Hide Trades';
        if (arrowEl) arrowEl.textContent = isCollapsed ? '▾' : '▴';
        toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      });
    }
  }

  // Synchronize browser address bar with search state (shareable & refresh-safe)
  function updateUrlState() {
    try {
      const params = new URLSearchParams();
      if (state.keyword) params.set("q", state.keyword);
      if (state.category && state.category !== "all") params.set("service", state.category);
      if (state.locationQuery) params.set("location", state.locationQuery);
      if (state.state && state.state !== "all") params.set("state", state.state);
      if (state.lga && state.lga !== "all") params.set("lga", state.lga);
      if (state.locality && state.locality !== "all") params.set("locality", state.locality);
      if (state.city && state.city !== "all") params.set("city", state.city);
      if (state.verifiedOnly) params.set("verified", "true");
      if (state.availableOnly) params.set("available", "true");
      if (state.minRating > 0) params.set("minRating", String(state.minRating));
      if (state.sortBy && state.sortBy !== "distance-asc") params.set("sort", state.sortBy);
      if (state.page > 1) params.set("page", String(state.page));

      const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", newUrl);
      }
    } catch (e) {}
  }

  // Generate initials for avatar
  function getInitials(name) {
    if (!name) return "LP";
    const parts = name.trim().split(" ");
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  // 2. Render Loading Skeletons
  function renderSkeletons() {
    if (!providersContainer) return;
    providersContainer.innerHTML = `
      <div class="provider-item-card skeleton-card" style="opacity: 0.7; pointer-events: none;">
        <div class="provider-avatar-col"><div class="big-avatar" style="background: var(--border);"></div></div>
        <div class="provider-content-col">
          <div style="height: 18px; width: 45%; background: var(--border-light); border-radius: 4px; margin-bottom: 8px;"></div>
          <div style="height: 14px; width: 30%; background: var(--border-light); border-radius: 4px; margin-bottom: 12px;"></div>
          <div style="height: 12px; width: 85%; background: var(--border-light); border-radius: 4px; margin-bottom: 6px;"></div>
        </div>
      </div>
      <div class="provider-item-card skeleton-card" style="opacity: 0.5; pointer-events: none;">
        <div class="provider-avatar-col"><div class="big-avatar" style="background: var(--border);"></div></div>
        <div class="provider-content-col">
          <div style="height: 18px; width: 40%; background: var(--border-light); border-radius: 4px; margin-bottom: 8px;"></div>
          <div style="height: 14px; width: 25%; background: var(--border-light); border-radius: 4px; margin-bottom: 12px;"></div>
          <div style="height: 12px; width: 80%; background: var(--border-light); border-radius: 4px; margin-bottom: 6px;"></div>
        </div>
      </div>
    `;
  }

  // 3. Main Query & Render Function (Connects directly to Supabase with flexible skills)
  async function render() {
    if (state.isLoading) return;
    state.isLoading = true;
    renderSkeletons();
    renderActiveTags();
    updateUrlState();

    try {
      // Map category dropdown value to canonical slug
      let categorySlug = state.category;
      if (categorySelect && categorySelect.value) {
        if (categorySelect.value === "all") {
          categorySlug = "all";
        } else {
          categorySlug = (typeof CategoryMap !== 'undefined')
            ? CategoryMap.resolveQuery(categorySelect.value)
            : categorySelect.value.toLowerCase();
        }
      }

      // Location / City / State extraction
      const loc = state.locationQuery || (citySelect && citySelect.value !== 'all' ? citySelect.value : "all");
      const userLat = state.userCoords ? state.userCoords.lat : null;
      const userLng = state.userCoords ? state.userCoords.lng : null;

      // Phase 10.12C / Phase 10.20: Natural Language & Nigerian Pidgin Intent Recognition
      let naturalLanguageParsed = null;
      let effectiveCategory = categorySlug;
      let effectiveState = state.state;
      let effectiveLga = state.lga;
      let effectiveLocality = state.locality;
      let effectiveQuery = state.keyword;

      const LangEngine = (typeof NigeriaSearchLanguage !== 'undefined' ? NigeriaSearchLanguage : null) ||
                         (typeof globalThis !== 'undefined' ? globalThis.NigeriaSearchLanguage : null) ||
                         (typeof window !== 'undefined' ? window.NigeriaSearchLanguage : null);

      if (LangEngine && state.keyword && !state.forceLiteral) {
        naturalLanguageParsed = LangEngine.parseNigerianQuery(state.keyword);
        
        // If category is all, let the multi-tier searchIntent rank providers by trade and skills
        effectiveCategory = categorySelect ? categorySelect.value : state.category;

        // Resolve location hierarchy if state dropdown is on "all"
        if (naturalLanguageParsed.locationHierarchy && (state.state === 'all' || !state.state)) {
          effectiveState = naturalLanguageParsed.locationHierarchy.state || effectiveState;
          effectiveLga = naturalLanguageParsed.locationHierarchy.lga || effectiveLga;
          effectiveLocality = naturalLanguageParsed.locationHierarchy.locality || effectiveLocality;
        }

        // Clean query tokens for DB query
        if (naturalLanguageParsed.cleanQuery) {
          effectiveQuery = naturalLanguageParsed.cleanQuery;
        }

        // Proximity intent detection
        if (naturalLanguageParsed.isNearMe && (!state.sortBy || state.sortBy === 'distance-asc')) {
          state.sortBy = "distance-asc";
        }
      }

      // Render Natural Language Search Intent Banner
      const intentBanner = document.getElementById('search-intent-banner');
      if (intentBanner) {
        if (naturalLanguageParsed && (naturalLanguageParsed.serviceIntent || naturalLanguageParsed.extractedLocation || naturalLanguageParsed.isNearMe || naturalLanguageParsed.actionIntent || naturalLanguageParsed.urgencyIntent || naturalLanguageParsed.budgetIntent)) {
          const tradeLabel = naturalLanguageParsed.serviceIntent ? naturalLanguageParsed.serviceIntent.primaryTrade : 'Specialist Artisan';
          const locLabel = naturalLanguageParsed.locationHierarchy ? naturalLanguageParsed.locationHierarchy.cleanLocation : naturalLanguageParsed.extractedLocation;
          const locPart = locLabel ? ` in <strong class="intent-highlight">${escapeHtml(locLabel)}</strong>` : '';
          const nearPart = naturalLanguageParsed.isNearMe ? ' • <span class="intent-nearby-tag">📍 Nearby</span>' : '';
          const actionPart = naturalLanguageParsed.actionIntent ? ` • <span class="intent-nearby-tag" style="background:#EFF6FF;color:#1E40AF;border-color:#BFDBFE;">⚡ ${escapeHtml(naturalLanguageParsed.actionIntent.toUpperCase())}</span>` : '';
          const urgencyPart = naturalLanguageParsed.urgencyIntent ? ` • <span class="intent-nearby-tag" style="background:#FEF2F2;color:#991B1B;border-color:#FECACA;">⏳ ${escapeHtml(naturalLanguageParsed.urgencyIntent.label)}</span>` : '';
          const budgetPart = naturalLanguageParsed.budgetIntent ? ` • <span class="intent-nearby-tag" style="background:#F0FDF4;color:#166534;border-color:#BBF7D0;">💰 ${escapeHtml(naturalLanguageParsed.budgetIntent.label)}</span>` : '';

          intentBanner.innerHTML = `
            <div class="search-intent-content">
              <div class="search-intent-info">
                <span class="intent-badge-icon">🇳🇬</span>
                <div>
                  <div class="search-intent-title">Interpreted Nigerian Query: <span class="intent-query-text">"${escapeHtml(state.keyword)}"</span></div>
                  <div class="search-intent-details">
                    Looking for <strong class="intent-highlight">${escapeHtml(tradeLabel)}</strong>${locPart}${nearPart}${actionPart}${urgencyPart}${budgetPart}
                  </div>
                </div>
              </div>
              <button type="button" class="btn-toggle-literal" id="btn-revert-literal" title="Search exact literal keywords">
                Search Literal
              </button>
            </div>
          `;
          intentBanner.style.display = 'block';

          const revertBtn = document.getElementById('btn-revert-literal');
          if (revertBtn) {
            revertBtn.addEventListener('click', () => {
              state.forceLiteral = true;
              render();
            });
          }
        } else if (state.forceLiteral && state.keyword) {
          intentBanner.innerHTML = `
            <div class="search-intent-content literal-mode">
              <div class="search-intent-info">
                <span class="intent-badge-icon">🔤</span>
                <div>
                  <div class="search-intent-title">Literal Keyword Search Active</div>
                  <div class="search-intent-details">Searching exact text: "${escapeHtml(state.keyword)}"</div>
                </div>
              </div>
              <button type="button" class="btn-toggle-literal" id="btn-enable-natural" title="Enable Nigerian natural language & Pidgin interpretation">
                Enable Nigerian Smart Search
              </button>
            </div>
          `;
          intentBanner.style.display = 'block';

          const enableBtn = document.getElementById('btn-enable-natural');
          if (enableBtn) {
            enableBtn.addEventListener('click', () => {
              state.forceLiteral = false;
              render();
            });
          }
        } else {
          intentBanner.style.display = 'none';
          intentBanner.innerHTML = '';
        }
      }

      // Query database via LokatorDB
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('search_submitted', {
          category: effectiveCategory,
          keyword: effectiveQuery,
          rawKeyword: state.keyword,
          city: loc,
          state: effectiveState,
          lga: effectiveLga,
          verifiedOnly: state.verifiedOnly
        });
      }

      const result = await LokatorDB.getProviders({
        category: effectiveCategory,
        city: loc,
        state: effectiveState,
        lga: effectiveLga,
        locality: effectiveLocality,
        query: effectiveQuery,
        isVerified: state.verifiedOnly,
        isAvailable: state.availableOnly,
        minRating: state.minRating,
        page: state.page,
        pageSize: state.pageSize,
        sortBy: state.sortBy,
        userLat: userLat,
        userLng: userLng
      });

      state.isLoading = false;
      const providers = result.data || [];
      state.allProviders = providers;
      state.totalCount = result.totalCount || providers.length;

      if (typeof LokatorTelemetry !== 'undefined') {
        if (providers.length === 0) {
          LokatorTelemetry.trackEvent('search_no_results', {
            query: state.keyword,
            category: categorySlug,
            state: state.state !== 'all' ? state.state : (state.locationQuery || null),
            lga: state.lga !== 'all' ? state.lga : null,
            city: loc !== 'all' ? loc : null
          });
        } else {
          LokatorTelemetry.trackEvent('search_result_viewed', {
            totalCount: state.totalCount,
            page: state.page,
            category: categorySlug,
            state: state.state !== 'all' ? state.state : (state.locationQuery || null),
            lga: state.lga !== 'all' ? state.lga : null,
            city: loc !== 'all' ? loc : null
          });
        }
      }

      // Offline Search Status Notice
      let offlineBanner = document.getElementById('search-offline-banner');
      if (result.isOffline) {
        if (!offlineBanner && providersContainer && providersContainer.parentNode) {
          offlineBanner = document.createElement('div');
          offlineBanner.id = 'search-offline-banner';
          offlineBanner.className = 'offline-search-banner';
          providersContainer.parentNode.insertBefore(offlineBanner, providersContainer);
        }
        if (offlineBanner) {
          offlineBanner.style.display = 'flex';
          offlineBanner.innerHTML = `<span>⚡</span> <span>You're offline. Showing cached provider results.</span>`;
        }
      } else if (offlineBanner) {
        offlineBanner.style.display = 'none';
      }

      // Update Result Counter, Breadcrumbs & Canonical Industry Browse Grid
      renderBreadcrumbs();
      renderBrowseGrid();
      if (resultsCountText) {
        let tradeWord = 'Professional';
        if (effectiveCategory && effectiveCategory !== 'all') {
          const catObj = (typeof CategoryMap !== 'undefined') ? CategoryMap.getBySlug(effectiveCategory) : null;
          tradeWord = catObj ? (catObj.name || catObj.displayName) : (effectiveCategory.charAt(0).toUpperCase() + effectiveCategory.slice(1).replace(/-/g, ' '));
        } else if (state.keyword) {
          const kw = state.keyword.trim();
          tradeWord = kw.charAt(0).toUpperCase() + kw.slice(1);
        }

        const countNum = state.totalCount;
        const pluralTrade = countNum === 1 ? tradeWord : (tradeWord.endsWith('s') ? tradeWord : tradeWord + 's');
        resultsCountText.textContent = `Found ${countNum} Verified ${pluralTrade}`;
      }

      if (providers.length === 0) {
        providersContainer.innerHTML = "";
        if (emptyState) {
          emptyState.style.display = "flex";
          const currentQuery = state.keyword || (state.category !== 'all' ? state.category : '');
          
          let recsHtml = '';
          if (typeof MarketplaceTaxonomy !== 'undefined') {
            const context = MarketplaceTaxonomy.buildDiscoveryContext({
              industry: state.industry !== 'all' ? state.industry : null,
              category: state.category !== 'all' ? state.category : null,
              skill: state.category !== 'all' ? state.category : (state.keyword || null),
              specialization: state.specialization !== 'all' ? state.specialization : null,
              state: state.state !== 'all' ? state.state : (state.locationQuery || null),
              city: state.city !== 'all' ? state.city : null
            });
            const recs = MarketplaceTaxonomy.getZeroResultRecommendations(context);
            
            recsHtml = `
              <div class="zero-recovery-card">
                <h4 class="recovery-heading">${escapeHtml(recs.title)}</h4>
                <div class="recovery-suggestions-grid">
                  ${recs.suggestions.map(s => `
                    <a href="${escapeHtml(s.url)}" class="recovery-btn-chip">
                      <span>${escapeHtml(s.label)}</span> →
                    </a>
                  `).join('')}
                </div>
                ${recs.relatedSkills && recs.relatedSkills.length > 0 ? `
                  <div class="related-skills-box">
                    <span class="related-label">Looking for related trades?</span>
                    <div class="related-chips-wrap">
                      ${recs.relatedSkills.map(r => `
                        <a href="search.html?service=${encodeURIComponent(r.id)}${state.state !== 'all' ? `&state=${encodeURIComponent(state.state)}` : ''}" class="related-skill-pill">
                          <span>${escapeHtml(r.icon || '⚡')}</span> ${escapeHtml(r.name)}
                        </a>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            `;

            // Non-invasive MDCIE Telemetry
            if (typeof LokatorDB !== 'undefined' && LokatorDB.marketplaceDiscovery) {
              LokatorDB.marketplaceDiscovery.trackDiscoveryEvent('zero_results', {
                keyword: state.keyword,
                category: categorySlug,
                state: state.state,
                city: loc
              }).catch(() => {});
            }
          }

          // Phase 005 Contextual Provider Recruitment CTA
          const recruitmentEnabled = typeof PadiFixMonetization !== 'undefined'
            ? PadiFixMonetization.isFeatureEnabled('providerRecruitmentCtaEnabled')
            : true;
          
          let recruitmentHtml = '';
          if (recruitmentEnabled) {
            const rawTrade = state.category !== 'all' ? state.category : (state.keyword || 'artisan');
            const targetTradeName = rawTrade.charAt(0).toUpperCase() + rawTrade.slice(1).replace(/[-_]/g, ' ');
            const targetLocationName = state.lga !== 'all' ? `${state.lga}, ${state.state !== 'all' ? state.state : 'Nigeria'}` : (state.state !== 'all' ? `${state.state} State` : (state.city !== 'all' ? state.city : 'this area'));
            
            const joinParams = new URLSearchParams();
            if (state.category !== 'all') joinParams.set('category', state.category);
            else if (state.keyword) joinParams.set('category', state.keyword);
            if (state.state !== 'all') joinParams.set('state', state.state);
            if (state.lga !== 'all') joinParams.set('lga', state.lga);
            joinParams.set('source', 'search_zero_results');
            
            const joinUrl = `join.html?${joinParams.toString()}`;
            
            recruitmentHtml = `
              <div class="search-recruitment-box">
                <div class="search-recruitment-badge">
                  <span>📢</span> High Customer Demand Area
                </div>
                <h4 class="search-recruitment-title">Are you a ${escapeHtml(targetTradeName)} in ${escapeHtml(targetLocationName)}?</h4>
                <p class="search-recruitment-desc">
                  Customers in this area are actively searching for your craft right now. List your trade on PadiFix for free, receive direct WhatsApp & phone inquiries, and pay 0% commission.
                </p>
                <div class="search-recruitment-actions">
                  <a href="${escapeHtml(joinUrl)}" class="btn btn-primary search-recruitment-btn" id="zero-state-recruitment-cta">
                    <span>List Your Skill for Free</span>
                    <span>→</span>
                  </a>
                </div>
              </div>
            `;
          }

          // Secondary UX: Explicit opt-in suggestions for nearby LGAs on zero results
          let nearbyLgasHtml = '';
          if (state.state !== 'all' && typeof NigeriaLocations !== 'undefined') {
            const stateObj = NigeriaLocations.getState(state.state);
            if (stateObj && Array.isArray(stateObj.lgas)) {
              const otherLgas = stateObj.lgas.filter(l => l.name.toLowerCase() !== (state.lga || '').toLowerCase()).slice(0, 4);
              if (otherLgas.length > 0) {
                nearbyLgasHtml = `
                  <div class="zero-nearby-suggestions-card" style="margin: 18px 0; padding: 16px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #0F172A; font-size: 14px; margin-bottom: 6px;">
                      <span>📍</span>
                      <span>Nearby Locations in ${escapeHtml(stateObj.name)} State</span>
                    </div>
                    <p style="font-size: 12.5px; color: #64748B; margin-bottom: 12px; line-height: 1.5;">
                      No verified artisans found in ${state.lga !== 'all' ? `<strong>${escapeHtml(state.lga)}</strong>` : 'this specific query'}. Expand your search to nearby areas with one click (no auto-substitution):
                    </p>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                      ${otherLgas.map(ol => `
                        <button type="button" class="btn-nearby-lga-optin" data-lga="${escapeHtml(ol.name)}" data-state="${escapeHtml(stateObj.name)}" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; border: 1px solid #CBD5E1; background: #F8FAFC; color: #0F172A; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">
                          <span>📍 ${escapeHtml(ol.name)}</span>
                          <span style="font-size: 11px; color: #008751; font-weight: 700;">(Explore)</span>
                        </button>
                      `).join('')}
                      <button type="button" class="btn-nearby-state-optin" data-state="${escapeHtml(stateObj.name)}" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; border: 1px solid #00A859; background: #F0FDF4; color: #006B3F; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.15s ease;">
                        <span>🌐 Search All of ${escapeHtml(stateObj.name)} State</span>
                      </button>
                    </div>
                  </div>
                `;
              }
            }
          }

          emptyState.innerHTML = `
            <div class="empty-icon">🔍</div>
            <h3>${currentQuery ? `No verified providers found for "${escapeHtml(currentQuery)}" in this area yet` : 'No providers match your exact search filters'}</h3>
            <p>We are actively verifying skilled hands across all 36 Nigerian states. Try exploring nearby locations or related trades below:</p>
            ${nearbyLgasHtml}
            ${recruitmentHtml}
            ${recsHtml}
            <div class="empty-actions-row" style="margin-top: 20px;">
              <button class="btn btn-outline" id="clear-all-empty-btn">Reset All Filters</button>
            </div>
          `;
          const resetBtn = document.getElementById("clear-all-empty-btn");
          if (resetBtn) {
            resetBtn.addEventListener("click", () => {
              if (resetFiltersBtn) resetFiltersBtn.click();
            });
          }

          // Attach explicit opt-in listeners for nearby LGAs
          emptyState.querySelectorAll('.btn-nearby-lga-optin').forEach(btn => {
            btn.addEventListener('click', () => {
              const chosenLga = btn.dataset.lga;
              state.lga = chosenLga;
              if (lgaSelect) {
                // Check if option exists in select, else add or select it
                let opt = Array.from(lgaSelect.options).find(o => o.value.toLowerCase() === chosenLga.toLowerCase());
                if (!opt) {
                  opt = new Option(chosenLga, chosenLga, true, true);
                  lgaSelect.add(opt);
                } else {
                  opt.selected = true;
                }
              }
              state.page = 1;
              syncUrlParams();
              fetchAndRenderProviders();
            });
          });

          emptyState.querySelectorAll('.btn-nearby-state-optin').forEach(btn => {
            btn.addEventListener('click', () => {
              state.lga = 'all';
              if (lgaSelect) lgaSelect.value = 'all';
              state.page = 1;
              syncUrlParams();
              fetchAndRenderProviders();
            });
          });
          const recruitCta = document.getElementById("zero-state-recruitment-cta");
          if (recruitCta) {
            recruitCta.addEventListener("click", () => {
              if (typeof LokatorTelemetry !== 'undefined') {
                LokatorTelemetry.trackEvent('provider_recruitment_cta_clicked', {
                  category: state.category !== 'all' ? state.category : (state.keyword || ''),
                  state: state.state !== 'all' ? state.state : '',
                  lga: state.lga !== 'all' ? state.lga : '',
                  source: 'search_zero_results'
                });
              }
            });
          }
        }
        if (paginationControls) paginationControls.innerHTML = "";
        updateSearchMap([]);
        renderRecentSearches();
        return;
      }

      // Non-invasive MDCIE Telemetry for positive results view
      if (typeof LokatorDB !== 'undefined' && LokatorDB.marketplaceDiscovery) {
        LokatorDB.marketplaceDiscovery.trackDiscoveryEvent('provider_results_viewed', {
          count: state.totalCount,
          category: categorySlug,
          state: state.state,
          city: loc
        }).catch(() => {});
      }

      if (emptyState) emptyState.style.display = "none";

      // Render Provider Cards (Matches Image 2 Canonical Design with Phase 10.21 Conversion Intent)
      providersContainer.innerHTML = providers.map((provider, index) => {
        const safeId = parseInt(provider.id, 10) || 0;

        // Clean display name: Business name + Artisan contact if both exist
        let displayName = provider.name || provider.business_name || 'Verified Provider';
        let subTitleName = '';
        if (provider.business_name && provider.first_name) {
          const artName = `${provider.first_name}${provider.last_initial ? ' ' + provider.last_initial : ''}`.trim();
          if (artName && artName.toLowerCase() !== provider.business_name.toLowerCase()) {
            displayName = provider.business_name;
            subTitleName = artName;
          }
        }

        const initials = getInitials(displayName);

        // Location formatting with State guarantee
        let fullLoc = provider.area || '';
        if (provider.lga && provider.state) {
          if (!fullLoc.toLowerCase().includes(provider.state.toLowerCase())) {
            fullLoc = fullLoc ? `${fullLoc}, ${provider.state}` : `${provider.lga}, ${provider.state}`;
          }
        } else if (provider.city && provider.state && !fullLoc.toLowerCase().includes(provider.state.toLowerCase())) {
          fullLoc = `${fullLoc || provider.city}, ${provider.state}`;
        }
        if (!fullLoc) fullLoc = provider.city || 'your area';

        const serviceCtx = state.keyword || provider.primary_trade || provider.trade;
        const locationCtx = state.locationQuery || fullLoc;

        // Phase 10.21: Construct contextual profile URL preserving search intent
        const profileUrlParams = new URLSearchParams();
        profileUrlParams.set('id', safeId);
        if (state.keyword && state.keyword.trim()) {
          profileUrlParams.set('q', state.keyword.trim());
        }
        if (naturalLanguageParsed && naturalLanguageParsed.serviceIntent) {
          profileUrlParams.set('service', naturalLanguageParsed.serviceIntent.primaryTrade || naturalLanguageParsed.serviceIntent.canonicalSlug);
        }
        if (naturalLanguageParsed && naturalLanguageParsed.actionIntent) {
          profileUrlParams.set('action', naturalLanguageParsed.actionIntent);
        }
        if (naturalLanguageParsed && naturalLanguageParsed.locationHierarchy && naturalLanguageParsed.locationHierarchy.cleanLocation) {
          profileUrlParams.set('loc', naturalLanguageParsed.locationHierarchy.cleanLocation);
        } else if (naturalLanguageParsed && naturalLanguageParsed.extractedLocation) {
          profileUrlParams.set('loc', naturalLanguageParsed.extractedLocation);
        } else if (state.locationQuery && state.locationQuery.trim()) {
          profileUrlParams.set('loc', state.locationQuery.trim());
        }
        if (naturalLanguageParsed && naturalLanguageParsed.urgencyIntent) {
          profileUrlParams.set('urgency', naturalLanguageParsed.urgencyIntent.level);
        }
        if (naturalLanguageParsed && naturalLanguageParsed.budgetIntent && naturalLanguageParsed.budgetIntent.maxBudget) {
          profileUrlParams.set('budget', String(naturalLanguageParsed.budgetIntent.maxBudget));
        }
        const profileUrl = `profile.html?${profileUrlParams.toString()}`;

        const PhoneEngine = (typeof NigeriaPhone !== 'undefined' ? NigeriaPhone : null) || (typeof window !== 'undefined' ? window.NigeriaPhone : null);
        const telUrl = PhoneEngine ? PhoneEngine.buildTelUrl(provider) : (provider.phone ? `tel:${provider.phone}` : '');
        const waUrl = PhoneEngine 
          ? (PhoneEngine.buildSmartWhatsAppUrl ? PhoneEngine.buildSmartWhatsAppUrl(provider, { service: serviceCtx, location: locationCtx }) : PhoneEngine.buildWhatsAppUrl(provider, { service: serviceCtx, location: locationCtx }))
          : '';

        // Distance format: Orerokpe, Okpe, Delta (2.4 km)
        const distText = (provider.distanceKm != null) 
          ? `${fullLoc} (${provider.distanceKm} km)`
          : `${fullLoc}`;

        // Skills & Primary Trade
        const rawSkills = Array.isArray(provider.skills) && provider.skills.length > 0 ? provider.skills : [provider.trade || 'Artisan'];
        const skillsList = rawSkills.filter(s => s && s.trim());

        let displayTrade = provider.primary_trade || provider.trade || 'Specialist Artisan';
        if (displayTrade.includes(' & ') && provider.primary_category_slug) {
          displayTrade = provider.primary_category_slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }

        // Truthful Rating & Review Count
        const safeReviewsCount = parseInt(provider.reviewsCount || 0, 10);
        const hasReviews = safeReviewsCount > 0 && provider.rating != null && Number(provider.rating) > 0;
        const safeRating = hasReviews ? Number(provider.rating).toFixed(1) : 'New';
        const ratingHtml = hasReviews
          ? `<span class="meta-rating-num">${safeRating}</span>
             <span class="meta-rating-star">★</span>
             <span class="meta-reviews-count">(${safeReviewsCount} review${safeReviewsCount === 1 ? '' : 's'})</span>`
          : `<span class="meta-rating-num" style="color: #059669; font-weight: 700;">★ New</span>
             <span class="meta-reviews-count">(0 reviews)</span>`;

        const safeExpYrs = parseInt(provider.experienceYrs || 3, 10);
        const safeAvatarBg = (provider.avatarBg && typeof provider.avatarBg === 'string' && provider.avatarBg.startsWith('linear-gradient')) ? provider.avatarBg : 'linear-gradient(135deg, #006B3F, #059669)';

        // Phase 10.21: Intent-Match Visual Indicators
        let intentBadgesHtml = '';
        if (naturalLanguageParsed && naturalLanguageParsed.serviceIntent) {
          const isTradeMatch = (provider.slug === naturalLanguageParsed.serviceIntent.canonicalSlug) || (provider.trade && provider.trade.toLowerCase().includes(naturalLanguageParsed.serviceIntent.canonicalSlug));
          const matchedSkill = skillsList.find(s => s.toLowerCase().includes(naturalLanguageParsed.serviceIntent.canonicalSlug) || (naturalLanguageParsed.cleanQuery && s.toLowerCase().includes(naturalLanguageParsed.cleanQuery)));
          if (matchedSkill) {
            intentBadgesHtml += `<span class="intent-match-pill match-skill" title="Artisan offers requested skill">✓ ${escapeHtml(matchedSkill)}</span>`;
          } else if (isTradeMatch) {
            intentBadgesHtml += `<span class="intent-match-pill match-trade" title="Exact trade match">✓ Matches Service</span>`;
          }
        }
        if (naturalLanguageParsed && naturalLanguageParsed.actionIntent) {
          intentBadgesHtml += `<span class="intent-match-pill match-action" title="Supports ${naturalLanguageParsed.actionIntent}">⚡ ${escapeHtml(naturalLanguageParsed.actionIntent.toUpperCase())}</span>`;
        }
        if (naturalLanguageParsed && naturalLanguageParsed.locationHierarchy && provider.state && provider.state.toLowerCase() === naturalLanguageParsed.locationHierarchy.state.toLowerCase()) {
          intentBadgesHtml += `<span class="intent-match-pill match-loc" title="Located in your state">📍 In Your State</span>`;
        }

        // Dual Contact buttons: Never disabled! Seamlessly routes to direct call or profile contact reveal
        const callBtnHtml = telUrl
          ? `<a href="${escapeHtml(telUrl)}" class="action-btn call-btn" data-provider-id="${safeId}" data-trade="${escapeHtml(displayTrade)}" aria-label="Call ${escapeHtml(displayName)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>Call Now</span>
            </a>`
          : `<a href="${escapeHtml(profileUrl)}&action=call" class="action-btn call-btn" data-provider-id="${safeId}" data-trade="${escapeHtml(displayTrade)}" aria-label="Call ${escapeHtml(displayName)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>Call Now</span>
            </a>`;

        const messageBtnHtml = waUrl
          ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="action-btn message-btn" data-provider-id="${safeId}" data-trade="${escapeHtml(displayTrade)}" aria-label="Message ${escapeHtml(displayName)} on WhatsApp">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span>Message</span>
            </a>`
          : `<a href="${escapeHtml(profileUrl)}&action=whatsapp" class="action-btn message-btn" data-provider-id="${safeId}" data-trade="${escapeHtml(displayTrade)}" aria-label="Message ${escapeHtml(displayName)} on WhatsApp">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span>Message</span>
            </a>`;

        const isSponsored = Boolean(provider.is_sponsored || provider.isSponsored);

        const providerLoc = provider.area || (provider.lga && provider.state ? `${provider.lga}, ${provider.state}` : provider.city) || '';

        return `
          <article class="provider-item-card ${provider.isVerified ? 'is-verified' : ''} ${isSponsored ? 'is-sponsored' : ''}" id="card-prov-${safeId}" data-provider-id="${safeId}" data-provider-trade="${escapeHtml(displayTrade)}" data-provider-location="${escapeHtml(providerLoc)}" data-position="${index + 1}" data-is-sponsored="${isSponsored}">
            <div class="provider-card-main-row">
              <!-- Avatar Column -->
              <div class="provider-avatar-col">
                <a href="${escapeHtml(profileUrl)}" class="provider-card-profile-link" title="Open Full Profile Page" style="text-decoration: none;">
                  <div class="big-avatar" style="background: ${safeAvatarBg};">
                    ${provider.avatarUrl ? `<img src="${escapeHtml(provider.avatarUrl)}" alt="${escapeHtml(displayName)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />` : escapeHtml(initials)}
                  </div>
                </a>
                <span class="status-dot ${provider.isAvailable ? 'online' : 'offline'}" title="${provider.isAvailable ? 'Available today' : 'Currently busy'}"></span>
              </div>

              <!-- Content Column -->
              <div class="provider-content-col">
                <div class="provider-header-line">
                  <a href="${escapeHtml(profileUrl)}" class="provider-card-profile-link" title="Open Full Profile Page" style="text-decoration: none; color: inherit;">
                    <h3 class="provider-title-name">${escapeHtml(displayName)}</h3>
                  </a>
                  ${subTitleName ? `<span class="artisan-sub-name" title="Artisan In Charge" style="font-size: 13px; color: #64748B; font-weight: 500;">• ${escapeHtml(subTitleName)}</span>` : ''}
                  ${provider.isVerified ? `
                    <span class="verified-badge-icon" title="NIN Verified Professional">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="#0284C7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    </span>` : ''
                  }
                  ${isSponsored ? `<span class="badge-tag-promoted" title="Sponsored Category Placement" aria-label="Sponsored listing">⚡ Promoted</span>` : ''}
                  ${provider.isTop ? `<span class="badge-tag-top">⭐ Top</span>` : ''}
                </div>

                <!-- Primary Trade & Specialty Line -->
                <div class="provider-specialty-line" style="font-size: 13.5px; font-weight: 700; color: #006B3F; margin-top: 1px;">
                  ${escapeHtml(displayTrade)}
                </div>

                <!-- Rating & Experience Meta -->
                <div class="provider-rating-row">
                  ${ratingHtml}
                  <span class="meta-sep">•</span>
                  <span class="meta-exp">${safeExpYrs} yrs exp</span>
                </div>

                <!-- Location line -->
                <div class="provider-location-row">
                  <span>📍 ${escapeHtml(distText)}</span>
                </div>

                <!-- Intent Match Badges if present -->
                ${intentBadgesHtml ? `<div class="provider-intent-badges-row">${intentBadgesHtml}</div>` : ''}

                <!-- Skill tag pills -->
                <div class="provider-tags-row">
                  ${skillsList.map(skill => `<span class="mini-tag skill-tag">${escapeHtml(skill)}</span>`).join('')}
                </div>
              </div>
            </div>

            <!-- Dual Action Buttons matching Image 2 -->
            <div class="provider-actions-col">
              ${callBtnHtml}
              ${messageBtnHtml}
            </div>
          </article>
        `;
      }).join('');

      // Telemetry click delegation on provider cards
      if (!providersContainer._telemetryBound) {
        providersContainer._telemetryBound = true;
        providersContainer.addEventListener('click', (e) => {
          const card = e.target.closest('.provider-item-card');
          if (!card) return;
          const providerId = parseInt(card.dataset.providerId, 10);
          const trade = card.dataset.providerTrade;
          const position = parseInt(card.dataset.position, 10) || 1;
          const isSponsored = card.dataset.isSponsored === 'true';

          if (e.target.closest('.call-btn')) {
            const card = e.target.closest('.provider-item-card');
            const provLoc = card ? (card.dataset.providerLocation || card.querySelector('.provider-location-row')?.textContent?.replace('📍', '').trim() || '') : '';
            // Phase 026: Non-blocking asynchronous lead metering for direct Call
            if (!window._padifixContactAttempts) window._padifixContactAttempts = new Map();
            const attemptCacheKeyCall = `${providerId}_call`;
            const nowTimeCall = Date.now();
            let idemKeyCall;
            const cachedAttemptCall = window._padifixContactAttempts.get(attemptCacheKeyCall);
            if (cachedAttemptCall && (nowTimeCall - cachedAttemptCall.time) < 30000) {
              idemKeyCall = cachedAttemptCall.key;
            } else {
              const evtId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
              idemKeyCall = `idem_${providerId}_call_${evtId}`;
              window._padifixContactAttempts.set(attemptCacheKeyCall, { key: idemKeyCall, time: nowTimeCall });
            }

            if (typeof PadiFixPWA !== 'undefined' && PadiFixPWA.dispatchContactLead) {
              PadiFixPWA.dispatchContactLead({
                provider_id: providerId,
                channel: 'call',
                idempotency_key: idemKeyCall,
                locality: provLoc,
                intent_tag: trade
              }).catch(() => {});
            }

            if (typeof LokatorTelemetry !== 'undefined') {
              LokatorTelemetry.trackEvent('call_clicked', {
                providerId,
                trade,
                surface: 'search_card'
              });
              if (isSponsored) {
                LokatorTelemetry.trackEvent('sponsored_contact_clicked', {
                  providerId,
                  trade,
                  contactChannel: 'call'
                });
              }
            }
          } else if (e.target.closest('.message-btn')) {
            const card = e.target.closest('.provider-item-card');
            const provName = card ? (card.querySelector('.provider-title-name')?.textContent || '').trim() : '';
            const provLoc = card ? (card.dataset.providerLocation || card.querySelector('.provider-location-row')?.textContent?.replace('📍', '').trim() || '') : '';
            // Phase 014: Cryptographic attempt UUID with 30s duplicate-tap debounce
            if (!window._padifixContactAttempts) window._padifixContactAttempts = new Map();
            const attemptCacheKey = `${providerId}_whatsapp`;
            const nowTime = Date.now();
            let idemKey;
            const cachedAttempt = window._padifixContactAttempts.get(attemptCacheKey);
            if (cachedAttempt && (nowTime - cachedAttempt.time) < 30000) {
              idemKey = cachedAttempt.key;
            } else {
              const evtId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
              idemKey = `idem_${providerId}_whatsapp_${evtId}`;
              window._padifixContactAttempts.set(attemptCacheKey, { key: idemKey, time: nowTime });
            }

            // Phase 014 / Phase 026: Dispatch contact meter asynchronously via PWA outbox dispatcher
            if (typeof PadiFixPWA !== 'undefined' && PadiFixPWA.dispatchContactLead) {
              PadiFixPWA.dispatchContactLead({
                provider_id: providerId,
                channel: 'whatsapp',
                idempotency_key: idemKey,
                locality: provLoc,
                intent_tag: trade
              }).catch(() => {});
            }

            // Phase 014: Record recent contact for 24-48h review follow-up
            try {
              const recentRaw = localStorage.getItem('padifix_recent_contacts') || '[]';
              let recentList = JSON.parse(recentRaw);
              recentList = recentList.filter(c => c.provider_id !== providerId);
              recentList.push({
                provider_id: providerId,
                provider_name: provName,
                trade: trade || '',
                contacted_at: Date.now()
              });
              localStorage.setItem('padifix_recent_contacts', JSON.stringify(recentList.slice(-20)));
            } catch (err) {}

            if (typeof LokatorTelemetry !== 'undefined') {
              LokatorTelemetry.trackEvent('whatsapp_clicked', {
                providerId,
                trade,
                surface: 'search_card'
              });
              if (isSponsored) {
                LokatorTelemetry.trackEvent('sponsored_contact_clicked', {
                  providerId,
                  trade,
                  contactChannel: 'whatsapp'
                });
              }
            }
          } else if (e.target.closest('.provider-card-profile-link') || e.target.closest('.big-avatar') || e.target.closest('.provider-title-name')) {
            if (typeof LokatorTelemetry !== 'undefined') {
              LokatorTelemetry.trackEvent('provider_card_clicked', {
                providerId,
                trade,
                position,
                hasSearchIntent: Boolean(naturalLanguageParsed && naturalLanguageParsed.serviceIntent)
              });
              if (isSponsored) {
                LokatorTelemetry.trackEvent('sponsored_click', {
                  providerId,
                  trade,
                  position
                });
              }
            }
          }
        });
      }

      // Phase 004: Track impressions for Promoted cards
      if (typeof LokatorTelemetry !== 'undefined' && typeof PadiFixMonetization !== 'undefined' && PadiFixMonetization.isFeatureEnabled('monetizationAnalyticsEnabled')) {
        providers.forEach((p, idx) => {
          if (p.is_sponsored || p.isSponsored) {
            LokatorTelemetry.trackEvent('sponsored_impression', {
              providerId: p.id,
              trade: p.trade,
              position: idx + 1
            });
          }
        });
      }

      // Render Pagination if more than pageSize
      renderPagination(state.totalCount);

      // Phase 10.17: Update Geospatial Map Markers & Bounds
      updateSearchMap(providers);

      // Phase 10.17: Record search in History if terms provided
      if (typeof LokatorDB !== 'undefined' && LokatorDB.searchHistory) {
        if (state.keyword || state.locationQuery || (state.state && state.state !== 'all') || (state.lga && state.lga !== 'all')) {
          LokatorDB.searchHistory.addSearch({
            keyword: state.keyword,
            location: state.locationQuery,
            state: state.state !== 'all' ? state.state : '',
            lga: state.lga !== 'all' ? state.lga : ''
          });
        }
        renderRecentSearches();
      }

      // Sync active state to URL search parameters
      syncUrlParams();

    } catch (err) {
      console.error('Error fetching providers from Supabase:', err);
      state.isLoading = false;
      if (providersContainer) {
        providersContainer.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--fg-muted);">
            <p>Unable to load live provider directory at this moment. Please check your connection and refresh.</p>
          </div>
        `;
      }
    }
  }

  // 4. Render Active Filter Badges
  function renderActiveTags() {
    if (!activeFilterTags) return;
    const tags = [];
    let filterCount = 0;
    if (state.category && state.category !== "all") { tags.push(`Category: ${state.category}`); filterCount++; }
    if (state.state && state.state !== "all") { tags.push(`State: ${state.state}`); filterCount++; }
    if (state.lga && state.lga !== "all") { tags.push(`LGA: ${state.lga}`); filterCount++; }
    if (state.locality && state.locality !== "all") { tags.push(`Neighborhood: ${state.locality}`); filterCount++; }
    if (state.city && state.city !== "all" && state.city !== state.lga && state.city !== state.state) { tags.push(`City: ${state.city}`); filterCount++; }
    if (state.locationQuery && state.locationQuery !== state.state && state.locationQuery !== state.lga && state.locationQuery !== state.locality) { tags.push(`Location: "${state.locationQuery}"`); }
    if (state.keyword) { tags.push(`Skill / Service: "${state.keyword}"`); }
    if (state.verifiedOnly) { tags.push(`Verified only`); filterCount++; }
    if (state.availableOnly) { tags.push(`Available now`); filterCount++; }
    if (state.minRating > 0) { tags.push(`★ ${state.minRating}+`); filterCount++; }

    // Update Mobile Filter Button label (e.g. Filters (2))
    const mobileFilterTriggerBtn = document.getElementById('mobile-filter-btn');
    if (mobileFilterTriggerBtn) {
      mobileFilterTriggerBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
        <span>Filters${filterCount > 0 ? ` (${filterCount})` : ''}</span>
      `;
    }

    activeFilterTags.innerHTML = tags
      .map(t => `<span class="filter-badge-tag">${escapeHtml(t)}</span>`)
      .join('');
  }

  // 5. Render Pagination Controls
  function renderPagination(total) {
    if (!paginationControls) return;
    const totalPages = Math.ceil(total / state.pageSize);
    if (totalPages <= 1) {
      paginationControls.innerHTML = "";
      return;
    }

    paginationControls.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 24px;">
        <button class="btn btn-outline btn-sm" id="pg-prev" ${state.page === 1 ? 'disabled' : ''}>← Previous</button>
        <span style="font-size: 13px; font-weight: 700; color: var(--fg-muted);">Page ${state.page} of ${totalPages}</span>
        <button class="btn btn-outline btn-sm" id="pg-next" ${state.page >= totalPages ? 'disabled' : ''}>Next →</button>
      </div>
    `;

    const prevBtn = document.getElementById("pg-prev");
    const nextBtn = document.getElementById("pg-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (state.page > 1) {
          state.page--;
          render();
          window.scrollTo({ top: 300, behavior: 'smooth' });
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (state.page < totalPages) {
          state.page++;
          render();
          window.scrollTo({ top: 300, behavior: 'smooth' });
        }
      });
    }
  }

  // 6. Live Search Suggestions Dropdown Handling (Enhanced with Nigerian Pidgin Intelligence)
  function renderSuggestions(query) {
    if (!suggestionsDropdown) return;
    const qLower = (query || '').toLowerCase().trim();
    if (!qLower) {
      suggestionsDropdown.style.display = "none";
      suggestionsDropdown.innerHTML = "";
      return;
    }

    const suggestions = [];

    // Check for conversational / Pidgin search matches
    const LangEngine = (typeof NigeriaSearchLanguage !== 'undefined' ? NigeriaSearchLanguage : null) ||
                       (typeof globalThis !== 'undefined' ? globalThis.NigeriaSearchLanguage : null) ||
                       (typeof window !== 'undefined' ? window.NigeriaSearchLanguage : null);

    if (LangEngine) {
      const pidginPhrases = [
        { text: "Person wey fit fix generator", icon: "⚡" },
        { text: "Who sabi sew agbada / senator wear", icon: "🧵" },
        { text: "AC repairer wey dey near me", icon: "❄️" },
        { text: "Plumber wey fit fix pipe leak", icon: "🔧" },
        { text: "Mechanic for engine repair & rewire", icon: "🔩" },
        { text: "Phone engineer for screen change", icon: "📱" },
        { text: "Cleaner for deep house cleaning", icon: "✨" },
        { text: "Welder for iron gate & burglar proof", icon: "🔥" }
      ];

      const isConversational = /^(who|person|wey|sabi|i need|abeg|help|find|where|somebody|fix|repair|close|near)/i.test(qLower);
      if (isConversational) {
        pidginPhrases.forEach(p => {
          if (p.text.toLowerCase().includes(qLower) || qLower.split(' ').some(w => w.length >= 3 && p.text.toLowerCase().includes(w))) {
            suggestions.push({ label: p.text, icon: p.icon, isPidgin: true });
          }
        });
      }
    }

    // Standard skill suggestions
    const dbSuggestions = (LokatorDB && LokatorDB.getSkillSuggestions)
      ? LokatorDB.getSkillSuggestions(query, 6)
      : [];

    dbSuggestions.forEach(s => {
      if (!suggestions.some(item => item.label.toLowerCase() === s.toLowerCase())) {
        suggestions.push({ label: s, icon: "⚡", isPidgin: false });
      }
    });

    if (suggestions.length === 0) {
      suggestionsDropdown.style.display = "none";
      suggestionsDropdown.innerHTML = "";
      return;
    }

    suggestionsDropdown.innerHTML = suggestions.slice(0, 6).map(s => `
      <div class="suggestion-item" data-val="${escapeHtml(s.label)}">
        <span class="sugg-icon">${escapeHtml(s.icon)}</span>
        <div class="sugg-meta">
          <span class="sugg-title">${escapeHtml(s.label)}</span>
          ${s.isPidgin ? '<span class="sugg-sub" style="color: #34D399; font-size: 11px;">🇳🇬 Nigerian Smart Search</span>' : ''}
        </div>
      </div>
    `).join('');
    suggestionsDropdown.style.display = "block";
  }

  function hideSuggestions() {
    if (suggestionsDropdown) {
      setTimeout(() => {
        suggestionsDropdown.style.display = "none";
      }, 250);
    }
  }

  if (suggestionsDropdown) {
    suggestionsDropdown.addEventListener("click", (e) => {
      const item = e.target.closest(".suggestion-item");
      if (item && item.dataset.val) {
        const val = item.dataset.val;
        if (searchInput) searchInput.value = val;
        state.keyword = val;
        state.forceLiteral = false;
        state.category = "all";
        if (categorySelect) categorySelect.value = "all";
        suggestionsDropdown.style.display = "none";
        state.page = 1;
        render();
      }
    });
  }

  // 6.1 Live Nigerian Location Suggestions Handling
  function renderLocationSuggestions(query) {
    if (!locationSuggestions || typeof NigeriaLocations === 'undefined') return;
    const matches = NigeriaLocations.searchLocations(query, 6);
    if (matches.length === 0) {
      locationSuggestions.style.display = "none";
      locationSuggestions.innerHTML = "";
      return;
    }

    locationSuggestions.innerHTML = matches.map(m => `
      <div class="suggestion-item location-sugg-item" data-state="${escapeHtml(m.state)}" data-lga="${escapeHtml(m.lga || '')}" data-locality="${escapeHtml(m.locality || '')}" data-formatted="${escapeHtml(m.formatted)}">
        <span class="sugg-icon">📍</span>
        <div class="sugg-meta">
          <span class="sugg-title">${escapeHtml(m.title)}</span>
          <span class="sugg-sub">${escapeHtml(m.label)}</span>
        </div>
      </div>
    `).join('');
    locationSuggestions.style.display = "block";
  }

  function hideLocationSuggestions() {
    if (locationSuggestions) {
      setTimeout(() => {
        locationSuggestions.style.display = "none";
      }, 250);
    }
  }

  if (locationSuggestions) {
    locationSuggestions.addEventListener("click", (e) => {
      const item = e.target.closest(".location-sugg-item");
      if (item && item.dataset.state) {
        const itemState = item.dataset.state;
        const itemLga = item.dataset.lga;
        const itemLocality = item.dataset.locality;
        const itemFormatted = item.dataset.formatted;

        if (locationSearch) locationSearch.value = itemFormatted;
        state.locationQuery = itemFormatted;
        state.state = itemState;
        state.lga = itemLga || "all";
        state.locality = itemLocality || "all";

        if (stateSelect) stateSelect.value = itemState;
        updateLgaSelect(itemState, state.lga);
        if (state.lga !== "all") {
          updateLocalitySelect(itemState, state.lga, state.locality);
        }

        locationSuggestions.style.display = "none";
        state.page = 1;
        render();
      }
    });
  }

  // ============================================================================
  // PHASE 10.17: GEOSPATIAL MAP & VIEW MODES LIFECYCLE
  // ============================================================================
  let directoryMapHandle = null;
  let currentViewMode = 'list';

  const searchMapContainer = document.getElementById('search-map-container');
  const searchMapEl = document.getElementById('search-map');
  const mapCounterText = document.getElementById('map-counter-text');
  const viewModeBtns = document.querySelectorAll('.btn-view-mode');
  const mobileMapToggleBtn = document.getElementById('btn-mobile-map-toggle');
  const resultsMain = document.querySelector('.results-main');

  function initSearchMap(providersList) {
    if (!searchMapEl || typeof L === 'undefined') return;
    const MapService = (typeof LokatorMapService !== 'undefined' ? LokatorMapService : null) || (typeof window !== 'undefined' ? window.LokatorMapService : null);

    if (MapService && MapService.initSearchDirectoryMap) {
      directoryMapHandle = MapService.initSearchDirectoryMap('search-map', {
        providers: providersList || [],
        userCoords: state.userCoords
      });
    }
  }

  function updateSearchMap(providersList) {
    if (!searchMapEl || typeof L === 'undefined') return;
    const list = providersList || [];

    if (!directoryMapHandle) {
      initSearchMap(list);
    }

    if (directoryMapHandle && directoryMapHandle.updateProviders) {
      const plotted = directoryMapHandle.updateProviders(list, state.userCoords);
      if (mapCounterText) mapCounterText.textContent = plotted;
    }
  }

  function setViewMode(mode) {
    currentViewMode = mode;
    viewModeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });

    if (resultsMain) {
      resultsMain.classList.toggle('is-split-view', mode === 'split');
      resultsMain.classList.toggle('is-map-view', mode === 'map');
    }

    if (searchMapContainer) {
      searchMapContainer.style.display = (mode === 'list') ? 'none' : 'block';
    }

    if (mobileMapToggleBtn) {
      const isMap = (mode === 'map');
      const icon = document.getElementById('mobile-map-icon');
      const text = document.getElementById('mobile-map-text');
      if (icon) icon.textContent = isMap ? '📋' : '🗺️';
      if (text) text.textContent = isMap ? 'View List' : 'View Map';
    }

    if (mode !== 'list') {
      if (!directoryMapHandle) {
        initSearchMap(state.allProviders || []);
      }
      if (directoryMapHandle && directoryMapHandle.invalidateSize) {
        directoryMapHandle.invalidateSize();
      }
    }
  }

  viewModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setViewMode(btn.dataset.view);
    });
  });

  if (mobileMapToggleBtn) {
    mobileMapToggleBtn.addEventListener('click', () => {
      const nextMode = (currentViewMode === 'map') ? 'list' : 'map';
      setViewMode(nextMode);
    });
  }

  // ============================================================================
  // PHASE 10.17: RECENT SEARCH HISTORY CHIPS
  // ============================================================================
  const recentSearchesBar = document.getElementById('recent-searches-bar');
  const recentSearchesChips = document.getElementById('recent-searches-chips');
  const btnClearHistory = document.getElementById('btn-clear-history');

  function renderRecentSearches() {
    if (!recentSearchesBar || !recentSearchesChips || typeof LokatorDB === 'undefined' || !LokatorDB.searchHistory) return;

    const searches = LokatorDB.searchHistory.getRecentSearches();
    if (!searches || searches.length === 0) {
      recentSearchesBar.style.display = 'none';
      recentSearchesChips.innerHTML = '';
      return;
    }

    recentSearchesChips.innerHTML = searches.map((s, idx) => {
      let rawText = s.keyword || (s.category && s.category !== 'all' ? s.category : (s.location || ''));
      if (!rawText && s.state && s.state !== 'all') rawText = s.state;
      if (!rawText) rawText = 'Search';

      // Title case format (e.g. Electrician, Plumber, AC Repair)
      const cleanTitle = rawText.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : '').join(' ');

      return `
        <div class="recent-chip" data-index="${idx}" data-keyword="${escapeHtml(s.keyword || '')}" data-loc="${escapeHtml(s.location || '')}" data-state="${escapeHtml(s.state || '')}" data-lga="${escapeHtml(s.lga || '')}">
          <span>${escapeHtml(cleanTitle)}</span>
          <button type="button" class="btn-remove-chip" data-idx="${idx}" title="Remove" aria-label="Remove ${escapeHtml(cleanTitle)}">×</button>
        </div>
      `;
    }).join('');

    recentSearchesBar.style.display = 'flex';
  }

  if (recentSearchesChips) {
    recentSearchesChips.addEventListener('click', (e) => {
      const btnRemove = e.target.closest('.btn-remove-chip');
      if (btnRemove) {
        e.stopPropagation();
        const idx = parseInt(btnRemove.getAttribute('data-idx'), 10);
        LokatorDB.searchHistory.removeSearch(idx);
        renderRecentSearches();
        return;
      }

      const chip = e.target.closest('.recent-chip');
      if (chip) {
        const kw = chip.getAttribute('data-keyword');
        const loc = chip.getAttribute('data-loc');
        const st = chip.getAttribute('data-state');
        const lga = chip.getAttribute('data-lga');

        state.keyword = kw || '';
        state.locationQuery = loc || '';
        if (searchInput) searchInput.value = state.keyword;
        if (locationSearch) locationSearch.value = state.locationQuery;

        if (st && st !== 'all') {
          state.state = st;
          if (stateSelect) stateSelect.value = st;
          updateLgaSelect(st, lga || 'all');
        }

        state.page = 1;
        render();
      }
    });
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      if (typeof LokatorDB !== 'undefined' && LokatorDB.searchHistory) {
        LokatorDB.searchHistory.clearSearches();
        renderRecentSearches();
      }
    });
  }

  // Clickable Mini-Tag to Search Specific Skill
  if (providersContainer) {
    providersContainer.addEventListener("click", (e) => {
      const tag = e.target.closest(".mini-tag");
      if (tag && tag.dataset.skill) {
        const skill = tag.dataset.skill;
        if (searchInput) searchInput.value = skill;
        state.keyword = skill;
        state.category = "all";
        if (categorySelect) categorySelect.value = "all";
        state.page = 1;
        render();
        window.scrollTo({ top: 250, behavior: 'smooth' });
      }
    });
  }

  // 7. Event Listeners for Filters
  if (categorySelect) {
    categorySelect.addEventListener("change", (e) => {
      state.category = e.target.value;
      if (typeof LokatorTelemetry !== 'undefined' && e.target.value !== 'all') {
        const canonicalCat = (typeof CategoryMap !== 'undefined' && CategoryMap.resolveQuery)
          ? CategoryMap.resolveQuery(e.target.value)
          : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        LokatorTelemetry.trackEvent('category_browse_clicked', { category: canonicalCat, source: 'search_filter' });
      }
      state.page = 1;
      render();
    });
  }

  // Registration CTA click tracker
  document.addEventListener('click', (e) => {
    const cta = e.target.closest('a[href*="register.html"]');
    if (cta && typeof LokatorTelemetry !== 'undefined') {
      LokatorTelemetry.trackEvent('registration_cta_clicked', { source: 'search_page' });
    }
  });

  if (stateSelect) {
    stateSelect.addEventListener("change", (e) => {
      const selectedState = e.target.value;
      state.state = selectedState;
      state.lga = "all";
      state.locality = "all";
      state.locationQuery = selectedState !== "all" ? selectedState : "";
      if (locationSearch) locationSearch.value = state.locationQuery;
      updateLgaSelect(selectedState, "all");
      state.page = 1;
      render();
    });
  }

  if (lgaSelect) {
    lgaSelect.addEventListener("change", (e) => {
      const selectedLga = e.target.value;
      state.lga = selectedLga;
      state.locality = "all";
      state.locationQuery = (selectedLga !== "all" && state.state !== "all") 
        ? `${selectedLga}, ${state.state}` 
        : (state.state !== "all" ? state.state : "");
      if (locationSearch) locationSearch.value = state.locationQuery;
      updateLocalitySelect(state.state, selectedLga, "all");
      state.page = 1;
      render();
    });
  }

  if (localitySelect) {
    localitySelect.addEventListener("change", (e) => {
      state.locality = e.target.value;
      state.page = 1;
      render();
    });
  }

  if (citySelect) {
    citySelect.addEventListener("change", (e) => {
      state.city = e.target.value;
      state.page = 1;
      render();
    });
  }

  function resolveAndSyncLocation(locText) {
    if (!locText || typeof NigeriaLocations === 'undefined') return;
    const matches = NigeriaLocations.searchLocations(locText, 1);
    if (matches && matches.length > 0) {
      const top = matches[0];
      if (top.state) {
        state.state = top.state;
        if (stateSelect) stateSelect.value = top.state;
        state.lga = top.lga || "all";
        updateLgaSelect(top.state, state.lga);
        if (top.locality) {
          state.locality = top.locality;
          updateLocalitySelect(top.state, state.lga, top.locality);
        }
      }
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", debounce((e) => {
      const val = e.target.value.trim();
      state.keyword = val;
      state.page = 1;
      renderSuggestions(val);
      render();
    }, 200));

    searchInput.addEventListener("focus", (e) => {
      if (e.target.value.trim()) {
        renderSuggestions(e.target.value.trim());
      }
    });

    searchInput.addEventListener("blur", hideSuggestions);

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        hideSuggestions();
        if (searchInput) state.keyword = searchInput.value.trim();
        state.page = 1;
        render();
      }
    });
  }

  if (locationSearch) {
    locationSearch.addEventListener("input", debounce((e) => {
      const val = e.target.value.trim();
      state.locationQuery = val;
      state.page = 1;
      renderLocationSuggestions(val);
      render();
    }, 200));

    locationSearch.addEventListener("focus", (e) => {
      if (e.target.value.trim()) {
        renderLocationSuggestions(e.target.value.trim());
      }
    });

    locationSearch.addEventListener("blur", hideLocationSuggestions);

    locationSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        hideLocationSuggestions();
        const locVal = locationSearch.value.trim();
        state.locationQuery = locVal;
        resolveAndSyncLocation(locVal);
        state.page = 1;
        render();
      }
    });
  }

  if (applyMainSearchBtn) {
    applyMainSearchBtn.addEventListener("click", (e) => {
      e.preventDefault();
      hideSuggestions();
      hideLocationSuggestions();
      if (searchInput) state.keyword = searchInput.value.trim();
      if (locationSearch) {
        const locVal = locationSearch.value.trim();
        state.locationQuery = locVal;
        resolveAndSyncLocation(locVal);
      }
      state.page = 1;
      render();
    });
  }

  if (distanceRange && distanceVal) {
    distanceRange.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      state.maxDistance = val;
      distanceVal.textContent = `${val} km`;
    });
    distanceRange.addEventListener("change", () => {
      state.page = 1;
      render();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      state.sortBy = e.target.value;
      render();
    });
  }

  if (verifiedOnlyCb) {
    verifiedOnlyCb.addEventListener("change", (e) => {
      state.verifiedOnly = e.target.checked;
      state.page = 1;
      render();
    });
  }

  if (availableOnlyCb) {
    availableOnlyCb.addEventListener("change", (e) => {
      state.availableOnly = e.target.checked;
      state.page = 1;
      render();
    });
  }

  // Minimum Rating Filter Pills
  if (ratingPills) {
    ratingPills.addEventListener("click", (e) => {
      const btn = e.target.closest(".pill-btn");
      if (btn && btn.dataset.rating != null) {
        ratingPills.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.minRating = Number(btn.dataset.rating);
        state.page = 1;
        render();
      }
    });
  }

  // Reset Filters
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      state.keyword = "";
      state.category = "all";
      state.industry = "all";
      state.specialization = "all";
      state.city = "all";
      state.state = "all";
      state.lga = "all";
      state.locality = "all";
      state.locationQuery = "";
      state.maxDistance = 50;
      state.minRating = 0;
      state.verifiedOnly = false;
      state.availableOnly = false;
      state.page = 1;

      if (searchInput) searchInput.value = "";
      if (categorySelect) categorySelect.value = "all";
      if (citySelect) citySelect.value = "all";
      if (stateSelect) stateSelect.value = "all";
      updateLgaSelect("all");
      if (locationSearch) locationSearch.value = "";
      if (distanceRange) distanceRange.value = 50;
      if (distanceVal) distanceVal.textContent = "50 km";
      if (verifiedOnlyCb) verifiedOnlyCb.checked = false;
      if (availableOnlyCb) availableOnlyCb.checked = false;
      if (gpsTrigger) gpsTrigger.classList.remove("active");
      if (ratingPills) {
        ratingPills.querySelectorAll(".pill-btn").forEach((b, idx) => {
          b.classList.toggle("active", idx === 0);
        });
      }

      try {
        sessionStorage.removeItem('lokator_temp_location_name');
        sessionStorage.removeItem('lokator_temp_lat');
        sessionStorage.removeItem('lokator_temp_lng');
        sessionStorage.removeItem('lokator_temp_state');
        sessionStorage.removeItem('lokator_temp_lga');
      } catch (e) {}

      render();
    });
  }

  // Phase 10.18B: Real GPS Trigger on Search Directory Page
  if (gpsTrigger) {
    gpsTrigger.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!("geolocation" in navigator)) {
        alert("Geolocation is not supported by your device browser.");
        return;
      }

      gpsTrigger.classList.add("is-loading");
      if (locationSearch) {
        locationSearch.value = "";
        locationSearch.placeholder = "📍 Detecting precise location...";
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          gpsTrigger.classList.remove("is-loading");
          gpsTrigger.classList.add("active");
          gpsTrigger.style.background = "#006B3F";
          gpsTrigger.style.color = "#fff";

          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          state.userCoords = { lat, lng };
          state.sortBy = "distance-asc";
          if (sortSelect) sortSelect.value = "distance-asc";

          let resolved = null;
          if (typeof NigeriaLocations !== "undefined" && NigeriaLocations.reverseGeocode) {
            resolved = await NigeriaLocations.reverseGeocode(lat, lng);
          } else if (typeof NigeriaLocations !== "undefined" && NigeriaLocations.findNearest) {
            resolved = NigeriaLocations.findNearest(lat, lng);
          }

          const detectedName = (resolved && resolved.formatted) ? resolved.formatted : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          if (locationSearch) locationSearch.value = detectedName;
          state.locationQuery = detectedName;

          if (resolved) {
            if (resolved.state && resolved.state !== "all") {
              state.state = resolved.state;
              if (stateSelect) stateSelect.value = resolved.state;
              updateLgaSelect(resolved.state, resolved.lga || "all");
            }
            if (resolved.lga && resolved.lga !== "all") {
              state.lga = resolved.lga;
            }
          }

          try {
            sessionStorage.setItem("lokator_temp_lat", lat.toString());
            sessionStorage.setItem("lokator_temp_lng", lng.toString());
            sessionStorage.setItem("lokator_temp_location_name", detectedName);
            if (resolved && resolved.state) sessionStorage.setItem("lokator_temp_state", resolved.state);
            if (resolved && resolved.lga) sessionStorage.setItem("lokator_temp_lga", resolved.lga);
          } catch (err) {}

          state.page = 1;
          render();
        },
        (err) => {
          gpsTrigger.classList.remove("is-loading");
          gpsTrigger.style.background = "rgba(220, 38, 38, 0.15)";
          gpsTrigger.style.color = "#EF4444";
          if (locationSearch) locationSearch.placeholder = "City, LGA or neighborhood...";
          
          let errMsg = "Could not detect your GPS location.";
          if (err.code === 1) errMsg = "Location access was denied. Please allow location permissions in your browser or select your city manually.";
          else if (err.code === 2) errMsg = "Location unavailable. Please check your device location settings.";
          else if (err.code === 3) errMsg = "Location request timed out.";
          alert(errMsg);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  }

  // Phase 10.10: Browse-by-Industry Click Handler (Delegated)
  if (browseSection) {
    browseSection.addEventListener("click", (e) => {
      // 1. If clicked on a specific skill chip tag
      const skillPill = e.target.closest(".industry-skill-pill-tag");
      if (skillPill && skillPill.dataset.skillSlug) {
        e.preventDefault();
        e.stopPropagation();
        const slug = skillPill.dataset.skillSlug;
        const catObj = (typeof CategoryMap !== 'undefined') ? CategoryMap.getBySlug(slug) : null;
        state.category = slug;
        state.keyword = "";
        if (searchInput) searchInput.value = "";
        if (categorySelect && catObj) {
          categorySelect.value = catObj.dropdownValue || catObj.name;
        }
        state.page = 1;

        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('skill_selected', { skill: slug, source: 'browse_grid' });
        }
        if (typeof LokatorDB !== 'undefined' && LokatorDB.marketplaceDiscovery) {
          LokatorDB.marketplaceDiscovery.trackDiscoveryEvent('skill_selected', { skill: slug, source: 'browse_grid' }).catch(() => {});
        }

        render();
        window.scrollTo({ top: 260, behavior: 'smooth' });
        return;
      }

      // 2. If clicked on the industry card itself
      const card = e.target.closest(".industry-browse-card");
      if (card && card.dataset.industryId) {
        e.preventDefault();
        const indId = card.dataset.industryId;
        state.industry = (state.industry === indId) ? "all" : indId;
        state.page = 1;

        if (typeof LokatorTelemetry !== 'undefined') {
          LokatorTelemetry.trackEvent('industry_selected', { industry: indId, source: 'browse_grid' });
        }
        if (typeof LokatorDB !== 'undefined' && LokatorDB.marketplaceDiscovery) {
          LokatorDB.marketplaceDiscovery.trackDiscoveryEvent('industry_selected', { industry: indId, source: 'browse_grid' }).catch(() => {});
        }

        render();
        window.scrollTo({ top: 260, behavior: 'smooth' });
      }
    });
  }

  // Phase 10.12F: Mobile Filter Bottom-Sheet & Backdrop Lifecycle
  function openFilterDrawer() {
    if (filterSidebar) {
      filterSidebar.classList.add("open", "mobile-open");
    }
    if (filterBackdrop) {
      filterBackdrop.classList.add("active");
    }
    document.body.classList.add("filter-drawer-open");
    if (mobileFilterBtn) {
      mobileFilterBtn.setAttribute("aria-expanded", "true");
    }
    if (mobileFilterCloseBtn) {
      try { mobileFilterCloseBtn.focus(); } catch (e) {}
    }
    if (typeof LokatorTelemetry !== 'undefined') {
      LokatorTelemetry.trackEvent('mobile_filter_opened', { source: 'search_toolbar' });
    }
  }

  function closeFilterDrawer() {
    if (filterSidebar) {
      filterSidebar.classList.remove("open", "mobile-open");
    }
    if (filterBackdrop) {
      filterBackdrop.classList.remove("active");
    }
    document.body.classList.remove("filter-drawer-open");
    if (mobileFilterBtn) {
      mobileFilterBtn.setAttribute("aria-expanded", "false");
      try { mobileFilterBtn.focus(); } catch (e) {}
    }
  }

  if (mobileFilterBtn) {
    mobileFilterBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openFilterDrawer();
    });
  }

  if (mobileFilterCloseBtn) {
    mobileFilterCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeFilterDrawer();
    });
  }

  if (filterBackdrop) {
    filterBackdrop.addEventListener("click", (e) => {
      e.preventDefault();
      closeFilterDrawer();
    });
  }

  if (mobileApplyFiltersBtn) {
    mobileApplyFiltersBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeFilterDrawer();
      state.page = 1;
      render();
      if (typeof LokatorTelemetry !== 'undefined') {
        LokatorTelemetry.trackEvent('mobile_filter_applied', {
          category: state.category,
          state: state.state,
          lga: state.lga,
          locality: state.locality
        });
      }
    });
  }

  if (mobileResetFiltersBtn) {
    mobileResetFiltersBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (resetFiltersBtn) {
        resetFiltersBtn.click();
      }
      closeFilterDrawer();
    });
  }

  // GPS / "Near Me" Search Handler with High Accuracy & Reverse Geocoding
  if (gpsTrigger) {
    gpsTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (!('geolocation' in navigator)) {
        alert('Geolocation is not supported by your browser.');
        return;
      }

      gpsTrigger.classList.add('loading');
      const origHtml = gpsTrigger.innerHTML;
      gpsTrigger.innerHTML = '<span>Locating...</span>';

      const handleGpsSuccess = async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        state.userCoords = { lat, lng };
        state.sortBy = "distance-asc";
        if (sortSelect) sortSelect.value = "distance-asc";

        try {
          const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
            headers: { 'Accept': 'application/json' }
          });
          if (resp.ok) {
            const data = await resp.json();
            const a = data.address || {};
            const area = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.town || a.city || 'My Location';
            const city = a.city || a.county || a.state_district || 'Lagos';
            const locName = `${area}, ${city}`;
            if (locationSearch) locationSearch.value = locName;
            state.locationQuery = locName;
            try {
              sessionStorage.setItem('lokator_temp_location_name', locName);
              sessionStorage.setItem('lokator_temp_lat', lat.toString());
              sessionStorage.setItem('lokator_temp_lng', lng.toString());
            } catch (err) {}
          }
        } catch (e) {
          if (locationSearch) locationSearch.value = `Near Me (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
        }

        gpsTrigger.innerHTML = '<span style="color:#52E58C;">✓ Located</span>';
        setTimeout(() => { gpsTrigger.innerHTML = origHtml; }, 3000);
        state.page = 1;
        render();
      };

      const handleGpsFail = (err) => {
        console.warn('Search GPS notice:', err);
        if (err && err.code === 3) {
          // Retry with network geolocation
          navigator.geolocation.getCurrentPosition(
            handleGpsSuccess,
            (finalErr) => {
              gpsTrigger.innerHTML = origHtml;
              alert(finalErr.code === 1 ? 'Location permission was denied. Please enter your area manually.' : 'Could not acquire GPS fix. Please enter your area manually.');
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
          );
          return;
        }
        gpsTrigger.innerHTML = origHtml;
        alert(err && err.code === 1 ? 'Location permission was denied. Please enter your area manually.' : 'Could not detect your current location. Please enter your area manually.');
      };

      navigator.geolocation.getCurrentPosition(
        handleGpsSuccess,
        handleGpsFail,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  // Hamburger / Mobile Nav Menu Handler with Outside Click Dismiss
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

  // Close drawer on Escape key press
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileDrawer && mobileDrawer.classList.contains("open")) {
      closeMobileNav();
    }
    if (e.key === "Escape" && filterSidebar && (filterSidebar.classList.contains("open") || filterSidebar.classList.contains("mobile-open"))) {
      closeFilterDrawer();
    }
  });

  // ============================================================================
  // PHASE 10.14: QUICK MATCH MODAL HANDLERS
  // ============================================================================
  const quickMatchModal = document.getElementById('quick-match-modal');
  const quickMatchCloseBtn = document.getElementById('quick-match-close-btn');
  const emptyQuickMatchBtn = document.getElementById('btn-empty-quick-match');
  const quickMatchForm = document.getElementById('quick-match-form');
  const qmCategoryInput = document.getElementById('qm-category');
  const qmStateSelect = document.getElementById('qm-state');
  const qmLgaInput = document.getElementById('qm-lga');
  const qmNeighborhoodInput = document.getElementById('qm-neighborhood');
  const qmUrgencySelect = document.getElementById('qm-urgency');
  const qmDescriptionInput = document.getElementById('qm-description');
  const qmResultBox = document.getElementById('qm-result-box');
  const qmResultText = document.getElementById('qm-result-text');
  const qmWhatsAppBtn = document.getElementById('qm-whatsapp-btn');

  function openQuickMatch(cat = '', st = '', lga = '') {
    if (!quickMatchModal) return;
    if (qmCategoryInput) qmCategoryInput.value = cat || (state.category !== 'all' ? state.category : (state.keyword || ''));
    if (qmStateSelect && st) qmStateSelect.value = st;
    if (qmLgaInput) qmLgaInput.value = lga || (state.lga !== 'all' ? state.lga : (state.city !== 'all' ? state.city : ''));
    if (qmResultBox) qmResultBox.style.display = 'none';
    quickMatchModal.style.display = 'flex';
    quickMatchModal.setAttribute('aria-hidden', 'false');
  }

  function closeQuickMatch() {
    if (!quickMatchModal) return;
    quickMatchModal.style.display = 'none';
    quickMatchModal.setAttribute('aria-hidden', 'true');
  }

  if (emptyQuickMatchBtn) {
    emptyQuickMatchBtn.addEventListener('click', () => {
      openQuickMatch(state.keyword || (state.category !== 'all' ? state.category : ''), state.state !== 'all' ? state.state : 'Delta', state.city !== 'all' ? state.city : '');
    });
  }

  if (quickMatchCloseBtn) {
    quickMatchCloseBtn.addEventListener('click', closeQuickMatch);
  }

  if (quickMatchModal) {
    quickMatchModal.addEventListener('click', (e) => {
      if (e.target === quickMatchModal) closeQuickMatch();
    });
  }

  if (quickMatchForm) {
    quickMatchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cat = qmCategoryInput ? qmCategoryInput.value.trim() : 'artisan';
      const st = qmStateSelect ? qmStateSelect.value.trim() : 'Delta';
      const lga = qmLgaInput ? qmLgaInput.value.trim() : 'Warri South';
      const neigh = qmNeighborhoodInput ? qmNeighborhoodInput.value.trim() : '';
      const urg = qmUrgencySelect ? qmUrgencySelect.value : 'within_24h';
      const desc = qmDescriptionInput ? qmDescriptionInput.value.trim() : '';

      if (typeof LokatorDB !== 'undefined' && LokatorDB.liquidityEngine) {
        const res = await LokatorDB.liquidityEngine.generateJobRequest({
          category: cat,
          state: st,
          lga: lga,
          neighborhood: neigh,
          urgency: urg,
          description: desc
        });

        if (res.success && res.primary_whatsapp_url) {
          if (qmResultBox && qmResultText && qmWhatsAppBtn) {
            const artisanName = res.primary_artisan ? (res.primary_artisan.first_name || res.primary_artisan.name) : 'Verified Artisan';
            qmResultText.textContent = `Connected with ${artisanName} in ${res.location}. Tap below to send your pre-filled job brief on WhatsApp!`;
            qmWhatsAppBtn.href = res.primary_whatsapp_url;
            qmWhatsAppBtn.style.display = 'flex';
            qmResultBox.style.display = 'block';
          }
          window.open(res.primary_whatsapp_url, '_blank');
        } else {
          if (qmResultBox && qmResultText && qmWhatsAppBtn) {
            qmResultText.textContent = `Job request broadcasted to the ${lga} artisan community feed! We will notify nearby artisans as they come online.`;
            qmWhatsAppBtn.style.display = 'none';
            qmResultBox.style.display = 'block';
          }
        }
      }
    });
  }

  // Phase 10.15: Bookmark toggle and Data Saver listener
  document.addEventListener('click', async (e) => {
    const btnBookmark = e.target.closest('.btn-save-bookmark-card');
    if (btnBookmark) {
      e.preventDefault();
      const provId = btnBookmark.getAttribute('data-provider-id');
      if (!provId || typeof LokatorDB === 'undefined' || !LokatorDB.offline) return;

      const isSaved = LokatorDB.offline.isProviderSaved(provId);
      if (isSaved) {
        LokatorDB.offline.removeProviderBookmark(provId);
        btnBookmark.classList.remove('is-saved');
        btnBookmark.innerHTML = `<span>🤍</span><span>Save Contact</span>`;
      } else {
        const prov = state.allProviders.find(p => String(p.id) === String(provId));
        if (prov) {
          LokatorDB.offline.saveProviderBookmark(prov);
          btnBookmark.classList.add('is-saved');
          btnBookmark.innerHTML = `<span>❤️</span><span>Saved Offline</span>`;
        }
      }
    }

    const btnDataSaver = e.target.closest('#btn-toggle-data-saver');
    if (btnDataSaver && typeof LokatorDB !== 'undefined' && LokatorDB.offline) {
      e.preventDefault();
      const isCurrentlyActive = LokatorDB.offline.isDataSaverActive();
      const newActive = !isCurrentlyActive;
      LokatorDB.offline.setDataSaver(newActive);
      const label = document.getElementById('data-saver-label');
      if (label) label.textContent = newActive ? 'Data Saver (ON)' : 'Data Saver';
      btnDataSaver.style.borderColor = newActive ? '#10B981' : 'rgba(255,255,255,0.12)';
      btnDataSaver.style.color = newActive ? '#34D399' : '#F1F5F9';
    }
  });

  // Sync initial data saver button state
  if (typeof LokatorDB !== 'undefined' && LokatorDB.offline) {
    const isCurrentlyActive = LokatorDB.offline.isDataSaverActive();
    const btnDataSaver = document.getElementById('btn-toggle-data-saver');
    const label = document.getElementById('data-saver-label');
    if (isCurrentlyActive && btnDataSaver) {
      if (label) label.textContent = 'Data Saver (ON)';
      btnDataSaver.style.borderColor = '#10B981';
      btnDataSaver.style.color = '#34D399';
    }
  }

  // Mobile Filter Drawer Sheet Handlers
  function openMobileFilterDrawer() {
    if (filterSidebar) {
      filterSidebar.classList.add("open", "mobile-open");
      document.body.style.overflow = "hidden";
    }
  }

  function closeMobileFilterDrawer() {
    if (filterSidebar) {
      filterSidebar.classList.remove("open", "mobile-open");
      document.body.style.overflow = "";
    }
  }

  if (mobileFilterBtn) {
    mobileFilterBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openMobileFilterDrawer();
    });
  }

  if (mobileFilterCloseBtn) {
    mobileFilterCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeMobileFilterDrawer();
    });
  }

  if (mobileApplyFiltersBtn) {
    mobileApplyFiltersBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeMobileFilterDrawer();
      state.page = 1;
      render();
    });
  }

  if (mobileResetFiltersBtn) {
    mobileResetFiltersBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (resetFiltersBtn) resetFiltersBtn.click();
      closeMobileFilterDrawer();
    });
  }

  if (filterBackdrop) {
    filterBackdrop.addEventListener("click", closeMobileFilterDrawer);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && filterSidebar && (filterSidebar.classList.contains("open") || filterSidebar.classList.contains("mobile-open"))) {
      closeMobileFilterDrawer();
    }
  });

  // Handle browser back/forward navigation
  window.addEventListener("popstate", () => {
    initFromUrlParams();
    render();
  });

  // Execute initial load
  initFromUrlParams();
  render();
});
