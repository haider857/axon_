// AXON Old GUI Edition - script.js (final 3-file package)
// Single-file logic: intent detection, improved API fetches, Jarvis mode, TTS with pulsing glow sync

const PROXIES = [
  u=>`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u=>`https://api.allorigins.cf/get?url=${encodeURIComponent(u)}`,
  u=>`https://thingproxy.freeboard.io/fetch/${u}`
];

const OFFLINE = {
  'albert einstein': 'Albert Einstein (14 March 1879 – 18 April 1955) was a German-born theoretical physicist who developed the theory of relativity.',
  'who are you': 'I am AXON, your personal AI assistant.',
  'who am i': 'You are Haider Ali.',
  'what can you do': 'I can open camera, take picture, record voice, make calls, open WhatsApp, take notes, update todos, and search the web.'
};

function log(msg){
  const el = document.getElementById('log');
  const p = document.createElement('div');
  p.textContent = msg;
  el.prepend(p);
  console.log('AXON:',msg);
}

function setGlowState(state){
  const glow = document.getElementById('axon-glow');
  glow.classList.remove('listening','speaking','idle');
  if(state) glow.classList.add(state); else glow.classList.add('idle');
}

// Improved fetch with proxy fallbacks and timeouts
async function tryFetch(url, timeout=7000){
  const controller = new AbortController();
  const timer = setTimeout(()=> controller.abort(), timeout);
  try{
    const r = await fetch(url, {signal: controller.signal});
    clearTimeout(timer);
    if(r.ok){
      const ct = r.headers.get('content-type')||'';
      if(ct.includes('application/json')) return await r.json();
      const txt = await r.text();
      try{ return JSON.parse(txt);}catch(e){ return txt; }
    }
  }catch(e){ /* continue to proxies */ }
  clearTimeout(timer);
  // try proxies
  for(const p of PROXIES){
    try{
      const proxyUrl = p(url);
      const res = await fetch(proxyUrl, {signal: controller.signal});
      if(!res.ok) continue;
      const j = await res.json();
      if(j.contents){
        try{return JSON.parse(j.contents);}catch(e){ return j.contents; }
      }
      return j;
    }catch(e){ /* next proxy */ }
  }
  throw new Error('fetch failed');
}

// TTS and glow sync
function speak(text, mode='default'){
  if(!text) return;
  log('AXON: ' + text);
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  // voice styles
  const jarvis = document.getElementById('jarvis-mode').checked;
  if(jarvis || mode==='jarvis'){
    utter.rate = 0.95; utter.pitch = 0.9;
    document.body.classList.add('jarvis-mode');
  } else {
    utter.rate = 1.0; utter.pitch = 1.0;
    document.body.classList.remove('jarvis-mode');
  }
  // glow animation during speaking
  const glow = document.getElementById('axon-glow');
  glow.classList.remove('listening'); glow.classList.add('speaking');
  utter.onend = ()=> { glow.classList.remove('speaking'); glow.classList.add('idle'); };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// Speech recognition helper
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
function startVoice(onResult, onError){
  if(!SR){
    const t = prompt('Type command (voice fallback):');
    if(t) onResult(t);
    return null;
  }
  const r = new SR();
  r.lang = 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e)=> { const txt = e.results[0][0].transcript; log('User (voice): ' + txt); onResult(txt); };
  r.onerror = (e)=> { log('SpeechRec error ' + e.error); if(onError) onError(e); };
  r.onend = ()=> { log('SpeechRec ended'); setGlowState('idle'); };
  r.start();
  setGlowState('listening');
  return r;
}

// Intent detection (simple)
function detectIntent(text){
  const q = (text||'').toLowerCase();
  if(q.startsWith('who is ')) return {type:'who_is', subject: q.replace('who is ','').trim()};
  if(q.includes('where am') || q.includes('my location')) return {type:'where_am_i'};
  if(q.includes('weather')) return {type:'weather'};
  if(q.match(/rate|usd|pkr|dollar/)) return {type:'currency', pair:'USD/PKR'};
  if(q.includes('rating of') || q.includes('rating')) return {type:'rating', subject:q.replace(/rating( of| for)?/,'').trim()};
  if(q.includes('open camera') || q.includes('take picture') || q.includes('camera')) return {type:'camera'};
  if(q.includes('record voice') || q.includes('recording')) return {type:'record'};
  if(q.includes('note') || q.includes('take a note')) return {type:'note'};
  if(q.includes('todo')) return {type:'todo'};
  if(q.includes('what can you do') || q.includes('what are you')) return {type:'capabilities'};
  return {type:'search', query:text};
}

