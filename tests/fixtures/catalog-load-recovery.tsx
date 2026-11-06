import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createRootRoute,createRouter,createMemoryHistory,RouterProvider} from '@tanstack/react-router';
import {ThemeProvider,useTheme} from '/src/components/ThemeProvider.tsx';
import {LanguageProvider} from '/src/lib/i18n.tsx';
import {InterfaceMotion} from '/src/components/motion/provider.tsx';
import {CatalogView} from '/src/routes/catalog.tsx';
import {RouteError} from '/src/components/RouteError.tsx';
import {getCatalog} from '/src/lib/catalog.functions.ts';
const data=await getCatalog();
function App(){const theme=useTheme();if((window as any).__simulateChunkFailure)throw new TypeError('Failed to fetch dynamically imported module: /assets/old-catalog.js');return <><button onClick={()=>theme.setMode('dark')}>Owner dark theme</button>{!(window as any).__ownerOnly&&<CatalogView data={data}/>}</>}
const route=createRootRoute({errorComponent:RouteError,component:()=> <ThemeProvider><InterfaceMotion><LanguageProvider><App/></LanguageProvider></InterfaceMotion></ThemeProvider>});
const client=new QueryClient();
const router=createRouter({routeTree:route,history:createMemoryHistory({initialEntries:['/']})});
// Reuse the root if the dev transform re-evaluates this entry during dependency scanning.
const target=window as typeof window & {__loadAuditRoot?:ReturnType<typeof createRoot>};
target.__loadAuditRoot??=createRoot(document.getElementById('root')!);
target.__loadAuditRoot.render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
