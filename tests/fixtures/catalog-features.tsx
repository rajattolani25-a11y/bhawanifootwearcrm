// Synthetic component fixture. Server functions are replaced by the browser test.
import React from "react";
import { createRoot } from "react-dom/client";
import { InterfaceMotion } from "/src/components/motion/provider.tsx";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { CatalogSpotlight } from "/src/components/CatalogSpotlight.tsx";
import { ProductDialog } from "/src/routes/catalog.tsx";
import { SuccessMark } from "/src/components/motion/success-mark.tsx";
import styles from "/src/routes/catalog.module.css";
const image = colour => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350"><path d="M80 250L120 120L230 180L410 200L520 260L500 300L80 300Z" fill="${colour}" stroke="#34594c" stroke-width="7"/></svg>`);
const products = ['Demo Sports','Demo Formal','Demo Casual'].map((article,i)=>({id:'demo'+i,brand:'Demo',article,category:'Gents',gender:null,color:'Cream',mrp:999,price:799,image:image(['#e5e1d5','#c9b49c','#c0d2ce'][i]),sizes:[{id:'size'+i,size:'7',available:true}]}));
const shop = {name:'Demo store',phone:null,address:null,booking:true,local:true,outside:false,local_charge:30,outside_charge:80,free_delivery_above:null,delivery_note:null,advance_percent:50,hold_hours:24};
function Demo(){const [product,setProduct]=React.useState(null);const [tone,setTone]=React.useState('Sports');const [success,setSuccess]=React.useState(false);return <InterfaceMotion><LanguageProvider><main className={styles.store} data-theme="light" data-tone={tone} style={{padding:20,maxWidth:1100,margin:'auto'}}><h1>Catalog presentation preview</h1><label>Type <select aria-label="Preview type" value={tone} onChange={e=>setTone(e.target.value)}><option>Sports</option><option>Formal</option></select></label><CatalogSpotlight products={products} onOpen={setProduct}/><button onClick={()=>setSuccess(v=>!v)}>Preview saved receipt</button>{success&&<div id="receipt-preview" className="rounded-xl border bg-card p-5 text-center"><SuccessMark/><p>Bill saved · DEMO-001</p><strong>₹799</strong></div>}<ProductDialog key={product?.id??'none'} product={product} all={products} onPick={setProduct} shop={shop} offerCode="" onClose={()=>setProduct(null)} onTrack={()=>{}}/></main></LanguageProvider></InterfaceMotion>}
createRoot(document.getElementById('root')).render(<Demo/>);
