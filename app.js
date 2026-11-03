/*
 * RideVault frontend
 * Set API_URL to your deployed Apps Script Web App URL ending in /exec.
 */
const API_URL = "https://script.google.com/macros/s/AKfycbwOtreRYnaLgtqLfOrSEmDOCOLr59y85B8eeTt-7hMEAcDtqdyZu0SRVCAxUEFvSF4-/exec";
const MAX_FILE_MB = 8;
let session = null;
let currentTrip = null;
let trips = [];

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");
const message = (id, text, good=false) => { $(id).textContent = text; $(id).style.color = good ? "#668d36" : "#b35c43"; };

function apiGet(params) {
  return new Promise((resolve, reject) => {
    if (API_URL.includes("PASTE_YOUR")) return reject(new Error("Add your Apps Script Web App URL in app.js first."));
    const callback = "rv_cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const timer = setTimeout(() => { cleanup(); reject(new Error("Server timed out. Check your deployment URL and internet connection.")); }, 25000);
    function cleanup(){clearTimeout(timer);delete window[callback];script.remove();}
    window[callback] = (data) => {cleanup(); if(data && data.ok) resolve(data); else reject(new Error(data?.error || "Request failed."));};
    script.onerror = () => {cleanup();reject(new Error("Could not reach Apps Script. Check the Web App deployment."));};
    const query = new URLSearchParams({...params, callback}).toString();
    script.src = API_URL + (API_URL.includes("?") ? "&" : "?") + query;
    document.body.appendChild(script);
  });
}

function apiPost(fields) {
  return new Promise((resolve, reject) => {
    if (API_URL.includes("PASTE_YOUR")) return reject(new Error("Add your Apps Script Web App URL in app.js first."));
    const frameName = "rv_frame_" + Math.random().toString(36).slice(2);
    const iframe = document.createElement("iframe");
    iframe.name = frameName; iframe.style.display = "none";
    const form = document.createElement("form");
    form.method = "POST"; form.action = API_URL; form.target = frameName; form.style.display = "none";
    const frameInput=document.createElement("input"); frameInput.type="hidden"; frameInput.name="frameName"; frameInput.value=frameName; form.appendChild(frameInput);
    Object.entries(fields).forEach(([key,value]) => {
      const input = document.createElement("input"); input.type="hidden"; input.name=key; input.value=String(value ?? ""); form.appendChild(input);
    });
    let done = false;
    const finish = (ok, err) => { if(done)return; done=true; clearTimeout(timer); iframe.remove(); form.remove(); ok ? resolve({ok:true}) : reject(new Error(err)); };
    window.addEventListener("message", function handler(event) {
      if (event.data?.rideVaultFrame !== frameName) return;
      window.removeEventListener("message", handler);
      finish(event.data.ok, event.data.error || "Upload failed.");
    });
    const timer = setTimeout(() => finish(false, "The server did not confirm the request. Refresh the page and check whether it was saved."), 60000);
    document.body.appendChild(iframe); document.body.appendChild(form); form.submit();
  });
}

function setLoggedIn(user) {
  session = user; hide("loginView"); show("appView"); show("logoutBtn");
  $("userLabel").textContent = `${user.name} · ${user.id}`;
  if (user.role === "admin") show("adminPanel"); else hide("adminPanel");
  loadTrips();
}
function logout(){session=null;currentTrip=null;hide("appView");show("loginView");hide("logoutBtn");$("userLabel").textContent="";$("loginPassword").value="";hide("tripDetail");show("tripGrid");}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); message("loginMessage","Signing in…",true);
  try { const result = await apiGet({action:"login",id:$("loginId").value.trim(),password:$("loginPassword").value}); setLoggedIn(result.user); }
  catch(err){message("loginMessage",err.message);}
});
$("logoutBtn").addEventListener("click",logout);

