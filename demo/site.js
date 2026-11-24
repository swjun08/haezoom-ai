(()=>{
const topBar=document.querySelector('.top');const syncTop=()=>topBar?.classList.toggle('scrolled',scrollY>12);addEventListener('scroll',syncTop,{passive:true});syncTop();
if(location.pathname==='/'&&/^#(stream|classwork|people|home|calendar|science|pdf|notice-)/.test(location.hash))location.replace('/classroom/'+location.hash);
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const menuButton=document.querySelector('.mobile-menu-button'),menu=document.querySelector('.mobile-menu');
function closeMenu(){if(!menu)return;menu.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','메뉴 열기');}
menuButton?.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');});
menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu?.hidden){closeMenu();menuButton.focus();}});
document.addEventListener('click',e=>{if(menu&&!menu.hidden&&!topBar.contains(e.target))closeMenu();});
matchMedia('(min-width:761px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
document.querySelectorAll('.top-menu a').forEach(a=>{if(new URL(a.href).pathname===location.pathname&&location.pathname!=='/')a.setAttribute('aria-current','page');});
if('IntersectionObserver'in window&&!motion.matches){document.documentElement.classList.add('js-reveal');const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');observer.unobserve(e.target);}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(e=>observer.observe(e));}
const preview=document.querySelector('#product-preview'),playToggle=document.querySelector('#play-toggle');
let currentScene='text',wantsPlay=!motion.matches,inView=false,ready=false,progress=0,modalSource=null,dialogScene='text';
const scenes=['text','capture','pdf'],titles={text:'우리 반 · 코딩 워크숍 안내',capture:'수업 과제 · 수행평가 제출 일정',pdf:'가정통신문.pdf'};
const send=(type,data={})=>preview?.contentWindow?.postMessage({source:'haezoom-site',type,...data},location.origin);
function updatePlay(){if(!playToggle)return;playToggle.setAttribute('aria-label',wantsPlay?'자동 재생 일시정지':'자동 재생 시작');playToggle.setAttribute('aria-pressed',String(!wantsPlay));playToggle.firstElementChild.textContent=wantsPlay?'Ⅱ':'▶';}
function updateTabs(){document.querySelectorAll('[data-scene]').forEach(b=>{const active=b.dataset.scene===currentScene;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;b.style.setProperty('--progress',active?progress+'%':'0%');});document.querySelector('#scene-file').textContent=titles[currentScene];}
function selectScene(scene,{focus=false}={}){currentScene=scene;progress=0;updateTabs();send('scene',{scene,play:wantsPlay&&inView&&!document.hidden});if(focus)document.querySelector('[data-scene="'+scene+'"]').focus();}
if(preview){
 document.querySelectorAll('[data-scene]').forEach((button,index)=>{button.addEventListener('click',()=>selectScene(button.dataset.scene));button.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(index+1)%3;if(e.key==='ArrowLeft')next=(index+2)%3;if(e.key==='Home')next=0;if(e.key==='End')next=2;if(next!==undefined){e.preventDefault();selectScene(scenes[next],{focus:true});}});});
 playToggle.addEventListener('click',()=>{wantsPlay=!wantsPlay;updatePlay();send('play',{play:wantsPlay&&inView&&!document.hidden});});
 const observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(ready)send('play',{play:wantsPlay&&inView&&!document.hidden});},{threshold:.2});observer.observe(preview);updatePlay();
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.source!=='haezoom-showcase')return;const d=e.data;if(e.source!==preview.contentWindow)return;
 if(d.type==='ready'){ready=true;selectScene(currentScene);}
 if(d.type==='progress'){progress=d.value;document.querySelector('[data-scene="'+currentScene+'"]').style.setProperty('--progress',progress+'%');}
 if(d.type==='step')document.querySelector('#scene-status').textContent=d.text;
 if(d.type==='ended'&&wantsPlay)selectScene(scenes[(scenes.indexOf(currentScene)+1)%3]);
 if(d.type==='pause'){wantsPlay=false;updatePlay();}
 if(d.type==='mode'){currentScene=d.mode;progress=0;updateTabs();}
 });
 document.addEventListener('visibilitychange',()=>send('play',{play:wantsPlay&&inView&&!document.hidden}));
 motion.addEventListener('change',()=>{if(motion.matches){wantsPlay=false;updatePlay();send('pause');}});
}
const dialog=document.querySelector('#preview-dialog'),dialogContent=document.querySelector('#preview-dialog-content');
function openDialog(source){modalSource=source;send('pause');document.body.classList.add('modal-open');dialog.showModal();dialog.querySelector('.dialog-close').focus();}
if(dialog){document.querySelector('.expand-preview')?.addEventListener('click',e=>{dialogScene=currentScene;document.querySelector('#preview-dialog-title').textContent='해줌 화면 살펴보기';const frame=document.createElement('iframe');frame.title='확대한 해줌 화면 · 예시 데이터';frame.src='/preview/?scene='+currentScene;dialogContent.replaceChildren(frame);frame.addEventListener('load',()=>frame.contentWindow.postMessage({source:'haezoom-site',type:'scene',scene:currentScene,play:false,interactive:true},location.origin));openDialog(e.currentTarget);});
 document.querySelectorAll('[data-image]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('#preview-dialog-title').textContent=button.dataset.imageTitle;const img=document.createElement('img');img.src=button.dataset.image;img.alt=button.dataset.imageTitle;dialogContent.replaceChildren(img);openDialog(button);}));
 dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');dialogContent.replaceChildren();modalSource?.focus({preventScroll:true});send('play',{play:wantsPlay&&inView&&!document.hidden});});}
const organized=document.querySelector('#organized-items');let organizedKind='task',taskDone=false;
function renderOrganized(){if(!organized)return;const task=organizedKind==='task';organized.setAttribute('aria-labelledby',task?'list-task':'list-event');organized.innerHTML='<div class="organized-row '+(task&&taskDone?'completed':'')+'"><button class="check-item" aria-label="'+(task?'신청서 제출 '+(taskDone?'완료 취소':'완료'):'워크숍 일정 상세 보기')+'" '+(task?'aria-pressed="'+taskDone+'"':'')+'>'+(task?(taskDone?'✓':''):'↗')+'</button><div><span class="row-kind '+(task?'':'event')+'">'+(task?'할 일':'일정')+'</span><h3>'+(task?'워크숍 신청서 제출':'코딩 워크숍 참석')+'</h3><p>'+(task?'11월 20일 · 오후 4시까지':'11월 24일 · 오후 3시')+'</p><p>'+(task?'담임 선생님께 제출':'컴퓨터실 · 노트북, 충전기')+'</p></div></div>';document.querySelector('#organized-note').textContent=task?'신청서에 보호자 서명 받기':'노트북 충전하고 챙기기';organized.querySelector('button').onclick=()=>{if(task){taskDone=!taskDone;renderOrganized();organized.querySelector('button').focus({preventScroll:true});}else location.href='/experience/select/';};}
const kinds=[...document.querySelectorAll('[data-kind]')];kinds.forEach((button,index)=>{button.addEventListener('click',()=>{organizedKind=button.dataset.kind;kinds.forEach(b=>{b.setAttribute('aria-selected',String(b===button));b.tabIndex=b===button?0:-1;});renderOrganized();});button.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-index;kinds[next].click();kinds[next].focus();}});});renderOrganized();
const startButton=document.querySelector('.nav-try'),startMenu=document.querySelector('#start-menu');
function closeStart(){if(!startMenu)return;startMenu.hidden=true;startButton.setAttribute('aria-expanded','false');}
startButton?.addEventListener('click',()=>{const open=startMenu.hidden;closeMenu();startMenu.hidden=!open;startButton.setAttribute('aria-expanded',String(open));});
menuButton?.addEventListener('click',closeStart);
startMenu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeStart));
document.addEventListener('click',e=>{if(startMenu&&!startMenu.hidden&&!e.target.closest('.start-wrap'))closeStart();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&startMenu&&!startMenu.hidden){closeStart();startButton.focus();}});
const helpSearch=document.querySelector('#help-search');helpSearch?.addEventListener('input',()=>{const q=helpSearch.value.trim().toLocaleLowerCase().replace(/\s+/g,'');let matches=0;document.querySelectorAll('[data-search]').forEach(card=>{const match=card.dataset.search.toLocaleLowerCase().replace(/\s+/g,'').includes(q);card.hidden=!match;if(match)matches++;});document.querySelector('#help-empty').hidden=matches>0;});

})();
