const TOTAL = 4_540_000_000;
const PRESENT_YEAR = new Date().getFullYear();
const MAX_LEVEL = 60;
const MIN_SPAN = TOTAL / 2 ** (MAX_LEVEL / 2);
const $ = (selector) => document.querySelector(selector);
const byId = (id) => document.getElementById(id);

let events = [];

const eons = [
  {name:'Hadeano',old:4_540_000_000,young:4_000_000_000,css:'hadean'},
  {name:'Arqueano',old:4_000_000_000,young:2_500_000_000,css:'archean'},
  {name:'Proterozoico',old:2_500_000_000,young:538_800_000,css:'proterozoic'},
  {name:'Fanerozoico',old:538_800_000,young:0,css:'phanerozoic'}
];
const jumps = {
  all:{center:TOTAL/2,span:TOTAL,focus:TOTAL},
  life:{center:3_500_000_000,span:1_300_000_000,focus:3_500_000_000},
  dinosaurs:{center:160_000_000,span:340_000_000,focus:230_000_000},
  humans:{center:160_000,span:340_000,focus:300_000},
  history:{center:3_500,span:7_500,focus:5_400},
  recent:{center:120,span:300,focus:PRESENT_YEAR-1969}
};

let selectedRelatedIds = new Set();
let center = TOTAL / 2;
let span = TOTAL;
let targetCenter = center;
let targetSpan = span;
let focusBp = TOTAL;
let activeJump = 'all';
let dragged = null;
let dragMoved = false;
let lastFocus = null;
let toastTimer;
let motionFrame = 0;
let previousFrame = 0;
let pinNodes = new Map();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function allEvents(){return [...events].sort((a,b)=>b.bp-a.bp)}
function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function targetScaleLevel(){return clamp(2*Math.log2(TOTAL/targetSpan),0,MAX_LEVEL)}
function spanAt(level){return Math.max(MIN_SPAN,TOTAL/2**(clamp(level,0,MAX_LEVEL)/2))}
function clampCenter(value,currentSpan=span){
  const edge=currentSpan*currentSpan/(2*TOTAL);
  return clamp(value,edge,TOTAL-edge);
}
function gutter(width){return Math.min(92,Math.max(76,width*.22))}
function chartWidth(width){return Math.max(1,width-2*gutter(width))}
function xFor(bp,width){return gutter(width)+(0.5+(center-bp)/span)*chartWidth(width)}
function bpAt(x,width){return center+(0.5-(x-gutter(width))/chartWidth(width))*span}
function shortAge(bp){
  if(bp===0)return 'Hoje';
  if(bp>=1_000_000_000)return `${formatNumber(bp/1_000_000_000, bp%1_000_000_000?2:0)} bi de anos atrás`;
  if(bp>=1_000_000)return `${formatNumber(bp/1_000_000,bp%1_000_000?1:0)} mi de anos atrás`;
  if(bp>=10_000)return `${formatNumber(bp/1_000,bp%1_000?1:0)} mil anos atrás`;
  if(bp>=1_000)return `${formatNumber(bp/1_000,bp%1_000?1:0)} mil anos atrás`;
  return `há ${formatNumber(bp)} ${bp===1?'ano':'anos'}`;
}
function formatNumber(value,digits=0){return value.toLocaleString('pt-BR',{maximumFractionDigits:digits})}
function yearLabel(bp){
  if(bp>=10_000)return shortAge(bp);
  const year=PRESENT_YEAR-bp;
  if(year>0)return String(year);
  return `${1-year} a.C.`;
}
function rangeLabel(){
  const old=clamp(center+span/2,0,TOTAL);
  const young=clamp(center-span/2,0,TOTAL);
  return `${old>=10_000?shortAge(old):yearLabel(old)} — ${young===0?'Hoje':young>=10_000?shortAge(young):yearLabel(young)}`;
}
function scaleText(){
  if(span>=1_000_000_000)return `${formatNumber(span/1_000_000_000,2)} bilhões de anos`;
  if(span>=1_000_000)return `${formatNumber(span/1_000_000,1)} milhões de anos`;
  if(span>=1_000)return `${formatNumber(span/1_000,1)} mil anos`;
  return `${formatNumber(span,1)} anos`;
}
function stopViewMotion(){
  if(motionFrame)cancelAnimationFrame(motionFrame);
  motionFrame=0;previousFrame=0;
  targetCenter=center;targetSpan=span;
}
function animateView(time){
  const elapsed=previousFrame?Math.min(48,time-previousFrame):16;
  previousFrame=time;
  const progress=1-Math.exp(-elapsed/115);
  center+=((targetCenter-center)*progress);
  span=Math.exp(Math.log(span)+(Math.log(targetSpan)-Math.log(span))*progress);
  center=clampCenter(center,span);
  render();
  const moving=Math.abs(Math.log(span/targetSpan))>.0007||Math.abs(center-targetCenter)>Math.max(.02,targetSpan*.00003);
  if(moving){motionFrame=requestAnimationFrame(animateView)}
  else{center=targetCenter;span=targetSpan;render();motionFrame=0;previousFrame=0}
}
function setView(nextCenter,nextSpan,jump='',nextFocus=nextCenter,immediate=false){
  targetSpan=clamp(nextSpan,MIN_SPAN,TOTAL);
  targetCenter=clampCenter(nextCenter,targetSpan);
  focusBp=clamp(nextFocus,0,TOTAL);
  activeJump=jump;
  if(immediate||reducedMotion.matches){
    stopViewMotion();targetCenter=clampCenter(nextCenter,clamp(nextSpan,MIN_SPAN,TOTAL));targetSpan=clamp(nextSpan,MIN_SPAN,TOTAL);
    center=targetCenter;span=targetSpan;render();return;
  }
  if(!motionFrame)motionFrame=requestAnimationFrame(animateView);
}
function zoomTo(level,anchorFraction=null){
  const nextSpan=spanAt(level);
  if(anchorFraction===null){setView(focusBp,nextSpan,'',focusBp);return}
  const width=byId('timeline').clientWidth||1;
  const x=anchorFraction*width;
  const anchor=clamp(bpAt(x,width),0,TOTAL);
  const chartFraction=(x-gutter(width))/chartWidth(width);
  const nextCenter=anchor-(.5-chartFraction)*nextSpan;
  setView(nextCenter,nextSpan,'',anchor);
}