async function loadTrips(){
  try {
    const result = await apiGet({action:"trips",token:session.token}); trips=result.trips||[];
    $("tripCount").textContent = `${trips.length} ${trips.length===1?"trip":"trips"}`;
    $("tripGrid").innerHTML = trips.length ? trips.map((t,i)=>`
      <article class="trip-card" data-trip="${escapeAttr(t.id)}">
        <span class="trip-number">JOURNEY ${String(i+1).padStart(2,"0")}</span><span class="trip-art">${["⌁","✦","◒","↗"][i%4]}</span>
        <h3>${escapeHtml(t.name)}</h3><p>${escapeHtml([t.place,t.date].filter(Boolean).join(" · ") || "A collection of good memories")}</p><span class="trip-open">OPEN ALBUM ↗</span>
      </article>`).join("") : `<div class="empty-state">No trip albums yet. Your admin can create the first one.</div>`;
    document.querySelectorAll(".trip-card").forEach(card=>card.addEventListener("click",()=>openTrip(card.dataset.trip)));
  } catch(err){$("tripGrid").innerHTML=`<div class="empty-state">${escapeHtml(err.message)}</div>`;}
}
async function openTrip(id){
  currentTrip=trips.find(t=>t.id===id); if(!currentTrip)return;
  hide("tripGrid");show("tripDetail");
  $("detailTitle").textContent=currentTrip.name;
  $("detailMeta").textContent=[currentTrip.place,currentTrip.date].filter(Boolean).join(" · ");
  $("detailDescription").textContent=currentTrip.description||"The road was long. The memories are forever.";
  await loadMedia();
}
$("backTrips").addEventListener("click",()=>{currentTrip=null;hide("tripDetail");show("tripGrid");});
async function loadMedia(){
  $("mediaGrid").innerHTML='<div class="empty-state">Loading memories…</div>';
  try{
    const result=await apiGet({action:"media",token:session.token,tripId:currentTrip.id});
    const media=result.media||[];$("detailCount").textContent=`${media.length} memories`;
    $("mediaGrid").innerHTML=media.length?media.map(m=>{
      const isVideo=(m.mime||"").startsWith("video/");
      const preview=isVideo?`<div class="video-placeholder">▶</div>`:`<img loading="lazy" src="${escapeAttr(m.thumbnail||m.url)}" alt="${escapeAttr(m.name)}"/>`;
      return `<article class="media-card"><div class="media-preview" data-url="${escapeAttr(m.url)}" data-mime="${escapeAttr(m.mime)}">${preview}</div><div class="media-info"><strong>${escapeHtml(m.name)}</strong><span>${escapeHtml(m.uploadedBy||"Crew")} · ${escapeHtml(m.uploadedAt||"")}</span><br/><a href="${escapeAttr(m.downloadUrl||m.url)}" target="_blank" rel="noopener">DOWNLOAD ↗</a></div></article>`;
    }).join(""):`<div class="empty-state">This album is waiting for its first memory. Be the first to upload!</div>`;
    document.querySelectorAll(".media-preview").forEach(el=>el.addEventListener("click",()=>openLightbox(el.dataset.url,el.dataset.mime)));
  }catch(err){$("mediaGrid").innerHTML=`<div class="empty-state">${escapeHtml(err.message)}</div>`;}
}
function openLightbox(url,mime){
  $("lightboxContent").innerHTML=mime.startsWith("video/")?`<video src="${escapeAttr(url)}" controls autoplay playsinline></video>`:`<img src="${escapeAttr(url)}" alt="Trip memory"/>`;
  show("lightbox");
}
$("closeLightbox").addEventListener("click",()=>{hide("lightbox");$("lightboxContent").innerHTML="";});
$("lightbox").addEventListener("click",e=>{if(e.target.id==="lightbox"){hide("lightbox");$("lightboxContent").innerHTML="";}});

$("uploadForm").addEventListener("submit",async e=>{
  e.preventDefault();const file=$("mediaFile").files[0];if(!file)return;
  if(file.size>MAX_FILE_MB*1024*1024){message("uploadMessage",`Please choose a file smaller than ${MAX_FILE_MB} MB.`);return;}
  message("uploadMessage","Preparing upload…",true);
  try{
    const dataUrl=await readAsDataURL(file);
    message("uploadMessage","Uploading to the trip Drive folder…",true);
    await apiPost({action:"upload",token:session.token,tripId:currentTrip.id,fileName:file.name,mimeType:file.type||"application/octet-stream",data:dataUrl});
    $("mediaFile").value="";message("uploadMessage","Memory uploaded successfully!",true);await loadMedia();
  }catch(err){message("uploadMessage",err.message);}
});
function readAsDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Could not read this file."));r.readAsDataURL(file);});}

$("tripForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);message("tripMessage","Creating trip…",true);
  try{await apiPost({action:"createTrip",token:session.token,name:f.get("tripName"),date:f.get("tripDate"),place:f.get("tripPlace"),description:f.get("tripDescription")});e.currentTarget.reset();message("tripMessage","Trip album created.",true);loadTrips();}
  catch(err){message("tripMessage",err.message);}
});
$("riderForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);message("riderMessage","Creating rider login…",true);
  try{await apiPost({action:"createRider",token:session.token,id:f.get("riderId"),name:f.get("riderName"),password:f.get("riderPassword"),role:f.get("role")});e.currentTarget.reset();message("riderMessage","Rider login created.",true);}
  catch(err){message("riderMessage",err.message);}
});
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(s){return escapeHtml(s).replace(/`/g,"&#96;");}
