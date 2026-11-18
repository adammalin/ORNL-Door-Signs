// Optional same-origin bridge. The public GitHub Pages app needs no companion.
export async function connectCompanion({applyDesign,applyView,applyTutorial,onConflict,onStatus}) {
  if(!['127.0.0.1','localhost'].includes(location.hostname))return null;
  try{
    const response=await fetch('/api/status');if(!response.ok)return null;
    const status=await response.json();if(status.app!=='ornl-door-signs-companion')return null;
  }catch{return null;}
  let current,applying=false,timer,pending=false,queue=Promise.resolve(),pendingDesign=null;
  const read=async()=>{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)throw new Error('Companion disconnected.');return response.json();};
  const apply=async session=>{
    if(pending)return;
    const old=current;current=session;applying=true;
    try{
      if(!old||old.active.id!==session.active.id||old.active.revision!==session.active.revision)await applyDesign(session.active.design);
      if(!old||JSON.stringify(old.view)!==JSON.stringify(session.view))applyView(session.view);
      if(old&&session.tutorial.action!=='none'&&old.tutorial.sequence!==session.tutorial.sequence)applyTutorial(session.tutorial);
      onStatus(`Agent companion connected · ${session.active.name}`);
    }finally{applying=false;}
  };
  await apply(await read());
  const interval=setInterval(()=>{if(!pending)read().then(apply).catch(()=>onStatus('Agent companion disconnected'));},1200);
  window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
  const post=async(route,body)=>{
    const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Companion request failed.'),{status:response.status});return data;
  };
  return {
    save(design){
      if(applying||!current)return;
      pending=true;pendingDesign=design;clearTimeout(timer);
      timer=setTimeout(()=>{
        queue=queue.then(async()=>{
          try{
            while(pendingDesign){
              const nextDesign=pendingDesign;pendingDesign=null;
              current=await post('/api/design',{id:current.active.id,patch:designPatch(nextDesign),expectedRevision:current.active.revision});
            }
          }catch(error){
            pendingDesign=null;
            if(error.status===409){onConflict('An agent updated this sign while you were editing. The latest version is loaded; your previous text remains in Undo.');current=null;}
            else onConflict(error.message);
          }finally{pending=false;await apply(await read());}
        }).catch(error=>{pending=false;onStatus(error.message);});
      },250);
    },
    filters(view){if(!applying)post('/api/view',view).then(session=>{current={...session,active:current.active};}).catch(error=>onStatus(error.message));},
    getState:()=>current,
  };
}
function designPatch(design){const {app,version,...patch}=design;return patch;}