function render(){
  byId('eventCount').textContent=`${allEvents().length} acontecimentos`;
  if(byId('atlas').hidden)return;
  const timeline=byId('timeline');
  const width=timeline.clientWidth||1;
  timeline.style.setProperty('--axis-gutter',`${gutter(width)}px`);
  byId('viewRange').textContent=rangeLabel();
  byId('scaleLabel').textContent=`${span>=TOTAL*.99?'Visão completa':'Trecho visível'} · ${scaleText()}`;
  const focused=allEvents().find(event=>event.bp===focusBp);
  byId('focusLabel').textContent=`Zoom em: ${focused?.title||shortAge(focusBp)}`;
  const slider=byId('zoomSlider');
  const level=targetScaleLevel();
  slider.value=String(level);
  slider.style.setProperty('--range-percent',`${level/MAX_LEVEL*100}%`);
  document.querySelectorAll('.jump').forEach(btn=>btn.classList.toggle('active',btn.dataset.jump===activeJump));
  renderEons(width);
  renderTicks(width);
  renderPins(width);
  renderNavigator();
}
function renderEons(width){
  const track=byId('eonTrack');track.replaceChildren();
  for(const eon of eons){
    const left=clamp(xFor(eon.old,width),gutter(width),width-gutter(width));
    const right=clamp(xFor(eon.young,width),gutter(width),width-gutter(width));
    if(right-left<4)continue;
    const node=document.createElement('div');node.className=`eon ${eon.css}`;
    node.style.left=`${left}px`;node.style.width=`${right-left}px`;
    if(right-left>75)node.textContent=eon.name;
    node.title=eon.name;
    track.append(node);
  }
}
function niceStep(raw){const power=10**Math.floor(Math.log10(raw));const unit=raw/power;return (unit<=1?1:unit<=2?2:unit<=5?5:10)*power}
function renderTicks(width){
  const layer=byId('tickLayer');layer.replaceChildren();
  const step=niceStep(span/9);
  const low=Math.max(0,center-span/2);
  const high=Math.min(TOTAL,center+span/2);
  const start=Math.ceil(low/step)*step;
  for(let bp=start;bp<=high+step*.001;bp+=step){
    const x=xFor(bp,width);
    if(x<10||x>width-10)continue;
    const tick=document.createElement('div');tick.className=`tick${bp===0?' now':''}`;tick.style.left=`${x}px`;
    const label=document.createElement('div');label.className=`tick-label${bp===0?' now':''}`;label.style.left=`${x}px`;
    label.textContent=bp===0?'HOJE':bp>=1_000_000_000?`${formatNumber(bp/1_000_000_000,1)} bi`:bp>=1_000_000?`${formatNumber(bp/1_000_000,0)} mi`:bp>=10_000?`${formatNumber(bp/1_000,0)} mil`:yearLabel(bp);
    layer.append(tick,label);
  }
}
function renderPins(width){
  const layer=byId('eventLayer');
  const edge=gutter(width);
  const visible=allEvents().map(event=>({...event,x:xFor(event.bp,width)})).filter(event=>event.x>=edge-3&&event.x<=width-edge+3).sort((a,b)=>a.x-b.x);
  const groups=[];
  for(const event of visible){
    const group=groups.at(-1);
    if(group&&event.x-group.at(-1).x<105)group.push(event);else groups.push([event]);
  }
  const nextNodes=new Map();
  groups.forEach((group,index)=>{
    const key=group.map(event=>event.id).join('|');
    const x=group.reduce((sum,event)=>sum+event.x,0)/group.length;
    let node=pinNodes.get(key);
    if(!node){
      node=document.createElement('button');node.type='button';
      const label=document.createElement('span');label.className='pin-label';
      const stem=document.createElement('span');stem.className='pin-stem';
      const dot=document.createElement('span');dot.className='pin-dot';
      node.append(label,stem,dot);
      layer.append(node);
    }
    node.className=`event-pin${index%2?' low':''}${group.length>1?' cluster-pin':''}${group.length===1&&group[0].custom?' custom':''}`;
    node.style.left=`${x}px`;
    const label=node.querySelector('.pin-label');
    if(group.length===1){
      const contentKey=`${key}:${group[0].title}:${group[0].bp}`;
      if(node.dataset.contentKey!==contentKey){
        const title=document.createElement('span');title.className='pin-title';title.textContent=group[0].title;
        const date=document.createElement('span');date.className='pin-date';date.textContent=shortAge(group[0].bp);
        label.replaceChildren(title,date);
        node.dataset.contentKey=contentKey;
      }
      node.setAttribute('aria-label',`${group[0].title}, ${shortAge(group[0].bp)}. Abrir documento`);
      node.onclick=()=>{if(!dragMoved){focusBp=group[0].bp;openDetail(group[0].id)}};
    }else{
      if(node.dataset.contentKey!==key){
        const count=document.createElement('span');count.className='cluster-count';count.textContent=`+ ${group.length} marcos`;
        label.replaceChildren(count);
        node.dataset.contentKey=key;
      }
      node.setAttribute('aria-label',`${group.length} acontecimentos próximos. Aproximar`);
      node.onclick=()=>{
        if(dragMoved)return;
        const oldest=group[0].bp,youngest=group.at(-1).bp;
        setView((oldest+youngest)/2,Math.min(span*.28,Math.max((oldest-youngest)*2.5,MIN_SPAN)));
      };
    }
    nextNodes.set(key,node);
  });
  for(const [key,node] of pinNodes)if(!nextNodes.has(key))node.remove();
  pinNodes=nextNodes;
  byId('timelineEmpty').hidden=visible.length>0;
}
function renderNavigator(){
  const track=byId('navigatorTrack');
  const width=track.clientWidth||1;
  const old=clamp(center+span/2,0,TOTAL),young=clamp(center-span/2,0,TOTAL);
  const left=(TOTAL-old)/TOTAL*width,right=(TOTAL-young)/TOTAL*width;
  const window=byId('navigatorWindow');
  const visualWidth=Math.max(7,right-left);
  window.style.left=`${clamp((left+right-visualWidth)/2,0,width-visualWidth)}px`;
  window.style.width=`${visualWidth}px`;
  track.setAttribute('aria-valuenow',String(Math.round(center)));
  track.setAttribute('aria-valuetext',shortAge(center));
}
function shuffle(items){
  const shuffled=[...items];
  for(let i=shuffled.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  return shuffled;
}
function highlightEvents(){
  const pool=allEvents().filter(event=>event.id!=='today');
  const selected=[];
  const dinosaurs=pool.find(event=>event.id==='dinosaurs');
  if(dinosaurs)selected.push(dinosaurs);
  const custom=shuffle(pool.filter(event=>event.custom))[0];
  if(custom)selected.push(custom);
  selected.push(...shuffle(pool.filter(event=>!selected.some(item=>item.id===event.id))).slice(0,4-selected.length));
  return shuffle(selected);
}
function renderMilestones(){
  const grid=byId('milestoneGrid');grid.replaceChildren();
  highlightEvents().forEach(event=>{
    const button=document.createElement('button');button.className='milestone';button.type='button';
    const cover=new DOMParser().parseFromString(event.body||'','text/html').querySelector('img')?.getAttribute('src')||'';
    if(/^data:image\/(jpeg|png|webp|gif);base64,/i.test(cover)){
      const image=document.createElement('img');image.className='milestone-image';image.src=cover;image.alt='';
      button.classList.add('has-image');button.append(image);
    }
    const era=document.createElement('span');era.className='era';era.textContent=event.custom?'SEU DOCUMENTO':event.era;
    const title=document.createElement('strong');title.textContent=event.title;
    const summary=document.createElement('span');summary.className='summary';summary.textContent=event.summary||'Abra para ler o documento completo.';
    const age=document.createElement('span');age.className='age';age.textContent=shortAge(event.bp);
    const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='↗';
    button.append(era,title,summary,age,arrow);button.addEventListener('click',()=>{focusBp=event.bp;openDetail(event.id)});grid.append(button);
  });
}
function renderRoute(){
  const atlas=location.hash==='#atlas';
  byId('inicio').hidden=atlas;
  byId('atlas').hidden=!atlas;
  document.body.dataset.view=atlas?'atlas':'home';
  document.querySelectorAll('[data-route]').forEach(link=>{
    if(link.dataset.route===(atlas?'atlas':'home'))link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  });
  window.scrollTo(0,0);
  if(atlas)requestAnimationFrame(render);
  else{stopViewMotion();renderMilestones();render()}
}

async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Falha ao comunicar com o servidor.');
  return data;
}
async function refreshEvents(){
  events=(await api('/api/events')).events;
  renderMilestones();render();
}

