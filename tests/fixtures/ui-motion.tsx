
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import {InterfaceMotion} from '/src/components/motion/provider.tsx';
import {AnimatedTabs} from '/src/components/motion/animated-tabs.tsx';
import {SuccessMark} from '/src/components/motion/success-mark.tsx';
import {CatalogHero} from '/src/components/CatalogHero.tsx';
import {HERO_DEFAULTS} from '/src/lib/catalog-hero.ts';
import {PageHeader} from '/src/components/PageHeader.tsx';
function Demo(){const [tab,setTab]=React.useState('Summary');const [success,setSuccess]=React.useState(false);return React.createElement(InterfaceMotion,null,React.createElement('main',{style:{maxWidth:1000,margin:'auto',padding:16}},React.createElement(PageHeader,{title:'Accounting',subtitle:'Synthetic UI preview — no transactions'}),React.createElement(AnimatedTabs,{value:tab,options:['Summary','Profit & Loss','Cash Book'],onChange:setTab,label:v=>v}),React.createElement('p',{id:'selected'},tab),React.createElement('button',{onClick:()=>setSuccess(v=>!v)},'Toggle success'),success&&React.createElement('div',{id:'success',style:{padding:24}},React.createElement(SuccessMark),React.createElement('p',{style:{textAlign:'center'}},'Bill saved · DEMO ₹799')),React.createElement(CatalogHero,{hero:{...HERO_DEFAULTS,heading:'Fresh pairs. Better prices.',image:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><path d="M100 340L150 190L330 260L550 280L690 350L670 400L100 400Z" fill="#e8e4d8" stroke="#234a3c" stroke-width="10"/><path d="M180 230L340 290M170 260L310 315M150 290L280 340" stroke="#234a3c" stroke-width="12"/></svg>')},onAction:()=>{window.heroClicked=true}})))}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Demo));window.testReady=true;
