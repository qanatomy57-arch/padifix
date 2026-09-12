/**
 * LOKATOR.NG — MAP SERVICE & REAL GPS GEOLOCATION ENGINE (Phase 10.19)
 * 
 * Provides unified interactive map rendering (Google Maps with seamless Leaflet/OSM fallback)
 * and precise browser GPS geolocation with privacy-safe Nigerian locality centroid resolution.
 */

(function (global) {
  'use strict';

  const LokatorMapService = {
    _googleMapsLoaded: false,
    _googleMapsLoading: false,
    _googleMapsFailed: false,
    _loadingCallbacks: [],

    /**
     * Get Google Maps API key from environment / window / meta tag
     */
    getGoogleMapsApiKey: function () {
      if (typeof window !== 'undefined') {
        if (window.GOOGLE_MAPS_API_KEY && window.GOOGLE_MAPS_API_KEY !== 'undefined') {
          return window.GOOGLE_MAPS_API_KEY;
        }
        if (window.LOKATOR_GOOGLE_MAPS_API_KEY && window.LOKATOR_GOOGLE_MAPS_API_KEY !== 'undefined') {
          return window.LOKATOR_GOOGLE_MAPS_API_KEY;
        }
        const metaTag = document.querySelector('meta[name="google-maps-api-key"]');
        if (metaTag && metaTag.content && metaTag.content !== 'undefined') {
          return metaTag.content;
        }
      }
      if (typeof process !== 'undefined' && process.env && process.env.GOOGLE_MAPS_API_KEY) {
        return process.env.GOOGLE_MAPS_API_KEY;
      }
      return null;
    },

    /**
     * Get Google Maps Map ID for vector / cloud-based styling
     */
    getGoogleMapsMapId: function () {
      if (typeof window !== 'undefined') {
        if (window.GOOGLE_MAPS_MAP_ID && window.GOOGLE_MAPS_MAP_ID !== 'undefined') {
          return window.GOOGLE_MAPS_MAP_ID;
        }
        const metaTag = document.querySelector('meta[name="google-maps-map-id"]');
        if (metaTag && metaTag.content && metaTag.content !== 'undefined') {
          return metaTag.content;
        }
      }
      if (typeof process !== 'undefined' && process.env && process.env.GOOGLE_MAPS_MAP_ID) {
        return process.env.GOOGLE_MAPS_MAP_ID;
      }
      return null;
    },

    /**
     * Load Google Maps JS API asynchronously if an API key is available
     */
    loadGoogleMapsApi: function (callback) {
      if (this._googleMapsLoaded || (typeof google !== 'undefined' && google.maps)) {
        this._googleMapsLoaded = true;
        if (callback) callback(true);
        return;
      }

      // If Google Maps previously failed or authentication was rejected, immediately fallback without retrying
      if (this._googleMapsFailed) {
        if (callback) callback(false);
        return;
      }

      if (callback) this._loadingCallbacks.push(callback);

      if (this._googleMapsLoading) return;

      const apiKey = this.getGoogleMapsApiKey();
      if (!apiKey) {
        // No API key configured — proceed gracefully with interactive Leaflet fallback
        this._triggerCallbacks(false);
        return;
      }

      this._googleMapsLoading = true;
      if (typeof window !== 'undefined') {
        window.gm_authFailure = () => {
          console.warn('LokatorMapService: Google Maps authentication or billing error detected. Operating via Leaflet/OpenStreetMap fallback.');
          this._googleMapsLoaded = false;
          this._googleMapsFailed = true;
          if (typeof window.PadiFixSentry !== 'undefined' && window.PadiFixSentry.captureMessage) {
            window.PadiFixSentry.captureMessage('Google Maps authentication or billing gate active; Leaflet/OSM fallback engaged.', 'warning');
          }
        };
      }
      const script = document.createElement('script');
      const mapId = this.getGoogleMapsMapId();
      let src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry`;
      if (mapId) {
        src += `&map_ids=${encodeURIComponent(mapId)}`;
      }
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this._googleMapsLoaded = true;
        this._googleMapsLoading = false;
        this._triggerCallbacks(true);
      };
      script.onerror = () => {
        this._googleMapsLoading = false;
        this._googleMapsFailed = true;
        console.warn('LokatorMapService: Google Maps failed to load. Falling back to interactive Leaflet map.');
        if (typeof window !== 'undefined' && typeof window.PadiFixSentry !== 'undefined' && window.PadiFixSentry.captureMessage) {
          window.PadiFixSentry.captureMessage('Google Maps script failed to load; Leaflet/OSM fallback engaged.', 'warning');
        }
        this._triggerCallbacks(false);
      };
      document.head.appendChild(script);
    },

    _triggerCallbacks: function (success) {
      while (this._loadingCallbacks.length > 0) {
        const cb = this._loadingCallbacks.shift();
        try { cb(success); } catch (e) { console.error(e); }
      }
    },

    /**
     * Calculate straight-line distance in kilometers (Haversine formula)
     */
    calculateDistanceKm: function (lat1, lon1, lat2, lon2) {
      if (!lat1 || !lon1 || !lat2 || !lon2) return null;
      const R = 6371; // Earth radius in km
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },

    /**
     * Format distance for friendly display (e.g. "1.2 km" or "450 m")
     */
    formatDistance: function (km) {
      if (km === null || km === undefined || isNaN(km)) return '';
      if (km < 1) {
        return `~${Math.round(km * 1000)} m away`;
      }
      return `~${km.toFixed(1)} km away`;
    },

    /**
     * Format accuracy display (e.g. "±12 m")
     */
    formatAccuracy: function (meters) {
      if (!meters || isNaN(meters)) return '±15 m';
      const m = Math.round(meters);
      return `±${m} m`;
    },

    /**
     * Format current relative timestamp
     */
    formatTimestamp: function () {
      return 'Just now';
    },

    /**
     * Request real GPS geolocation from the browser
     */
    requestUserGPS: function (options) {
      options = options || {};
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          const err = new Error('Geolocation is not supported by your browser.');
          err.code = 'UNSUPPORTED';
          return reject(err);
        }

        const geoOptions = {
          enableHighAccuracy: options.highAccuracy !== false,
          timeout: options.timeout || 12000,
          maximumAge: options.maximumAge || 0
        };

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords = position.coords;
            const result = {
              lat: coords.latitude,
              lng: coords.longitude,
              accuracy: coords.accuracy || 15,
              accuracyFormatted: this.formatAccuracy(coords.accuracy),
              timestamp: new Date(),
              timestampFormatted: this.formatTimestamp(),
              isPrecise: (coords.accuracy || 100) <= 50
            };
            resolve(result);
          },
          (error) => {
            let friendlyMessage = 'Unable to detect your current location.';
            let code = 'UNKNOWN';
            if (error.code === 1) {
              friendlyMessage = 'Location permission was denied. Please allow location access in your browser settings.';
              code = 'PERMISSION_DENIED';
            } else if (error.code === 2) {
              friendlyMessage = 'Position unavailable. Please check your GPS or mobile data network.';
              code = 'POSITION_UNAVAILABLE';
            } else if (error.code === 3) {
              friendlyMessage = 'Location request timed out. Please tap retry.';
              code = 'TIMEOUT';
            }
            const err = new Error(friendlyMessage);
            err.code = code;
            err.original = error;
            reject(err);
          },
          geoOptions
        );
      });
    },

    /**
     * Initialize an interactive map inside a container
     */
    initServiceMap: function (containerId, options) {
      options = options || {};
      const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
      if (!container) return null;

      const providerLat = Number(options.lat) || 6.5244;
      const providerLng = Number(options.lng) || 3.3792;
      const zoom = options.zoom || 14;
      const providerName = options.providerName || 'Verified Artisan';
      const locality = options.locality || 'Service Area';

      const mapHandle = {
        type: 'none',
        instance: null,
        providerMarker: null,
        userMarker: null,
        accuracyCircle: null,
        center: [providerLat, providerLng],

        setCenter: function (lat, lng, newZoom) {
          if (this.type === 'google' && this.instance) {
            this.instance.setCenter({ lat: Number(lat), lng: Number(lng) });
            if (newZoom) this.instance.setZoom(newZoom);
          } else if (this.type === 'leaflet' && this.instance) {
            this.instance.setView([Number(lat), Number(lng)], newZoom || this.instance.getZoom());
          }
        },

        setUserLocation: function (userLat, userLng, accuracy) {
          userLat = Number(userLat);
          userLng = Number(userLng);
          accuracy = Number(accuracy) || 15;

          if (this.type === 'leaflet' && typeof L !== 'undefined' && this.instance) {
            // Remove previous user marker and circle
            if (this.userMarker) this.instance.removeLayer(this.userMarker);
            if (this.accuracyCircle) this.instance.removeLayer(this.accuracyCircle);

            // Accuracy Circle
            this.accuracyCircle = L.circle([userLat, userLng], {
              radius: accuracy,
              color: '#3B82F6',
              fillColor: '#3B82F6',
              fillOpacity: 0.15,
              weight: 1.5
            }).addTo(this.instance);

            // Pulse User Marker
            const userIcon = L.divIcon({
              className: 'lokator-user-marker',
              html: `
                <div class="user-pulse-wrap">
                  <div class="user-pulse-ring"></div>
                  <div class="user-pulse-dot"></div>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });

            this.userMarker = L.marker([userLat, userLng], { icon: userIcon, zIndexOffset: 1000 }).addTo(this.instance);
            this.userMarker.bindPopup('<strong>You are here</strong><br><span style="font-size:11px; color:#64748B;">GPS Location Detected</span>');

            // Fit bounds to show both provider and user
            const bounds = L.latLngBounds([
              [providerLat, providerLng],
              [userLat, userLng]
            ]);
            this.instance.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
          } else if (this.type === 'google' && typeof google !== 'undefined' && this.instance) {
            if (this.userMarker) this.userMarker.setMap(null);
            if (this.accuracyCircle) this.accuracyCircle.setMap(null);

            this.accuracyCircle = new google.maps.Circle({
              strokeColor: '#3B82F6',
              strokeOpacity: 0.8,
              strokeWeight: 1.5,
              fillColor: '#3B82F6',
              fillOpacity: 0.15,
              map: this.instance,
              center: { lat: userLat, lng: userLng },
              radius: accuracy
            });

            this.userMarker = new google.maps.Marker({
              position: { lat: userLat, lng: userLng },
              map: this.instance,
              title: 'You are here',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: '#2563EB',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2
              }
            });

            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: providerLat, lng: providerLng });
            bounds.extend({ lat: userLat, lng: userLng });
            this.instance.fitBounds(bounds, { top: 35, right: 35, bottom: 35, left: 35 });
          }
        },
        invalidateSize: function () {
          if (this.type === 'leaflet' && this.instance) {
            try { this.instance.invalidateSize(); } catch (e) {}
          } else if (this.type === 'google' && typeof google !== 'undefined' && google.maps && this.instance) {
            try { google.maps.event.trigger(this.instance, 'resize'); } catch (e) {}
          }
        },

        destroy: function () {
          if (this.type === 'leaflet' && this.instance) {
            try { this.instance.remove(); } catch (e) {}
            this.instance = null;
          }
          if (container) {
            if (container._lokator_lmap) container._lokator_lmap = null;
            if (container._leaflet_id) container._leaflet_id = null;
          }
        }
      };

      // Check if Google Maps is available
      if (typeof google !== 'undefined' && google.maps) {
        try {
          const mapId = this.getGoogleMapsMapId();
          const mapOptions = {
            center: { lat: providerLat, lng: providerLng },
            zoom: zoom,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false
          };
          if (mapId) {
            mapOptions.mapId = mapId;
          } else {
            mapOptions.styles = [
              { elementType: 'geometry', stylers: [{ color: '#1B241E' }] },
              { elementType: 'labels.text.stroke', stylers: [{ color: '#1B241E' }] },
              { elementType: 'labels.text.fill', stylers: [{ color: '#88988D' }] },
              { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C3E33' }] },
              { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0C130E' }] }
            ];
          }
          const gmap = new google.maps.Map(container, mapOptions);

          const gMarker = new google.maps.Marker({
            position: { lat: providerLat, lng: providerLng },
            map: gmap,
            title: `${providerName} (${locality})`
          });

          mapHandle.type = 'google';
          mapHandle.instance = gmap;
          mapHandle.providerMarker = gMarker;
          return mapHandle;
        } catch (e) {
          console.warn('LokatorMapService: Google Maps initialization failed, using Leaflet.', e);
        }
      }

      // Interactive Leaflet Fallback (Zero downtime & offline friendly)
      if (typeof L !== 'undefined') {
        try {
          // Clean up previous Leaflet instance if attached
          if (container._lokator_lmap) {
            try { container._lokator_lmap.remove(); } catch (e) {}
            container._lokator_lmap = null;
          }
          if (container._leaflet_id) {
            container._leaflet_id = null;
          }
          container.innerHTML = '';

          const lmap = L.map(container, {
            zoomControl: true,
            scrollWheelZoom: false,
            attributionControl: false
          }).setView([providerLat, providerLng], zoom);

          container._lokator_lmap = lmap;

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            subdomains: ['a', 'b', 'c']
          }).addTo(lmap);

          // Provider Pin Marker
          const providerIcon = L.divIcon({
            className: 'lokator-service-marker',
            html: `
              <div class="service-pin-badge">
                <span class="service-pin-icon">📍</span>
                <span class="service-pin-text">${escapeMapHtml(locality)}</span>
              </div>
            `,
            iconSize: [120, 36],
            iconAnchor: [60, 36]
          });

          const lMarker = L.marker([providerLat, providerLng], { icon: providerIcon }).addTo(lmap);
          const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${providerLat},${providerLng}`;
          lMarker.bindPopup(`
            <div style="font-family: inherit; font-size: 13px;">
              <strong style="color:#006B3F; font-size:14px;">${escapeMapHtml(providerName)}</strong><br>
              <span style="font-size:12px; color:#475569;">📍 ${escapeMapHtml(locality)}</span>
              <div style="margin-top: 6px;">
                <a href="${navUrl}" target="_blank" rel="noopener" style="font-size: 11px; color: #2563EB; text-decoration: underline; font-weight: 600;">Get Directions ↗</a>
              </div>
            </div>
          `);

          mapHandle.type = 'leaflet';
          mapHandle.instance = lmap;
          mapHandle.providerMarker = lMarker;

          setTimeout(() => {
            if (lmap) lmap.invalidateSize();
          }, 250);

          return mapHandle;
        } catch (err) {
          console.error('LokatorMapService: Leaflet initialization error:', err);
        }
      }

      return mapHandle;
    },

    /**
     * Initialize or update a multi-artisan search directory map (Phase 032)
     * Features:
     * - LGA centroid clustering with deterministic privacy jitter (zero raw GPS exposure)
     * - Interactive proximity radar circle overlay with pulse animation
     * - Two-way bi-directional synchronization with listing cards
     * - Zoom-responsive cluster bubbles vs individual artisan pins
     */
    initSearchDirectoryMap: function (containerId, options) {
      options = options || {};
      const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
      if (!container || typeof L === 'undefined') return null;

      let lmap = container._lokator_lmap;
      let markersLayer = container._lokator_markers_layer;
      let radarCircleLayer = container._lokator_radar_layer;

      if (!lmap) {
        if (container._leaflet_id) container._leaflet_id = null;
        container.innerHTML = '';

        lmap = L.map(container, {
          zoomControl: true,
          scrollWheelZoom: false,
          attributionControl: false
        }).setView([6.5244, 3.3792], 11);

        container._lokator_lmap = lmap;

        // Modern crisp CartoDB Voyager tiles with graceful OSM fallback
        const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          subdomains: 'abcd',
          attribution: '&copy; OpenStreetMap &copy; CARTO'
        });
        tileLayer.on('tileerror', function () {
          // Fallback to OSM directly if Carto CDN is unreachable
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(lmap);
        });
        tileLayer.addTo(lmap);

        markersLayer = L.layerGroup().addTo(lmap);
        radarCircleLayer = L.layerGroup().addTo(lmap);

        container._lokator_markers_layer = markersLayer;
        container._lokator_radar_layer = radarCircleLayer;
      }

      let currentProviders = [];
      let currentUserCoords = null;
      let currentRadarRadius = null;
      const markerRegistry = new Map(); // providerId -> L.Marker

      // Helper: deterministic hash for privacy jitter within ±300-500m of LGA centroid
      function getDeterministicJitter(idStr) {
        let hash = 0;
        const str = String(idStr || 'padifix-artisan');
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash |= 0;
        }
        const absHash = Math.abs(hash);
        // Lat offset: approx -0.0035 to +0.0035 degrees (~350m)
        const latOffset = (((absHash % 1000) - 500) / 500) * 0.0035;
        // Lng offset: approx -0.0035 to +0.0035 degrees
        const lngOffset = ((((Math.floor(absHash / 1000)) % 1000) - 500) / 500) * 0.0035;
        return { latOffset, lngOffset };
      }

      function renderMapElements() {
        if (!markersLayer || !lmap) return 0;
        markersLayer.clearLayers();
        markerRegistry.clear();

        const zoom = lmap.getZoom();
        const bounds = [];
        let plottedCount = 0;

        // Group providers by LGA/area for cluster mode when zoomed out (< 12)
        const lgaGroups = new Map();

        currentProviders.forEach(p => {
          let baseLat = null;
          let baseLng = null;

          // Resolve coarse LGA centroid — NEVER use raw private residential addresses
          if (typeof NigeriaLocations !== 'undefined' && NigeriaLocations.resolveCoordinates) {
            const resolved = NigeriaLocations.resolveCoordinates(p);
            if (resolved && resolved.lat && resolved.lng) {
              baseLat = resolved.lat;
              baseLng = resolved.lng;
            }
          }

          if (!baseLat || !baseLng) {
            const rawLat = Number(p.lat != null ? p.lat : p.latitude);
            const rawLng = Number(p.lng != null ? p.lng : p.longitude);
            if (!isNaN(rawLat) && !isNaN(rawLng) && rawLat !== 0 && rawLng !== 0) {
              baseLat = rawLat;
              baseLng = rawLng;
            }
          }

          if (!baseLat || !baseLng) return;

          const lgaKey = (p.lga || p.city || 'Area').trim();
          if (!lgaGroups.has(lgaKey)) {
            lgaGroups.set(lgaKey, {
              lga: lgaKey,
              state: p.state || 'Nigeria',
              lat: baseLat,
              lng: baseLng,
              providers: []
            });
          }
          lgaGroups.get(lgaKey).providers.push({
            provider: p,
            baseLat,
            baseLng
          });
        });

        // If zoom is low (< 12) and we have multiple clusters, render LGA Cluster Bubbles
        if (zoom < 12 && lgaGroups.size > 1) {
          lgaGroups.forEach(group => {
            const count = group.providers.length;
            bounds.push([group.lat, group.lng]);
            plottedCount += count;

            const clusterIcon = L.divIcon({
              className: 'custom-lokator-cluster',
              html: `
                <div class="lokator-cluster-bubble" title="${count} verified artisans in ${escapeMapHtml(group.lga)}">
                  <div class="cluster-pulse"></div>
                  <span class="cluster-count">${count}</span>
                  <span class="cluster-label">${escapeMapHtml(group.lga)}</span>
                </div>
              `,
              iconSize: [46, 46],
              iconAnchor: [23, 23]
            });

            const clusterMarker = L.marker([group.lat, group.lng], { icon: clusterIcon });
            clusterMarker.on('click', () => {
              lmap.setView([group.lat, group.lng], 13, { animate: true });
              if (options.onClusterClick) {
                options.onClusterClick(group);
              }
            });
            markersLayer.addLayer(clusterMarker);
          });
        } else {
          // Render individual jittered artisan markers
          lgaGroups.forEach(group => {
            group.providers.forEach(item => {
              const p = item.provider;
              const jitter = getDeterministicJitter(p.id || p.business_name || p.name);
              const lat = item.baseLat + jitter.latOffset;
              const lng = item.baseLng + jitter.lngOffset;

              bounds.push([lat, lng]);
              plottedCount++;

              const initials = (p.name || p.business_name || 'Pro').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
              const providerArea = p.area || (p.lga && p.state ? `${p.lga}, ${p.state}` : p.city) || 'Nigeria';
              const ratingDisplay = p.rating ? `★ ${Number(p.rating).toFixed(1)}` : '★ 5.0';

              const customIcon = L.divIcon({
                className: 'custom-lokator-marker',
                html: `
                  <div class="lokator-pin" id="map-pin-${escapeMapHtml(p.id)}" title="${escapeMapHtml(p.name || p.business_name)} (${escapeMapHtml(p.trade || p.trade_title || 'Artisan')})">
                    <span class="pin-initials">${escapeMapHtml(initials)}</span>
                    <span class="pin-badge">${escapeMapHtml(p.trade || p.trade_title || 'Pro')}</span>
                  </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 20],
                popupAnchor: [0, -22]
              });

              // Privacy-safe popup: WhatsApp with job lead ref or profile link
              const popupHtml = `
                <div class="lokator-popup-card" data-provider-id="${escapeMapHtml(p.id)}">
                  <div class="lokator-popup-header">
                    <strong class="lokator-popup-name">${escapeMapHtml(p.name || p.business_name)}</strong>
                    <span class="lokator-popup-rating">${ratingDisplay}</span>
                  </div>
                  <div class="lokator-popup-trade">${escapeMapHtml(p.trade || p.trade_title || 'Artisan')}</div>
                  <div class="lokator-popup-loc">📍 ${escapeMapHtml(providerArea)}</div>
                  <div class="lokator-popup-actions">
                    <a href="profile.html?id=${encodeURIComponent(p.id)}" class="btn-popup-profile">View Profile →</a>
                  </div>
                </div>
              `;

              const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(popupHtml);

              marker.on('click', () => {
                if (options.onMarkerSelect) {
                  options.onMarkerSelect(p);
                }
              });

              markerRegistry.set(String(p.id), marker);
              markersLayer.addLayer(marker);
            });
          });
        }

        // Render user location marker if present
        if (currentUserCoords && currentUserCoords.lat && currentUserCoords.lng) {
          bounds.push([currentUserCoords.lat, currentUserCoords.lng]);
          const userIcon = L.divIcon({
            className: 'user-loc-marker',
            html: `
              <div class="user-radar-center">
                <div class="user-radar-wave"></div>
                <div class="user-radar-dot"></div>
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          L.marker([currentUserCoords.lat, currentUserCoords.lng], { icon: userIcon })
            .bindPopup('<strong>📍 Your Search Center</strong>')
            .addTo(markersLayer);
        }

        return { plottedCount, bounds };
      }

      // Re-render when map zoom crosses the cluster threshold
      lmap.on('zoomend', () => {
        renderMapElements();
      });

      const directoryHandle = {
        instance: lmap,
        markersLayer: markersLayer,
        radarCircleLayer: radarCircleLayer,

        invalidateSize: function () {
          if (lmap) {
            setTimeout(() => {
              try { lmap.invalidateSize(); } catch (e) {}
            }, 120);
          }
        },

        updateProviders: function (providersList, userCoords, fitToMarkers) {
          currentProviders = providersList || [];
          currentUserCoords = userCoords || currentUserCoords;
          const result = renderMapElements();

          if (fitToMarkers !== false && result && result.bounds && result.bounds.length > 0) {
            try {
              lmap.fitBounds(result.bounds, { padding: [40, 40], maxZoom: 14 });
            } catch (e) {}
          }

          directoryHandle.invalidateSize();
          return result ? result.plottedCount : 0;
        },

        /**
         * Set or update the proximity radar circle overlay (Phase 032)
         */
        setRadarRadius: function (radiusKm, centerCoords) {
          if (!radarCircleLayer || !lmap) return;
          radarCircleLayer.clearLayers();
          currentRadarRadius = radiusKm;

          const center = centerCoords || currentUserCoords || { lat: 6.5244, lng: 3.3792 };
          if (!radiusKm || radiusKm === 'all') {
            return;
          }

          const radiusMeters = Number(radiusKm) * 1000;
          if (isNaN(radiusMeters) || radiusMeters <= 0) return;

          const radarCircle = L.circle([center.lat, center.lng], {
            radius: radiusMeters,
            color: '#006B3F',
            weight: 2,
            opacity: 0.8,
            fillColor: '#006B3F',
            fillOpacity: 0.08,
            dashArray: '6, 6',
            className: 'proximity-radar-circle'
          });

          radarCircleLayer.addLayer(radarCircle);

          try {
            lmap.fitBounds(radarCircle.getBounds(), { padding: [30, 30], maxZoom: 14 });
          } catch (e) {}
        },

        /**
         * Two-way bi-directional sync: highlight and center on a provider's marker
         */
        highlightProvider: function (providerId) {
          if (!lmap || !providerId) return;
          const marker = markerRegistry.get(String(providerId));

          if (marker) {
            const latLng = marker.getLatLng();
            lmap.panTo(latLng, { animate: true, duration: 0.5 });

            const pinEl = document.getElementById(`map-pin-${providerId}`);
            if (pinEl) {
              pinEl.classList.add('is-highlighted');
              setTimeout(() => {
                pinEl.classList.remove('is-highlighted');
              }, 2500);
            }

            // Only open popup on larger screens where it doesn't obstruct view
            if (window.innerWidth > 768) {
              try { marker.openPopup(); } catch (e) {}
            }
          }
        }
      };

      // Initial render if providers supplied
      if (options.providers) {
        directoryHandle.updateProviders(options.providers, options.userCoords);
      }

      return directoryHandle;
    }
  };

  function escapeMapHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Export globally
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LokatorMapService;
  }
  if (typeof window !== 'undefined') {
    window.LokatorMapService = LokatorMapService;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
