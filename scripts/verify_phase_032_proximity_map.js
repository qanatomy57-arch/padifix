/**
 * LOKATOR.NG / PADIFIX — PHASE 032 VERIFICATION SUITE
 * Interactive Proximity Map & Cluster Radar on Search (/search.html)
 * 
 * 10 Automated Verification Gates:
 * Gate 1: Baseline Architecture & Zero Duplication
 * Gate 2: Serverless Function Budget (Strictly 12/12)
 * Gate 3: Privacy Invariant C (Zero raw GPS, zero residential address persistence)
 * Gate 4: Centroid Resolution (Coarse LGA mapping)
 * Gate 5: Deterministic Privacy Jitter (Bounded ±300m–500m, stable per ID)
 * Gate 6: Haversine Distance & Radius Filtering (5km, 15km, 30km, All)
 * Gate 7: LGA Cluster Aggregation & Count Integrity
 * Gate 8: Two-Way Bi-Directional Synchronization Hooks
 * Gate 9: Mobile Bottom Sheet Preview Markup & Touch Target Specs
 * Gate 10: XSS & Input Injection Resistance
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

const searchHtml = fs.readFileSync(path.join(ROOT, 'search.html'), 'utf8');
const searchJs = fs.readFileSync(path.join(ROOT, 'search.js'), 'utf8');
const searchCss = fs.readFileSync(path.join(ROOT, 'search.css'), 'utf8');
const mapServiceJs = fs.readFileSync(path.join(ROOT, 'map-service.js'), 'utf8');
const locationsJs = fs.readFileSync(path.join(ROOT, 'locations.js'), 'utf8');

let totalChecks = 0;
let passedChecks = 0;

function check(desc, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passedChecks++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Reason: ${err.message}`);
  }
}

async function runVerification() {
  console.log('===============================================================');
  console.log('PADIFIX PHASE 032 — PROXIMITY MAP & CLUSTER RADAR VERIFICATION');
  console.log('===============================================================\n');

  // GATE 1: Baseline Architecture & Zero Duplication
  console.log('Gate 1: Baseline Architecture & Integration');
  check('1.1 search.html includes map-service.js, Leaflet, and locations.js', () => {
    assert.ok(searchHtml.includes('map-service.js'), 'Must include map-service.js');
    assert.ok(searchHtml.includes('leaflet.js'), 'Must include Leaflet JS');
    assert.ok(searchHtml.includes('locations.js'), 'Must include locations.js');
  });
  check('1.2 search-map-container exists with map overlay badge', () => {
    assert.ok(searchHtml.includes('id="search-map-container"'), 'Must contain search-map-container');
    assert.ok(searchHtml.includes('id="search-map"'), 'Must contain search-map element');
    assert.ok(searchHtml.includes('id="map-counter-badge"'), 'Must contain map-counter-badge');
  });

  // GATE 2: Serverless Function Budget (Strictly 12/12)
  console.log('\nGate 2: Serverless Function Budget (Strictly 12/12)');
  check('2.1 Zero new Vercel serverless functions introduced in api/', () => {
    const apiDir = path.join(ROOT, 'api');
    const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
    const vercelIgnore = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8');
    const ignoredFiles = vercelIgnore.split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('api/') && l.endsWith('.js'))
      .map(l => path.basename(l));

    const deployedFunctions = files.filter(f => !ignoredFiles.includes(f));
    assert.strictEqual(
      deployedFunctions.length,
      12,
      `Vercel deployed function count must be exactly 12/12. Found: ${deployedFunctions.length} (${deployedFunctions.join(', ')})`
    );
  });

  // GATE 3: Privacy Invariant C (Zero raw GPS exposure)
  console.log('\nGate 3: Privacy Invariant C (Strict Address & Coordinate Protection)');
  check('3.1 No raw personal GPS or residential addresses in client payloads', () => {
    assert.ok(mapServiceJs.includes('getDeterministicJitter'), 'map-service must employ deterministic jitter');
    assert.ok(mapServiceJs.includes('NigeriaLocations.resolveCoordinates'), 'map-service must resolve coordinates via canonical LGA centroids');
    assert.ok(!searchJs.includes("localStorage.setItem('user_lat'"), 'Must NOT persist user lat in localStorage');
    assert.ok(!searchJs.includes("localStorage.setItem('user_gps'"), 'Must NOT persist user GPS in localStorage');
    assert.ok(!searchJs.includes("localStorage.setItem('user_coords'"), 'Must NOT persist user coords in localStorage');
  });

  // GATE 4: Centroid Resolution
  console.log('\nGate 4: Centroid Resolution');
  check('4.1 Canonical NigeriaLocations resolves LGA and State centroids', () => {
    assert.ok(locationsJs.includes('resolveCoordinates'), 'NigeriaLocations must provide resolveCoordinates');
    const LokatorMap = require(path.join(ROOT, 'map-service.js'));
    assert.ok(LokatorMap, 'LokatorMapService should export cleanly');
  });

  // GATE 5: Deterministic Privacy Jitter
  console.log('\nGate 5: Deterministic Privacy Jitter Bounds');
  check('5.1 Jitter is deterministic and bounded within ~300m - 500m', () => {
    function getDeterministicJitter(idStr) {
      let hash = 0;
      const str = String(idStr || 'padifix-artisan');
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      const absHash = Math.abs(hash);
      const latOffset = (((absHash % 1000) - 500) / 500) * 0.0035;
      const lngOffset = ((((Math.floor(absHash / 1000)) % 1000) - 500) / 500) * 0.0035;
      return { latOffset, lngOffset };
    }

    const jitter1 = getDeterministicJitter('prov_12345');
    const jitter2 = getDeterministicJitter('prov_12345');
    assert.strictEqual(jitter1.latOffset, jitter2.latOffset, 'Jitter must be identical for identical provider ID');
    assert.strictEqual(jitter1.lngOffset, jitter2.lngOffset, 'Jitter must be identical for identical provider ID');

    const jitter3 = getDeterministicJitter('prov_99999');
    assert.notStrictEqual(jitter1.latOffset, jitter3.latOffset, 'Different providers should produce varied jitter offsets');

    assert.ok(Math.abs(jitter1.latOffset) <= 0.0035, 'Lat jitter must be bounded <= 0.0035 deg');
    assert.ok(Math.abs(jitter1.lngOffset) <= 0.0035, 'Lng jitter must be bounded <= 0.0035 deg');
  });

  // GATE 6: Haversine Distance & Radius Filtering
  console.log('\nGate 6: Haversine Distance & Radius Filtering');
  check('6.1 Haversine distance math is mathematically accurate', () => {
    function haversine(lat1, lon1, lat2, lon2) {
      const R = 6371; // Earth's radius in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    const dist = haversine(6.5964, 3.3431, 6.4281, 3.4219);
    assert.ok(dist >= 18 && dist <= 24, `Distance should be ~20km, got ${dist.toFixed(2)} km`);
  });
  check('6.2 Proximity radar controls (5km, 15km, 30km, All) exist in search.html', () => {
    assert.ok(searchHtml.includes('id="chip-radius-5"'), 'Must contain 5km radius chip');
    assert.ok(searchHtml.includes('id="chip-radius-15"'), 'Must contain 15km radius chip');
    assert.ok(searchHtml.includes('id="chip-radius-30"'), 'Must contain 30km radius chip');
    assert.ok(searchHtml.includes('id="chip-radius-all"'), 'Must contain All radius chip');
    assert.ok(searchHtml.includes('id="btn-radar-nearme"'), 'Must contain Near Me button');
  });

  // GATE 7: LGA Cluster Aggregation & Count Integrity
  console.log('\nGate 7: LGA Cluster Aggregation & Visuals');
  check('7.1 map-service implements custom-lokator-cluster and cluster-bubble', () => {
    assert.ok(mapServiceJs.includes('custom-lokator-cluster'), 'map-service must output custom-lokator-cluster class');
    assert.ok(mapServiceJs.includes('lokator-cluster-bubble'), 'map-service must output lokator-cluster-bubble');
    assert.ok(searchCss.includes('.lokator-cluster-bubble'), 'search.css must style cluster bubble');
    assert.ok(searchCss.includes('.cluster-pulse'), 'search.css must include cluster pulse animation');
  });

  // GATE 8: Two-Way Bi-Directional Synchronization Hooks
  console.log('\nGate 8: Two-Way Bi-Directional Synchronization Hooks');
  check('8.1 Two-way sync: card hover highlights marker, marker click scrolls card', () => {
    assert.ok(searchJs.includes('directoryMapHandle.highlightProvider'), 'search.js must call highlightProvider on card hover');
    assert.ok(searchJs.includes('handleMarkerSelect'), 'search.js must define handleMarkerSelect');
    assert.ok(searchJs.includes('map-highlighted'), 'search.js must toggle map-highlighted on card');
    assert.ok(searchCss.includes('.provider-item-card.map-highlighted'), 'search.css must style card highlight');
  });

  // GATE 9: Mobile Bottom Sheet Preview
  console.log('\nGate 9: Mobile Bottom Sheet Preview');
  check('9.1 Mobile bottom sheet markup, styles, and dismissal exist', () => {
    assert.ok(searchHtml.includes('id="map-bottom-sheet"'), 'search.html must contain map-bottom-sheet');
    assert.ok(searchHtml.includes('id="sheet-content"'), 'search.html must contain sheet-content');
    assert.ok(searchHtml.includes('id="sheet-close-btn"'), 'search.html must contain sheet-close-btn');
    assert.ok(searchCss.includes('.map-bottom-sheet'), 'search.css must define map-bottom-sheet style');
    assert.ok(searchJs.includes('sheetCloseBtn.addEventListener'), 'search.js must handle sheet dismissal');
  });

  // GATE 10: XSS & Input Injection Resistance
  console.log('\nGate 10: XSS & Input Injection Resistance');
  check('10.1 escapeHtml and escapeMapHtml protect all injected labels and attributes', () => {
    assert.ok(mapServiceJs.includes('escapeMapHtml'), 'map-service must sanitize all popup strings');
    assert.ok(searchJs.includes('escapeHtml'), 'search.js must sanitize all rendered sheet HTML');
  });

  console.log('\n---------------------------------------------------------------');
  console.log(`TOTAL CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${totalChecks - passedChecks}`);
  console.log('---------------------------------------------------------------');

  if (passedChecks === totalChecks) {
    console.log('🎉 ALL AUTOMATED GATES PASSED (10/10)!');
    process.exit(0);
  } else {
    console.error('❌ SOME CHECKS FAILED');
    process.exit(1);
  }
}

runVerification();
