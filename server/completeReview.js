// Criteria in the first reply are positional. A short list cannot be aligned safely.
export async function completeReview(raw, names, ids, request) {
  const initial = raw && typeof raw === 'object' ? raw : {};
  const validCriterion = c => c && [0,1,2,null].includes(c.wert) && typeof c.grund === 'string' && c.grund.trim();
  const validCounter = c => c && ids.includes(c.id) && ['stützt','unklar','nicht_relevant','widerspricht'].includes(c.urteil) && typeof c.grund === 'string' && c.grund.trim();
  const items = Array.isArray(initial.kriterien) && initial.kriterien.length === names.length ? [...initial.kriterien] : Array(names.length).fill(null);
  const counters = Array.isArray(initial.gegenbelege) ? initial.gegenbelege : [];
  const verified = new Map();
  for (const c of counters.filter(validCounter)) {
    if (counters.filter(x=>x?.id===c.id).length===1) verified.set(c.id,c);
  }
  const required = names.filter((name,i)=>!validCriterion(items[i]));
  const missingIds = ids.filter(id=>!verified.has(id));
  let conflict = initial.widerspruch;
  const reportedConflict = counters.find(c=>validCounter(c) && c.urteil==='widerspricht');
  if (reportedConflict) conflict=true;
  const needsConflict = typeof conflict !== 'boolean';
  let attempted=false, hint=initial.hinweis;
  if (reportedConflict && !hint) hint=reportedConflict.grund;
  if (conflict!==true && (required.length || missingIds.length || needsConflict)) {
    attempted=true;
    try {
      const supplement=await request({kriterien:required,pflichtpruefung:missingIds,widerspruch_pruefen:needsConflict});
      const supplementaryCriteria=Array.isArray(supplement?.kriterien)?supplement.kriterien:[];
      const supplementaryCounters=Array.isArray(supplement?.gegenbelege)?supplement.gegenbelege:[];
      for(const name of required){
        const entries=supplementaryCriteria.filter(c=>c?.name===name);
        if(entries.length===1 && validCriterion(entries[0]))items[names.indexOf(name)]=entries[0];
      }
      for(const id of missingIds){
        const entries=supplementaryCounters.filter(c=>c?.id===id);
        if(entries.length===1 && validCounter(entries[0]))verified.set(id,entries[0]);
      }
      const contrary=supplementaryCounters.find(c=>validCounter(c)&&c.urteil==='widerspricht');
      if(contrary || supplement?.widerspruch===true){conflict=true;hint=supplement?.hinweis||contrary?.grund;}
      else if(needsConflict && supplement?.widerspruch===false)conflict=false;
    }catch { /* The initial assessments remain available if the supplement fails. */ }
  }
  const open=[];
  const pending=names.filter((name,i)=>!validCriterion(items[i]));
  if(pending.length)open.push(pending.length===names.length?'Die Zuordnung der 20 Prüfkriterien ist offen.':'Offene Kriterien: '+pending.join(', ')+'.');
  if(verified.size<ids.length)open.push('Noch zu prüfen: '+(ids.length-verified.size)+' von '+ids.length+' möglichen Gegenbelegen.');
  if(typeof conflict!=='boolean')open.push('Die Aussage von KI 2 zu möglichen Widersprüchen steht aus.');
  return {judgment:{...initial,widerspruch:conflict,hinweis:hint,kriterien:items,gegenbelege:[...verified.values()]},open,attempted};
}
