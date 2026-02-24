
/*
  Japan Roadmap Planner — Google Maps (optional) + OpenStreetMap fallback
  - If API key is provided, uses Google Maps JS API for highest map detail and accurate routing.
  - If no key, uses Leaflet OpenStreetMap + OSRM routing (visual).
  - Share link: encodes trip into URL hash (no server).
*/
let state = { tripName:"", travelMode:"TRANSIT", days:[], selectedDay:null, stops:{} };
const LS_STATE = "jp_planner_state_v1";
const LS_KEY = "jp_planner_gm_key_v1";

const el = (id)=>document.getElementById(id);
const dayPills = el("dayPills");
const entriesEl = el("entries");
const statusEl = el("status");
const detailsEl = el("details");
const timelineEl = el("timeline");
let filters = { sleep:true, food:true, activity:true, move:true };
let gPlaces = null; // google.maps.places.PlacesService


function save(){ localStorage.setItem(LS_STATE, JSON.stringify(state)); }
function load(){
  // If hash has data, use that first (share link)
  const h = (location.hash||"").replace(/^#/, "");
  if(h){
    try{
      state = decodeShare(h);
      return;
    }catch(e){}
  }
  try{
    const raw = localStorage.getItem(LS_STATE);
    if(raw) state = JSON.parse(raw);
  }catch(e){}
}
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

function iconFor(cat){
  if(cat==="sleep") return "🛏️";
  if(cat==="food") return "🍜";
  if(cat==="activity") return "🎌";
  return "🚆";
}

function googleMarkerIcon(cat){
  // simple SVG pin with category color
  const color = (cat==="sleep") ? "#7E57C2" : (cat==="food") ? "#ff7043" : (cat==="activity") ? "#26a69a" : "#42a5f5";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
      <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5" fill="white"/>
    </svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(34,34),
    anchor: new google.maps.Point(17,34),
    labelOrigin: new google.maps.Point(17,12)
  };
}

function labelFor(cat){
  if(cat==="sleep") return "Sleep/Hotel";
  if(cat==="food") return "Foodspot";
  if(cat==="activity") return "Activity";
  return "Move";
}

function showDetailsBasic(stop, idx){
  if(!detailsEl) return;
  detailsEl.style.display = "block";
  const timeStr = (stop.startTime||stop.endTime) ? `${stop.startTime||""}${stop.endTime?("–"+stop.endTime):""}` : "—";
  detailsEl.innerHTML = `
    <div class="detailsTitle">${idx}. ${esc(stop.place)}</div>
    <div class="detailsSub">${labelFor(stop.category)} · ${timeStr}</div>
    ${stop.notes ? `<div class="detailsSub" style="margin-top:8px;color:rgba(17,24,39,.85)">${esc(stop.notes)}</div>` : ""}
  `;
}

