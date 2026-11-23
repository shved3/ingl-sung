// For a credit decision, present the operative wording itself. A condition,
// exception or negation in the source must survive into the displayed answer.
const credit = /kredit|darlehen|finanzierung|kreditantrag/i;
const decision = /ablehn|abzulehnen|genehmig|bewillig|verweig|gewähr|auszahl|freig[ae]|freizugeben|versag|zustimm|zulässig|untersag|verbot/i;
const modal = /\b(muss|müssen|darf|dürfen|kann|verpflichtet|berechtigt|verboten|zwingend|hat zu|soll)\b/i;
const normalize = text => text.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de');
function namedBank(text){
  // Prefer the party following the modal in a question ("Darf die Elbbank ...?").
  const pattern=/(?:\b(?:darf|muss|kann|dürfte|soll|ist)\s+(?:(?:die|der)\s+)?)?\b(ING(?:-DiBa)?|[\p{L}-]+bank|[\p{Lu}][\p{L}-]+\s+Bank)\b/giu;
  return [...text.matchAll(pattern)].map(m=>m[1]).filter(p=>! /^(die|der|eine|einer|welche|diese) Bank$/i.test(p))[0];
}
export function checkDecisionScope(result,question,sources){
  if(result.mode!=='KI' || !result.text)return;
  const statements=[result.text,result.reasoning,...(result.claims||[]).map(c=>c.text)].filter(Boolean);
  const decisionQuestion=credit.test(question) && decision.test(question);
  const categoricalAnswer=decisionQuestion && /^(?:ja|nein)\b/i.test(result.text);
  if(!categoricalAnswer && (!credit.test(question+' '+statements.join(' ')) || !statements.some(s=>decision.test(s)&&modal.test(s))))return;
  const party=namedBank(question) || namedBank(result.text);
  const gap=party?'Welche Vertragsregel gilt für '+party+', und sind ihre Voraussetzungen im konkreten Fall erfüllt?':'Welche Vertragspartei ist zur Entscheidung befugt, und unter welchen Voraussetzungen?';
  const quotes=[];
  if(party){
    const escaped=party.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const operative=new RegExp('^(?:die |der )?'+escaped+'(?: AG)?\\s+(?:muss|darf|ist verpflichtet|ist berechtigt)\\b','iu');
    for(const ref of result.refs||[]){
      // Match the full source paragraph as well as the quoted words. A clipped
      // quotation can drop "angeblich", a conditional prefix or an exception.
      const source=sources.find(s=>s.doc===ref.doc && s.position===ref.position);
      const passage=source?.quote?.trim();
      if(!passage || !operative.test(passage) || !decision.test(passage) || !normalize(passage).includes(normalize(ref.quote)))continue;
      if(!quotes.some(q=>q.text===passage))quotes.push({text:passage,ref});
    }
  }
  if(quotes.length && !result.warning && !result.missing){
    const statedDirectly=quotes.length===1 && normalize(result.text)===normalize(quotes[0].text)
      && !/\b(wenn|falls|sofern|soweit|außer|vorbehaltlich|vorausgesetzt|sobald|bei|nur|es sei denn)\b/i.test(quotes[0].text)
      && [...question.matchAll(/(?:Antrag|Kredit|Darlehen)\s+(?:Nr\.\s*)?([A-Z0-9]*[-/]?\d[\w/-]*)/giu)].some(m=>normalize(quotes[0].text).split(/[^\p{L}\d/-]+/u).includes(normalize(m[1])));
    if(statedDirectly){
      result.reasoning='Die zitierte Regel nennt sowohl '+party+' als auch den konkreten Vorgang im Wortlaut.';
      result.claims=[{text:quotes[0].text,kind:'dokumentiert',party,date:'',task:'',refs:[quotes[0].ref]}];
      return;
    }
    result.text='Für '+party+' lautet der zitierte Wortlaut: „'+quotes[0].text+'“';
    result.reasoning='Die Fundstelle nennt '+party+' ausdrücklich. Die Anwendung auf einen konkreten Kreditantrag erfordert die Prüfung aller Voraussetzungen.';
    result.claims=quotes.map(q=>({text:q.text,kind:'dokumentiert',party,date:'',task:gap,refs:[q.ref]}));
  }else{
    result.text=party?'Ob '+party+' den Kredit genehmigen darf oder ablehnen muss, bleibt offen.':'Welche Entscheidung die zuständige Bank treffen darf oder muss, bleibt offen.';
    result.reasoning='Aus den geprüften Angaben lässt sich für diesen Kreditantrag keine verbindliche Entscheidung ableiten.';
    result.claims=[{text:result.text,kind:'offen',party:party||'',date:'',task:gap,refs:[]}];
  }
  result.missing=true;
  result.score=null;
  result.gap=[result.gap,gap].filter(Boolean).join(' ');
}
