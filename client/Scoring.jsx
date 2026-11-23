import React from 'react';
import {SlidersHorizontal} from 'lucide-react';
import {criterionNames, defaults} from '../shared/scoring.js';

export function Scoring({threshold, standard, setThreshold, weights, setWeights, busy}) {
  const total = weights.reduce((n,w)=>n+Number(w),0);
  return <details className="scoreSettings"><summary><SlidersHorizontal size={17}/> Quellenbewertung <strong>{threshold} / 100</strong></summary>
    <fieldset disabled={busy}><label>Gesamtschwelle <small>Standard {standard}</small>
    <input type="range" min="0" max="100" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label>
    <p>Mögliche Gegenbelege bleiben auch unterhalb der Schwelle im Prüfkontext.</p>
    {criterionNames.map((name,i)=><label key={name}>{name}<small>Standard {defaults[i]}</small>
    <input type="number" min="0" max="100" aria-label={name} value={weights[i]} onChange={e=>setWeights(weights.map((w,j)=>i===j?(e.target.value===''?'':Number(e.target.value)):w))}/></label>)}
    <footer><span aria-live="polite">Summe {total} / 100</span><button type="button" className="textBtn" onClick={()=>{setThreshold(standard);setWeights(defaults);}}>Standard wiederherstellen</button></footer>
    </fieldset></details>;
}