function cleanHtml(html){
  const source=new DOMParser().parseFromString(`<div>${html}</div>`,'text/html').body.firstElementChild;
  const allowed=new Set(['P','BR','STRONG','B','EM','I','U','H3','UL','OL','LI','BLOCKQUOTE','A','IMG','DIV']);
  function copy(parent,target){
    for(const child of parent.childNodes){
      if(child.nodeType===Node.TEXT_NODE){target.append(document.createTextNode(child.textContent));continue}
      if(child.nodeType!==Node.ELEMENT_NODE)continue;
      if(!allowed.has(child.tagName)){copy(child,target);continue}
      const tag=child.tagName==='DIV'?'P':child.tagName.toLowerCase();
      if(tag==='img'){
        const src=child.getAttribute('src')||'';
        if(!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(src))continue;
        const img=document.createElement('img');img.src=src;img.alt=(child.getAttribute('alt')||'Imagem do acontecimento').slice(0,120);target.append(img);continue;
      }
      const next=document.createElement(tag);
      if(tag==='a'){
        const href=child.getAttribute('href')||'';
        if(/^https?:\/\//i.test(href)){next.href=href;next.rel='noopener noreferrer';next.target='_blank'}
      }
      copy(child,next);target.append(next);
    }
  }
  const clean=document.createElement('div');copy(source,clean);return clean.innerHTML;
}
function openOverlay(name){
  lastFocus=document.activeElement;
  byId(`${name}Overlay`).hidden=false;
  document.body.style.overflow='hidden';
}
function closeOverlay(name){
  byId(`${name}Overlay`).hidden=true;
  if([...document.querySelectorAll('.overlay')].every(el=>el.hidden))document.body.style.overflow='';
  if(lastFocus&&lastFocus.isConnected)lastFocus.focus();
}
function openDetail(id){
  const event=allEvents().find(item=>item.id===id);if(!event)return;
  const root=byId('detailContent');root.replaceChildren();
  const era=document.createElement('div');era.className='detail-era';era.textContent=event.custom?'SEU ACONTECIMENTO':event.era;
  const title=document.createElement('h2');title.className='detail-title';title.id='detailTitle';title.textContent=event.title;
  const date=document.createElement('div');date.className='detail-date';date.textContent=shortAge(event.bp);
  const summary=document.createElement('p');summary.className='detail-summary';summary.textContent=event.summary||'';
  const body=document.createElement('div');body.className='document-content';body.innerHTML=cleanHtml(event.body||'');
  root.append(era,title,date,summary,body);
  const related=(event.relatedIds||[]).map(relatedId=>events.find(item=>item.id===relatedId)).filter(Boolean);
  const referencedBy=(event.referencedByIds||[]).map(relatedId=>events.find(item=>item.id===relatedId)).filter(Boolean);
  if(related.length||referencedBy.length){
    const links=document.createElement('section');links.className='related-section';
    const heading=document.createElement('h3');heading.textContent='Conexões';links.append(heading);
    for(const [label,items] of [['Relacionado a',related],['Referenciado por',referencedBy]]){
      if(!items.length)continue;
      const caption=document.createElement('p');caption.className='related-caption';caption.textContent=label;links.append(caption);
      for(const item of items){
        const link=document.createElement('button');link.type='button';link.className='related-card';
        const name=document.createElement('strong');name.textContent=item.title;
        const age=document.createElement('span');age.textContent=shortAge(item.bp);
        link.append(name,age);link.addEventListener('click',()=>{closeOverlay('detail');focusBp=item.bp;openDetail(item.id)});links.append(link);
      }
    }
    root.append(links);
  }
  {
    const actions=document.createElement('div');actions.className='detail-actions';
    const edit=document.createElement('button');edit.textContent='Editar';edit.addEventListener('click',()=>{closeOverlay('detail');openEditor(event)});
    const remove=document.createElement('button');remove.className='danger';remove.textContent='Excluir';remove.addEventListener('click',async()=>{
      if(!confirm(`Excluir “${event.title}”?`))return;
      try{await api(`/api/events/${encodeURIComponent(event.id)}`,{method:'DELETE'});closeOverlay('detail');await refreshEvents();showToast('Acontecimento excluído.');}
      catch(error){showToast(error.message)}
    });actions.append(edit,remove);root.append(actions);
  }
  openOverlay('detail');byId('closeDetail').focus();
}
function openEditor(event=null){
  byId('eventForm').reset();byId('richEditor').innerHTML='';
  byId('eventId').value=event?.id||'';
  byId('editorTitle').textContent=event?'Editar acontecimento':'Adicionar acontecimento';
  byId('saveEvent').textContent=event?'Salvar alterações':'Salvar acontecimento';
  if(event){
    byId('eventTitle').value=event.title;
    byId('dateMode').value=event.dateMode||'bp';
    byId('eventDate').value=event.dateValue??event.bp;
    byId('eventSummary').value=event.summary||'';
    byId('richEditor').innerHTML=cleanHtml(event.body||'');
  }
  selectedRelatedIds=new Set(event?.relatedIds||[]);
  byId('relatedSearch').value='';renderRelatedPicker();
  updateDateHint();openOverlay('editor');byId('eventTitle').focus();
}
function normalizeSearch(value){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')}
function renderRelatedPicker(){
  const chosen=byId('selectedRelated');chosen.replaceChildren();
  const matches=byId('relatedMatches');matches.replaceChildren();
  const ownId=byId('eventId').value;
  for(const id of selectedRelatedIds){
    const item=events.find(event=>event.id===id);if(!item)continue;
    const chip=document.createElement('button');chip.type='button';chip.className='related-chip';chip.textContent=`${item.title} ×`;
    chip.setAttribute('aria-label',`Remover relação com ${item.title}`);
    chip.onclick=()=>{selectedRelatedIds.delete(id);renderRelatedPicker()};chosen.append(chip);
  }
  const query=normalizeSearch(byId('relatedSearch').value.trim());
  if(!query)return;
  for(const item of events.filter(event=>event.id!==ownId&&!selectedRelatedIds.has(event.id)&&normalizeSearch(`${event.title} ${event.summary}`).includes(query)).slice(0,8)){
    const button=document.createElement('button');button.type='button';button.className='related-option';button.textContent=`${item.title} · ${shortAge(item.bp)}`;
    button.onclick=()=>{selectedRelatedIds.add(item.id);byId('relatedSearch').value='';renderRelatedPicker();byId('relatedSearch').focus()};matches.append(button);
  }
  if(!matches.childElementCount){const empty=document.createElement('span');empty.textContent='Nenhum outro documento encontrado.';matches.append(empty)}
}
function updateDateHint(){
  const mode=byId('dateMode').value;
  byId('eventDate').min=mode==='bp'?'0':'1';
  byId('eventDate').max=mode==='ce'?String(PRESENT_YEAR):String(TOTAL);
  byId('dateHint').textContent=mode==='bp'?'Use “há quantos anos” para a escala geológica.':mode==='bce'?'Exemplo: 500 para o ano 500 a.C.':`Use um ano entre 1 e ${PRESENT_YEAR}.`;
}
function bpFromForm(mode,value){
  if(mode==='bp')return value;
  if(mode==='ce')return PRESENT_YEAR-value;
  return PRESENT_YEAR+value-1;
}
async function saveForm(event){
  event.preventDefault();
  const title=byId('eventTitle').value.trim();
  const mode=byId('dateMode').value;
  const value=Number(byId('eventDate').value);
  const bp=bpFromForm(mode,value);
  if(!title||!Number.isInteger(value)||bp<0||bp>TOTAL||!byId('eventDate').checkValidity()){showToast('Revise o título e a data.');return}
  const id=byId('eventId').value;
  const item={title,era:events.find(existing=>existing.id===id)?.era||'',summary:byId('eventSummary').value.trim(),body:cleanHtml(byId('richEditor').innerHTML),dateMode:mode,dateValue:value,relatedIds:[...selectedRelatedIds]};
  try{
    const saved=await api(id?`/api/events/${encodeURIComponent(id)}`:'/api/events',{method:id?'PUT':'POST',body:JSON.stringify(item)});
    await refreshEvents();
    closeOverlay('editor');
    location.hash='#atlas';
    renderRoute();
    setView(bp,Math.min(span,Math.max(100,bp*.3)));
    showToast('Acontecimento salvo.');
    openDetail(saved.event.id);
  }catch(error){console.error(error);showToast(error.message||'Não foi possível salvar.');}
}
function showToast(message){const toast=byId('toast');toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),3200)}