// Main command handler
async function handleCommand(raw){
  const q = String(raw||'').trim();
  if(!q) return;
  log('You: ' + q);

  // offline quick answers
  for(const k in OFFLINE){ if(q.toLowerCase().includes(k) || q.toLowerCase()===k){ speak(OFFLINE[k]); return; } }

  const intent = detectIntent(q);

  try{
    if(intent.type==='who_is'){
      try{
        const wiki = await tryFetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(intent.subject));
        if(wiki && wiki.extract){ speak(wiki.extract); return; }
      }catch(e){ /* fallback */ }
      speak("I couldn't find details on " + intent.subject);
      return;
    }

    if(intent.type==='where_am_i'){
      if(!navigator.geolocation){ speak('Geolocation not supported'); return; }
      try{
        const p = await new Promise((res,rej)=> navigator.geolocation.getCurrentPosition(res,rej));
        const lat = p.coords.latitude, lon = p.coords.longitude;
        try{
          const geo = await tryFetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
          const addr = geo.address || {}; const pretty = [addr.city, addr.town, addr.village, addr.state, addr.country].filter(Boolean).join(', ');
          speak('You are in ' + pretty);
        }catch(e){ speak(`Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`); }
      }catch(e){ speak('Enable location permissions'); }
      return;
    }

    if(intent.type==='weather'){
      try{
        const p = await new Promise((res,rej)=> navigator.geolocation.getCurrentPosition(res,rej));
        const lat=p.coords.latitude, lon=p.coords.longitude;
        const w = await tryFetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        if(w && w.current_weather) { speak(`Current temp ${w.current_weather.temperature}°C, wind ${w.current_weather.windspeed} m/s`); return; }
      }catch(e){ speak('Weather lookup failed — allow location and check internet'); }
      return;
    }

    if(intent.type==='currency'){
      try{
        const r = await tryFetch('https://api.exchangerate.host/latest?base=USD&symbols=PKR');
        if(r && r.rates && r.rates.PKR){ speak('One US dollar is approximately ' + r.rates.PKR.toFixed(2) + ' Pakistani rupees.'); return; }
      }catch(e){ speak('Currency lookup failed'); }
      return;
    }

    if(intent.type==='rating'){
      try{
        const tv = await tryFetch('https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(intent.subject || q));
        if(tv && tv.rating && tv.rating.average){ speak(`${tv.name} is rated ${tv.rating.average} out of 10.`); return; }
      }catch(e){ speak('Rating lookup failed'); }
      return;
    }

    if(intent.type==='camera'){
      try{
        const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
        const vid = document.getElementById('cam-preview'); vid.srcObject = stream; vid.classList.remove('hidden');
        speak('Camera opened');
      }catch(e){ speak('Cannot open camera: ' + (e.message||e)); }
      return;
    }

    if(intent.type==='record'){
      try{
        const s = await navigator.mediaDevices.getUserMedia({audio:true});
        const mr = new MediaRecorder(s); const chunks=[];
        mr.ondataavailable = e=> chunks.push(e.data);
        mr.onstop = ()=> { const blob = new Blob(chunks,{type:'audio/webm'}); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='axon_voice_'+Date.now()+'.webm'; a.click(); speak('Recording saved'); };
        mr.start(); setTimeout(()=> mr.stop(), 8000); speak('Recording started for 8 seconds'); // auto-stop for simplicity
      }catch(e){ speak('Recording failed'); }
      return;
    }

    if(intent.type==='note'){
      const txt = q.replace(/^(take a note|note)/i,'').trim();
      if(txt){ const notes = JSON.parse(localStorage.getItem('axon_notes')||'[]'); notes.unshift({text:txt,ts:Date.now()}); localStorage.setItem('axon_notes', JSON.stringify(notes)); speak('Note saved'); } else speak('What should I note?');
      return;
    }

    if(intent.type==='todo'){
      const t = q.replace(/^(add to todo|add todo|add task)/i,'').trim();
      if(t){ const todos = JSON.parse(localStorage.getItem('axon_todos')||'[]'); todos.unshift({task:t,done:false,ts:Date.now()}); localStorage.setItem('axon_todos', JSON.stringify(todos)); speak('Task added'); } else speak('What task?');
      return;
    }

    if(intent.type==='capabilities'){
      speak('I can open camera, take photos, record voice, make calls, open WhatsApp, take notes, update todos, check weather, currency rates, and search the web.');
      return;
    }

    // fallback search (DuckDuckGo)
    try{
      const dd = await tryFetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1');
      if(dd && dd.AbstractText){ speak(dd.AbstractText); return; }
      if(dd && dd.RelatedTopics && dd.RelatedTopics.length){
        const choices = dd.RelatedTopics.filter(t=>t.Text).slice(0,3).map(t=>t.Text);
        speak('I found multiple results. Say the number of the one you want.');
        startVoice(async ch=>{ let idx = parseInt(ch)-1; if(isNaN(idx)) idx = choices.findIndex(c=> c.toLowerCase().includes(ch.toLowerCase())); if(idx>=0) speak(choices[idx]); else speak('Choice not recognized'); });
        return;
      }
    }catch(e){ speak('I could not reach the search service. Try reloading or check internet.'); return; }

    speak("I couldn't find an answer.");
  }catch(e){
    speak('Error processing command: ' + (e.message||e));
  }
}

// UI wiring
document.getElementById('axon-glow').addEventListener('click', ()=> {
  const panel = document.getElementById('axon-panel');
  panel.classList.toggle('hidden');
});

document.getElementById('close-btn').addEventListener('click', ()=> {
  document.getElementById('axon-panel').classList.add('hidden');
});

document.getElementById('voice-btn').addEventListener('click', ()=> {
  startVoice(text=> handleCommand(text));
});

document.getElementById('send-btn').addEventListener('click', ()=> {
  const v = document.getElementById('axon-input').value;
  handleCommand(v);
});

document.getElementById('axon-input').addEventListener('keydown', (e)=> { if(e.key==='Enter') handleCommand(e.target.value); });

document.querySelectorAll('.quick button').forEach(b=> b.addEventListener('click', ()=> { handleCommand(b.getAttribute('data-cmd')); }));

// expose for debug
window.AXON = { handleCommand };

// initial
log('AXON ready - Old GUI Edition');
setGlowState('idle');
