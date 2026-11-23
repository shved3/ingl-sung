import React,{useState} from 'react';
import {startRegistration} from '@simplewebauthn/browser';

export function AccountFactor({enabled,api,refresh}){
  const [password,P]=useState(''),[codes,C]=useState([]),[error,E]=useState(''),[busy,B]=useState(false);
  async function register(event){
    event.preventDefault(); B(true); E('');
    try{
      const {options}=await api({action:'factorBegin',password});
      const response=await startRegistration({optionsJSON:options});
      const result=await api({action:'factorFinish',challenge:options.challenge,response});
      C(result.codes); P(''); await refresh();
    }catch(e){E(e.message);}finally{B(false);}
  }
  if(codes.length)return <section><h3>Wiederherstellungscodes sichern</h3><p>Jeder Code ersetzt einmal die Passkey-Bestätigung. Speichern Sie diese Codes jetzt in Ihrem Passwortmanager.</p><pre>{codes.join('\n')}</pre></section>;
  return <form onSubmit={register}><p>{enabled?'Aktiv. Ein Ersatz-Passkey ersetzt den bisherigen Schlüssel und die Wiederherstellungscodes.':'Optionaler Schutz mit Projektpasswort und persönlichem Passkey, etwa über Windows Hello oder einen Sicherheitsschlüssel.'}</p><label>Aktuelles Projektpasswort<input type="password" required autoComplete="current-password" value={password} onChange={e=>P(e.target.value)}/></label>{error && <p role="alert">{error}</p>}<button className="primary" disabled={busy}>{enabled?'Passkey ersetzen':'Passkey einrichten'}</button></form>;
}