async function importFile(file){
  try{
    const payload=JSON.parse(await file.text());
    const result=await api('/api/import',{method:'POST',body:JSON.stringify(payload)});
    await refreshEvents();showToast(`${result.imported} registro(s) importado(s); ${result.skipped} já existia(m).`);
  }catch(error){showToast(error.message||'Não foi possível importar o arquivo.')}finally{byId('importInput').value=''}
}
async function exportEvents(){
  try{
    const data=await api('/api/export');
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='atlas-do-tempo-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){showToast(error.message)}
}
let searchTimer;
async function runSearch(){
  const query=byId('globalSearch').value.trim();
  const panel=byId('searchResults');panel.replaceChildren();panel.hidden=!query;
  if(!query)return;
  try{
    const results=(await api(`/api/search?q=${encodeURIComponent(query)}`)).events;
    if(byId('globalSearch').value.trim()!==query)return;
    if(!results.length){const empty=document.createElement('p');empty.textContent='Nenhum acontecimento encontrado.';panel.append(empty)}
    for(const item of results.slice(0,25)){
      const button=document.createElement('button');button.type='button';button.className='search-result';
      const title=document.createElement('strong');title.textContent=item.title;
      const age=document.createElement('span');age.textContent=shortAge(item.bp);
      button.append(title,age);button.onclick=()=>{panel.hidden=true;byId('globalSearch').value='';focusBp=item.bp;openDetail(item.id)};panel.append(button);
    }
  }catch(error){showToast(error.message)}
}
function compressImage(file){
  return new Promise((resolve,reject)=>{
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){reject(new Error('Formato não aceito'));return}
    const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{
      const ratio=Math.min(1,1200/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.78));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Imagem inválida'))};img.src=url;
  });
}
async function insertSelectedImage(){
  const input=byId('imageInput'),file=input.files?.[0];if(!file)return;
  try{
    const data=await compressImage(file);
    const editor=byId('richEditor');editor.focus();
    document.execCommand('insertHTML',false,`<img src="${data}" alt="Imagem do acontecimento">`);
    showToast('Imagem inserida no documento.');
  }catch(error){showToast('Não foi possível inserir essa imagem.')}finally{input.value=''}
}

