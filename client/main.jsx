import React from 'react';
import { createRoot } from 'react-dom/client';
import StartMenu from './StartMenu.jsx';
import Workspace from './Workspace.jsx';

const section = new URLSearchParams(window.location.search).get('bereich');
const page = section === 'intern' ? <Workspace /> : <StartMenu section={['demo', 'ablauf'].includes(section) ? section : null} />;
createRoot(document.querySelector('#root')).render(page);