function showGooglePlaceDetails(stop, idx){
  if(!(provider==="google" && gPlaces && stop.placeId)) { showDetailsBasic(stop, idx); return; }
  showDetailsBasic(stop, idx);
  gPlaces.getDetails({
    placeId: stop.placeId,
    fields: ["name","formatted_address","rating","user_ratings_total","website","opening_hours","photos","url"]
  }, (p, status)=>{
    if(status !== "OK" || !p) return;
    const rating = p.rating ? `⭐ ${p.rating} (${p.user_ratings_total||0})` : "";
    const hours = (p.opening_hours && p.opening_hours.weekday_text) ? p.opening_hours.weekday_text.join("<br/>") : "";
    const website = p.website ? `<a href="${p.website}" target="_blank" rel="noopener">Website</a>` : "";
    const gurl = p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Open in Google</a>` : "";
    const photos = (p.photos||[]).slice(0,6).map(ph=>{
      const u = ph.getUrl({maxWidth: 320, maxHeight: 220});
      return `<img src="${u}" alt="photo"/>`;
    }).join("");
    const photosHtml = photos ? `<div class="photoRow">${photos}</div>` : "";

    detailsEl.innerHTML = `
      <div class="detailsTitle">${idx}. ${esc(p.name || stop.place)}</div>
      <div class="detailsSub">${esc(p.formatted_address || "")}</div>
      <div class="detailsSub" style="margin-top:6px;">${rating} ${website} ${gurl}</div>
      ${stop.notes ? `<div class="detailsSub" style="margin-top:8px;color:rgba(17,24,39,.85)">${esc(stop.notes)}</div>` : ""}
      ${hours ? `<div class="detailsSub" style="margin-top:10px;"><b>Opening hours</b><br/>${hours}</div>` : ""}
      ${photosHtml}
    `;
  });
}

function esc(s){ return (s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ------------ Share encoding in URL hash (base64url) ------------ */
function encodeShare(obj){
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
function decodeShare(hash){
  const b64 = hash.replaceAll('-','+').replaceAll('_','/');
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const json = decodeURIComponent(escape(atob(padded)));
  return JSON.parse(json);
}
function makeShareLink(){
  const encoded = encodeShare(state);
  const url = location.origin + location.pathname + "#" + encoded;
  navigator.clipboard?.writeText(url);
  alert("Share link copied (or shown in address bar):\n\n" + url);
}

/* ------------ Google Maps key handling ------------ */
function saveKey(){
  const k = el("gmKey").value.trim();
  if(!k) { localStorage.removeItem(LS_KEY); alert("Key cleared."); initMap(); return; }
  localStorage.setItem(LS_KEY, k);
  alert("Saved. Reloading map using Google Maps.");
  initMap();
}
function getKey(){ return (localStorage.getItem(LS_KEY) || "").trim(); }
function openKeyHelp(){
  window.open("https://developers.google.com/maps/documentation/javascript/get-api-key", "_blank");
}
window.openKeyHelp = openKeyHelp;
window.saveKey = saveKey;

/* ------------ UI: days & stops ------------ */
function renderDays(){
  dayPills.innerHTML = "";
  if(!state.days.length){
    statusEl.textContent = "Add a day to start planning.";
    return;
  }
  state.days.forEach(d=>{
    const pill = document.createElement("div");
    pill.className = "pill" + (state.selectedDay===d ? " active" : "");
    pill.textContent = d;
    pill.onclick = ()=>selectDay(d);
    dayPills.appendChild(pill);
  });
}

function addDay(){
  const d = el("newDay").value;
  if(!d) return alert("Pick a day first.");
  if(!state.days.includes(d)) state.days.push(d);
  state.days.sort();
  if(!state.stops[d]) state.stops[d] = [];
  state.selectedDay = d;
  renderDays(); renderStops(); renderTimeline(); refreshRoute(); save();
}
window.addDay = addDay;

function selectDay(d){
  state.selectedDay = d;
  renderDays(); renderStops(); renderTimeline(); refreshRoute(); save();
}

function renderStops(){
  entriesEl.innerHTML = "";
  if(!state.selectedDay){
    entriesEl.innerHTML = '<div class="muted">Select a day to see stops.</div>';
    return;
  }
  let arr = state.stops[state.selectedDay] || [];
  arr = arr.filter(s=>filters[s.category] !== false);
  if(!arr.length){
    entriesEl.innerHTML = '<div class="muted">No stops yet. Add hotel, foodspots and activities.</div>';
    return;
  }

  arr.forEach((s, idx)=>{
    const div = document.createElement("div");
    div.className = "entry " + s.category;
    const timeStr = (s.startTime||s.endTime) ? `${s.startTime||""}${s.endTime?("–"+s.endTime):""}` : "—";
    div.innerHTML = `
      <div class="icon">${iconFor(s.category)}</div>
      <div class="meta">
        <div class="title">${idx+1}. ${esc(s.place)}</div>
        <div class="sub">${state.selectedDay} · ${labelFor(s.category)} · ${timeStr}</div>
        ${s.notes ? `<div class="sub" style="margin-top:6px;color:rgba(17,24,39,.85)">${esc(s.notes)}</div>` : ""}
      </div>
      <div class="actions">
        <button class="btn secondary" onclick="focusStop('${s.id}')">Map</button>
        <button class="btn secondary" onclick="openStop('${s.id}')">Maps</button>
        <button class="btn danger" onclick="deleteStop('${s.id}')">Delete</button>
      </div>
    `;
    entriesEl.appendChild(div);
  });

  // drag reorder
  if(window.Sortable){
    Sortable.create(entriesEl, {
      animation: 160,
      onEnd: function(evt){
        let arr = state.stops[state.selectedDay] || [];
  arr = arr.filter(s=>filters[s.category] !== false);
        const moved = arr.splice(evt.oldIndex, 1)[0];
        arr.splice(evt.newIndex, 0, moved);
        state.stops[state.selectedDay] = arr;
        renderStops(); renderTimeline(); refreshRoute(); save();
      }
    });
  }
}

async function addStop(){
  if(!state.selectedDay) return alert("Add/select a day first.");
  const stop = {
    id: uid(),
    category: el("category").value,
    startTime: el("startTime").value,
    endTime: el("endTime").value,
    place: el("place").value.trim(),
    notes: el("notes").value.trim()
  };
  if(!stop.place) return alert("Please enter a place/address.");

  statusEl.textContent = "Geocoding…";
  // If user picked from Google Places Autocomplete, use exact coordinates + formatted address
  if(provider==="google" && lastPicked && (el("place").value.trim() === "" || stop.place === lastPicked.description || stop.place === el("place").value.trim())){
    stop.lat = lastPicked.lat;
    stop.lng = lastPicked.lng;
    stop.placeId = lastPicked.placeId;
    // Ensure place string is the full accurate one
    stop.place = (lastPicked.name && lastPicked.formatted_address) ? `${lastPicked.name}, ${lastPicked.formatted_address}` : (stop.place || lastPicked.description);
    lastPicked = null;
  }else{
    const coords = await geocode(stop.place);
    if(!coords){
    statusEl.textContent = "Not found. Try adding city (e.g., 'X, Tokyo').";
    return alert("Place not found.");
  }
    stop.lat = coords.lat; stop.lng = coords.lng;
  }

  state.stops[state.selectedDay].push(stop);
  el("place").value = ""; el("notes").value = "";

  renderStops(); renderTimeline(); refreshRoute(); save();
}
window.addStop = addStop;

function deleteStop(id){
  let arr = state.stops[state.selectedDay] || [];
  arr = arr.filter(s=>filters[s.category] !== false);
  state.stops[state.selectedDay] = arr.filter(s=>s.id!==id);
  renderStops(); renderTimeline(); refreshRoute(); save();
}
window.deleteStop = deleteStop;

function openStop(id){
  let arr = state.stops[state.selectedDay] || [];
  arr = arr.filter(s=>filters[s.category] !== false);
  const s = arr.find(x=>x.id===id);
  if(!s) return;
  window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(s.place), "_blank");
}
window.openStop = openStop;

function focusStop(id){
  let arr = state.stops[state.selectedDay] || [];
  arr = arr.filter(s=>filters[s.category] !== false);
  const s = arr.find(x=>x.id===id);
  if(!s) return;
  if(provider==="google" && gmap){
    gmap.setZoom(15);
    gmap.panTo({lat:s.lat, lng:s.lng});
  }else if(provider==="leaflet" && lmap){
    lmap.setView([s.lat, s.lng], 14);
  }
}
window.focusStop = focusStop;

function openDayRoute(){
  if(!state.selectedDay) return alert("Select a day first.");
  let arr = state.stops[state.selectedDay] || [];
  arr = arr.filter(s=>filters[s.category] !== false);
  if(arr.length < 2) return alert("Add at least 2 stops to open a route.");
  const origin = encodeURIComponent(arr[0].place);
  const destination = encodeURIComponent(arr[arr.length-1].place);
  const waypoints = encodeURIComponent(arr.slice(1,-1).map(s=>s.place).join("|"));
  const mode = (state.travelMode||"TRANSIT").toLowerCase();
  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=${mode}`;
  window.open(url, "_blank");
}
window.openDayRoute = openDayRoute;

/* ------------ Export / Import ------------ */
function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (state.tripName || "japan-trip") + ".json";
  a.click();
}
window.exportJSON = exportJSON;

function importJSON(){
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = e => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(reader.result);
        if(!obj || !obj.days || !obj.stops) throw new Error("Invalid");
        state = obj;
        hydrateUI();
        save();
        refreshRoute();
      }catch(err){
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
window.importJSON = importJSON;

function resetAll(){
  if(!confirm("Reset everything?")) return;
  localStorage.removeItem(LS_STATE);
  location.hash = "";
  state = { tripName:"", travelMode:"TRANSIT", days:[], selectedDay:null, stops:{} };
  hydrateUI();
  clearMapLayers();
  statusEl.textContent = "Add a day to start planning.";
}

function toggleFilter(cat){
  filters[cat] = !filters[cat];
  const chip = document.querySelector(`.chip[data-cat="${cat}"]`);
  if(chip){ chip.classList.toggle("on", filters[cat]); }
  renderStops();
  refreshRoute();
  renderTimeline();
  save();
}
window.toggleFilter = toggleFilter;

window.resetAll = resetAll;

/* ------------ Map providers ------------ */
let provider = "leaflet"; // or "google"
let gmap = null, gMarkers = [], gDirections = null, gGeocoder = null;
let lmap = null, lMarkersLayer = null, lRouteLayer = null;

/* ---- Google Maps loader ---- */
function loadGoogleScript(key){
  return new Promise((resolve, reject)=>{
    if(window.google && window.google.maps){ resolve(); return; }
    const s = document.createElement("script");
    // language=en for English UI; region=JP helps Japan context.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=en&region=JP`;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ---- Leaflet init ---- */
function initLeaflet(){
  provider = "leaflet";
  // clear map div
  el("map").innerHTML = "";
  lmap = L.map("map", { zoomControl:true }).setView([35.6762, 139.6503], 6);
  // English-ish basemap (CARTO Voyager)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(lmap);
  lMarkersLayer = L.layerGroup().addTo(lmap);
}

/* ---- Google init ---- */

/* ---- Places Autocomplete ---- */
let gAutocomplete = null;
let lastPicked = null; // { placeId, description, lat, lng, formatted_address, name }

function initAutocomplete(){
  if(!(provider==="google" && window.google && google.maps && el("place"))) return;
  try{
    gAutocomplete = new google.maps.places.Autocomplete(el("place"), {
      fields: ["place_id","geometry","formatted_address","name"],
      componentRestrictions: { country: "jp" }
    });
    gAutocomplete.addListener("place_changed", ()=>{
      const p = gAutocomplete.getPlace();
      if(!p || !p.geometry) return;
      lastPicked = {
        placeId: p.place_id || null,
        name: p.name || "",
        formatted_address: p.formatted_address || "",
        lat: p.geometry.location.lat(),
        lng: p.geometry.location.lng(),
        description: (p.name ? p.name : el("place").value) + (p.formatted_address ? (", " + p.formatted_address) : "")
      };
      // Make input show the full formatted string for accuracy
      if(lastPicked.name && lastPicked.formatted_address){
        el("place").value = `${lastPicked.name}, ${lastPicked.formatted_address}`;
      }
    });
  }catch(e){
    console.warn("Autocomplete init failed", e);
  }
}

function initGoogle(){
  provider = "google";
  el("map").innerHTML = "";
  gmap = new google.maps.Map(el("map"), {
    center: {lat:35.6762, lng:139.6503},
    zoom: 6,
    mapTypeControl: false,
    fullscreenControl: true,
    streetViewControl: false
  });
  gGeocoder = new google.maps.Geocoder();
  gDirections = new google.maps.DirectionsRenderer({ suppressMarkers: true });
  gDirections.setMap(gmap);
  gPlaces = new google.maps.places.PlacesService(gmap);
}

function clearMapLayers(){
  if(provider==="google"){
    gMarkers.forEach(m=>m.setMap(null));
    gMarkers = [];
    if(gDirections) gDirections.setDirections({routes:[]});
  }else if(provider==="leaflet"){
    if(lMarkersLayer) lMarkersLayer.clearLayers();
    if(lRouteLayer){ lmap.removeLayer(lRouteLayer); lRouteLayer = null; }
  }
}

/* ---- Geocoding ---- */
async function geocode(q){
  if(provider==="google" && gGeocoder){
    return new Promise((resolve)=>{
      gGeocoder.geocode({ address: q, region:"JP" }, (results, status)=>{
        if(status === "OK" && results && results[0]){
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        }else resolve(null);
      });
    });
  }
  // Leaflet fallback: Nominatim
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en&q=" + encodeURIComponent(q);
  const res = await fetch(url, { headers: { "Accept":"application/json" } });
  const data = await res.json();
  if(!data || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

/* ---- Route drawing ---- */
async function refreshRoute(){
  clearMapLayers();

  if(!state.selectedDay){
    statusEl.textContent = "Select a day to draw the route.";
    return;
  }
  let arr = state.stops[state.selectedDay] || [];
  arr = arr.filter(s=>filters[s.category] !== false);
  if(!arr.length){
    statusEl.textContent = "No stops yet for this day.";
    return;
  }

  // markers
  if(provider==="google" && gmap){
    arr.forEach((s, i)=>{
      const marker = new google.maps.Marker({
        map: gmap,
        position: {lat:s.lat, lng:s.lng},
        icon: googleMarkerIcon(s.category),
        label: { text: String(i+1), color: "#111827", fontWeight:"900" }
      });
      const info = new google.maps.InfoWindow({ content: `<b>${i+1}. ${esc(s.place)}</b><br/>${labelFor(s.category)}` });
      marker.addListener("click", ()=>{ info.open({map:gmap, anchor:marker}); showGooglePlaceDetails(s, i+1); });
      gMarkers.push(marker);
    });
    if(arr.length === 1){
      gmap.setZoom(12);
      gmap.panTo({lat:arr[0].lat, lng:arr[0].lng});
      statusEl.textContent = "Add at least 2 stops to build a route.";
      return;
    }
    // Google Directions
    const waypoints = arr.slice(1,-1).map(s=>({ location: {lat:s.lat, lng:s.lng}, stopover:true }));
    const req = {
      origin: {lat:arr[0].lat, lng:arr[0].lng},
      destination: {lat:arr[arr.length-1].lat, lng:arr[arr.length-1].lng},
      waypoints,
      travelMode: google.maps.TravelMode[state.travelMode] || google.maps.TravelMode.TRANSIT,
      optimizeWaypoints: false
    };
    const service = new google.maps.DirectionsService();
    statusEl.textContent = "Building route (Google)…";
    service.route(req, (result, status)=>{
      if(status === "OK"){
        gDirections.setDirections(result);
        // Fit bounds
        const bounds = new google.maps.LatLngBounds();
        arr.forEach(s=>bounds.extend({lat:s.lat, lng:s.lng}));
        gmap.fitBounds(bounds, 60);
        statusEl.textContent = "Route ready (Google Maps).";
      }else{
        statusEl.textContent = "Could not build Google route. Try changing travel mode or places.";
      }
    });
    return;
  }

  // Leaflet + OSRM
  if(provider==="leaflet" && lmap){
    arr.forEach((s, i)=>{
      lMarkersLayer.addLayer(
        L.marker([s.lat, s.lng]).on('click', ()=>showDetailsBasic(s, i+1)).bindPopup(`<b>${i+1}. ${esc(s.place)}</b><br/>${labelFor(s.category)}`)
      );
    });
    if(arr.length === 1){
      lmap.setView([arr[0].lat, arr[0].lng], 12);
      statusEl.textContent = "Add at least 2 stops to build a route.";
      return;
    }
    const coords = arr.map(s=>`${s.lng},${s.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    statusEl.textContent = "Building route (OSM)…";
    try{
      const res = await fetch(url);
      const data = await res.json();
      if(!data.routes || !data.routes.length){
        statusEl.textContent = "Could not build route. Try fewer stops or more specific places.";
        return;
      }
      lRouteLayer = L.geoJSON(data.routes[0].geometry, { style: { color:"#2563eb", weight:5, opacity:.9 } }).addTo(lmap);
      const bounds = L.latLngBounds(arr.map(s=>[s.lat, s.lng]));
      lmap.fitBounds(bounds.pad(0.22));
      statusEl.textContent = "Route ready (OpenStreetMap).";
    }catch(e){
      statusEl.textContent = "Route error.";
    }
  }
}


function renderTimeline(){
  if(!timelineEl) return;
  timelineEl.innerHTML = "";
  const times = ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];
  const timeCol = document.createElement("div");
  timeCol.className = "timeCol";
  times.forEach(t=>{
    const d = document.createElement("div");
    d.className = "timeSlot";
    d.textContent = t;
    timeCol.appendChild(d);
  });
  const blocksCol = document.createElement("div");
  blocksCol.className = "blocksCol";

  if(!state.selectedDay){
    blocksCol.innerHTML = '<div class="muted">Select a day to see the timeline.</div>';
    timelineEl.appendChild(timeCol);
    timelineEl.appendChild(blocksCol);
    return;
  }

  let arr = (state.stops[state.selectedDay] || []).filter(s=>filters[s.category] !== false);
  if(!arr.length){
    blocksCol.innerHTML = '<div class="muted">No stops yet for this day.</div>';
    timelineEl.appendChild(timeCol);
    timelineEl.appendChild(blocksCol);
    return;
  }

  // Sort by startTime if exists, else keep current order
  const anyTime = arr.some(s=>s.startTime);
  if(anyTime){
    arr = [...arr].sort((a,b)=>(a.startTime||"99:99").localeCompare(b.startTime||"99:99"));
  }

  arr.forEach((s, idx)=>{
    const timeStr = (s.startTime||s.endTime) ? `${s.startTime||""}${s.endTime?("–"+s.endTime):""}` : "—";
    const div = document.createElement("div");
    div.className = "block " + s.category;
    div.innerHTML = `
      <div class="bTitle">${idx+1}. ${esc(s.place)}</div>
      <div class="bMeta">${labelFor(s.category)} · ${timeStr}</div>
      ${s.notes ? `<div class="bMeta" style="margin-top:6px;color:rgba(17,24,39,.85)">${esc(s.notes)}</div>` : ""}
    `;
    blocksCol.appendChild(div);
  });

  timelineEl.appendChild(timeCol);
  timelineEl.appendChild(blocksCol);
}

/* ------------ Init map based on key ------------ */
async function initMap(){
  const key = getKey();
  el("gmKey").value = key;
  // show/hide notice
  el("keyNotice").style.display = key ? "none" : "block";

  if(key){
    try{
      await loadGoogleScript(key);
      initGoogle();
      initAutocomplete();
      hydrateUI();
      refreshRoute();
      return;
    }catch(e){
      console.warn("Google Maps failed, falling back to Leaflet", e);
    }
  }
  initLeaflet();
  hydrateUI();
  refreshRoute();
}

function hydrateUI(){
  el("tripName").value = state.tripName || "";
  el("travelMode").value = state.travelMode || "TRANSIT";
  renderDays();
  renderStops();
  renderTimeline();
}

el("tripName").addEventListener("input", (e)=>{ state.tripName = e.target.value; save(); });
el("travelMode").addEventListener("change", (e)=>{ state.travelMode = e.target.value; save(); refreshRoute(); });

// Expose
window.makeShareLink = makeShareLink;
window.openDayRoute = openDayRoute;
window.exportJSON = exportJSON;
window.importJSON = importJSON;
window.resetAll = resetAll;

// Start
load();
initMap();