function handleTimelineWheel(event,timeline){
  const horizontalDelta=Math.abs(event.deltaX)>Math.abs(event.deltaY)
    ?event.deltaX
    :event.shiftKey&&!event.ctrlKey&&!event.metaKey?event.deltaY:0;
  if(horizontalDelta){
    event.preventDefault();
    const unit=event.deltaMode===1?16:event.deltaMode===2?timeline.clientWidth:1;
    const distance=horizontalDelta*unit;
    const next=targetCenter-distance/chartWidth(timeline.clientWidth)*targetSpan;
    setView(next,targetSpan);
    return;
  }
  if((event.ctrlKey||event.metaKey)&&event.deltaY){
    event.preventDefault();
    const rect=timeline.getBoundingClientRect();
    zoomTo(targetScaleLevel()+(event.deltaY<0?1:-1),(event.clientX-rect.left)/rect.width);
  }
}

function installEvents(){
  const timeline=byId('timeline');
  window.addEventListener('hashchange',renderRoute);
  byId('shuffleHighlights').addEventListener('click',renderMilestones);
  byId('newEventBtn').addEventListener('click',()=>openEditor());
  byId('resetBtn').addEventListener('click',()=>setView(TOTAL/2,TOTAL,'all',TOTAL));
  document.querySelectorAll('.jump').forEach(button=>button.addEventListener('click',()=>{const target=jumps[button.dataset.jump];setView(target.center,target.span,button.dataset.jump,target.focus)}));
  byId('zoomIn').addEventListener('click',()=>zoomTo(targetScaleLevel()+2));
  byId('zoomOut').addEventListener('click',()=>zoomTo(targetScaleLevel()-2));
  byId('zoomSlider').addEventListener('input',event=>zoomTo(Number(event.target.value)));
  timeline.addEventListener('wheel',event=>handleTimelineWheel(event,timeline),{passive:false});
  timeline.addEventListener('pointerdown',event=>{
    if(event.target.closest('button'))return;
    stopViewMotion();
    dragged={x:event.clientX,center,span,pointer:event.pointerId,lastX:event.clientX,lastTime:performance.now(),velocity:0};dragMoved=false;
    timeline.setPointerCapture(event.pointerId);timeline.classList.add('dragging');
  });
  timeline.addEventListener('pointermove',event=>{
    if(!dragged||event.pointerId!==dragged.pointer)return;
    const dx=event.clientX-dragged.x;if(Math.abs(dx)>4)dragMoved=true;
    const now=performance.now(),dt=Math.max(1,now-dragged.lastTime);
    const velocity=(event.clientX-dragged.lastX)/dt;
    dragged.velocity=dragged.velocity*.65+velocity*.35;
    dragged.lastX=event.clientX;dragged.lastTime=now;
    if(dragMoved){
      const next=dragged.center+dx/chartWidth(timeline.clientWidth)*dragged.span;
      setView(next,dragged.span,'',next,true);
    }
  });
  const endDrag=()=>{
    const ending=dragged;dragged=null;timeline.classList.remove('dragging');
    if(ending&&dragMoved&&!reducedMotion.matches&&performance.now()-ending.lastTime<90){
      const projected=center+ending.velocity*210/chartWidth(timeline.clientWidth)*span;
      setView(projected,span);
    }
    setTimeout(()=>{dragMoved=false},0);
  };
  timeline.addEventListener('pointerup',endDrag);timeline.addEventListener('pointercancel',endDrag);
  timeline.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'){event.preventDefault();setView(targetCenter+targetSpan*.12,targetSpan)}
    if(event.key==='ArrowRight'){event.preventDefault();setView(targetCenter-targetSpan*.12,targetSpan)}
    if(event.key==='+'||event.key==='='){event.preventDefault();zoomTo(targetScaleLevel()+2)}
    if(event.key==='-'){event.preventDefault();zoomTo(targetScaleLevel()-2)}
  });
  const navigator=byId('navigatorTrack');
  const navigateAt=(event,immediate=false)=>{
    const rect=navigator.getBoundingClientRect();
    const fraction=clamp((event.clientX-rect.left)/rect.width,0,1);
    const target=TOTAL*(1-fraction);
    setView(target,targetSpan>=TOTAL*.99?TOTAL/4:targetSpan,'',target,immediate);
  };
  let navigatorStartX=0;
  navigator.addEventListener('pointerdown',event=>{navigatorStartX=event.clientX;navigator.setPointerCapture(event.pointerId);navigateAt(event)});
  navigator.addEventListener('pointermove',event=>{if(navigator.hasPointerCapture(event.pointerId)&&Math.abs(event.clientX-navigatorStartX)>3)navigateAt(event,true)});
  navigator.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'){event.preventDefault();setView(targetCenter+targetSpan*.1,targetSpan)}
    if(event.key==='ArrowRight'){event.preventDefault();setView(targetCenter-targetSpan*.1,targetSpan)}
    if(event.key==='Home'){event.preventDefault();setView(TOTAL,targetSpan)}
    if(event.key==='End'){event.preventDefault();setView(0,targetSpan)}
  });
  byId('helpBtn').addEventListener('click',()=>{openOverlay('help');byId('closeHelp').focus()});
  byId('closeDetail').addEventListener('click',()=>closeOverlay('detail'));
  byId('closeEditor').addEventListener('click',()=>closeOverlay('editor'));
  byId('cancelEditor').addEventListener('click',()=>closeOverlay('editor'));
  byId('closeHelp').addEventListener('click',()=>closeOverlay('help'));
  byId('gotIt').addEventListener('click',()=>closeOverlay('help'));
  document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>closeOverlay(el.dataset.close)));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){for(const name of ['editor','detail','help'])if(!byId(`${name}Overlay`).hidden)closeOverlay(name)}});
  byId('dateMode').addEventListener('change',updateDateHint);
  byId('eventForm').addEventListener('submit',saveForm);
  document.querySelectorAll('[data-format]').forEach(button=>button.addEventListener('click',()=>{
    byId('richEditor').focus();document.execCommand(button.dataset.format,false,button.dataset.value||null);
  }));
  byId('insertImage').addEventListener('click',()=>byId('imageInput').click());
  byId('imageInput').addEventListener('change',insertSelectedImage);
  byId('relatedSearch').addEventListener('input',renderRelatedPicker);
  byId('globalSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(runSearch,180)});
  byId('globalSearch').addEventListener('keydown',event=>{if(event.key==='Escape'){byId('globalSearch').value='';byId('searchResults').hidden=true}});
  byId('importBtn').addEventListener('click',()=>byId('importInput').click());
  byId('importInput').addEventListener('change',event=>{if(event.target.files?.[0])importFile(event.target.files[0])});
  byId('exportBtn').addEventListener('click',exportEvents);
  byId('richEditor').addEventListener('paste',event=>{
    event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));
  });
  window.addEventListener('resize',render);
}
async function start(){
  installEvents();
  try{await refreshEvents();renderRoute()}
  catch(error){console.error(error);showToast('Não foi possível carregar os dados.');renderRoute()}
}
start();
