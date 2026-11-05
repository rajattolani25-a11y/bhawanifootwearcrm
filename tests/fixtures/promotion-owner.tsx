import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LanguageProvider} from '/src/lib/i18n.tsx';
import {CatalogPromotionSettings} from '/src/components/CatalogPromotionSettings.tsx';
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LanguageProvider><main className="mx-auto max-w-4xl p-5"><CatalogPromotionSettings fallback={<p>Legacy offer controls</p>}/></main></LanguageProvider></QueryClientProvider>);
