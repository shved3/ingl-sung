import React from 'react';
import { ArrowLeft, ArrowRight, BookOpen, FileText, Layers, LockKeyhole, ShieldCheck } from 'lucide-react';

const workspaceUrl = '/?bereich=intern';
const question = 'Wie hat sich der Umsatz von Nordhafen verändert?';
const sources = [
  {
    name: 'Nordhafen · Jahresübersicht 2024',
    location: 'S. 2 · Abs. 1',
    quote: 'Der Nettoumsatz der Nordhafen GmbH lag im Geschäftsjahr 2024 bei 42,0 Mio. EUR.'
  },
  {
    name: 'Nordhafen · Jahresübersicht 2025',
    location: 'S. 2 · Abs. 1',
    quote: 'Der Nettoumsatz der Nordhafen GmbH lag im Geschäftsjahr 2025 bei 46,2 Mio. EUR.'
  }
];

function Method() {
  return <ol className="entrySteps">
    <li><b>Zugriff prüfen</b><p>Der Code bestimmt anhand der Rolle und bestehender Freigaben, welche Unterlagen für die Anfrage verwendet werden dürfen.</p></li>
    <li><b>Fundstellen bewerten</b><p>Der Code bewertet auffindbare Fundstellen. Mögliche Gegenbelege bleiben auch unterhalb der Punkteschwelle im Prüfkontext.</p></li>
    <li><b>Analyst</b><p>Der erste KI-Agent erstellt einen Antwortentwurf und nennt die Fundstellen, die seine Aussagen belegen. Der Code gleicht Zitate mit dem Originalwortlaut ab.</p></li>
    <li><b>Auditor</b><p>Der zweite KI-Agent prüft, ob Antwort und Belege zusammenpassen, und meldet Widersprüche sowie fehlende Nachweise.</p></li>
    <li><b>Fachprüfung</b><p>Bei wichtigen Quellen ist eine Fachprüfung erforderlich. Die fachliche Entscheidung trifft eine zuständige Person.</p></li>
  </ol>;
}

function Example() {
  return <>
    <p className="entryHint">Fiktive Übungsdaten · Beispielhafter Prüfverlauf</p>
    <details className="entryExample">
      <summary><FileText size={19} /><b>{question}</b><span>Ergebnis ansehen</span></summary>
      <div className="entryExampleContent">
        <h2>Antwort von Analyst</h2>
        <p>Der Nettoumsatz stieg von 42,0 Mio. EUR im Jahr 2024 auf 46,2 Mio. EUR im Jahr 2025. Das entspricht einem Anstieg um 4,2 Mio. EUR beziehungsweise 10 %.</p>
        <h2>Belege</h2>
        {sources.map(source => <details key={source.name} className="entrySource">
          <summary>{source.name} <small>{source.location}</small></summary>
          <blockquote>{source.quote}</blockquote>
        </details>)}
        <h2>Prüfung durch Auditor</h2>
        <p>Die Fundstellen nennen dieselbe Kennzahl, Währung und Gesellschaft für zwei Geschäftsjahre. Der Rechenweg stimmt. Für eine Kreditentscheidung fehlen unter anderem Angaben zur Liquidität und zum Schuldendienst.</p>
        <details className="entrySource"><summary>So ist der Prüfverlauf aufgebaut</summary><Method /></details>
      </div>
    </details>
  </>;
}

export default function StartMenu({ section }) {
  const isExample = section === 'demo';
  if (section) return <div className="entry">
    <header><a className="entryBrand" href="/">Evidence</a><span>TUHH · Hochschulprojekt</span></header>
    <main className="entryContent entryDetail">
      <a className="entryBack" href="/"><ArrowLeft size={16} /> Startmenü</a>
      <h1>{isExample ? 'Prüffall Nordhafen' : 'So prüft Evidence'}</h1>
      {isExample ? <Example /> : <Method />}
    </main>
  </div>;
  return <div className="entry">
    <header><a className="entryBrand" href="/">Evidence</a><span>TUHH · Hochschulprojekt</span></header>
    <main className="entryContent">
      <span className="heroMark"><Layers size={29} strokeWidth={1.7} /></span>
      <h1>Evidence-Arbeitsplatz</h1>
      <p>Unterlagen auswerten, Belege prüfen und fachliche Entscheidungen vorbereiten.</p>
      <nav className="entryMenu" aria-label="Startmenü">
        <a className="entryCard entryFeatured" href="/?bereich=demo">
          <span className="square"><FileText /></span>
          <span><strong>Prüffall Nordhafen</strong><small>Demo ohne Anmeldung öffnen</small></span>
          <ArrowRight size={17} />
        </a>
        <a className="entryCard" href="/?bereich=ablauf">
          <span className="square"><BookOpen /></span>
          <span><strong>Prüfablauf</strong><small>Analyst, Auditor und Fachprüfung</small></span>
          <ArrowRight size={17} />
        </a>
        <a className="entryCard" href={workspaceUrl}>
          <span className="square"><LockKeyhole /></span>
          <span><strong>Geschützter Arbeitsbereich</strong><small>Dokumente, Freigaben und eigene Prüfungen</small></span>
          <ShieldCheck size={17} />
        </a>
      </nav>
    </main>
  </div>;
}
