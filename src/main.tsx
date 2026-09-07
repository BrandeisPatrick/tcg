// QA virtual clock — must be the first import so its rAF/timer overrides are
// in place before framer-motion captures them. Inert without ?vtclock=1.
import './qa/vtclock';
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { Root } from './Root';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/saira/index.css';
import '@fontsource/saira-stencil-one/400.css';
import '@fontsource/caveat-brush/400.css';
import './ui/styles.css';

// QA-only surface — lazy so players never download the gallery's demo code.
const PreviewGallery = React.lazy(() =>
  import('./ui/PreviewGallery').then((m) => ({ default: m.PreviewGallery }))
);

const params = new URLSearchParams(window.location.search);
const isPreview = params.get('preview') === '1';

window.addEventListener('contextmenu', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isPreview
      ? <Suspense fallback={null}><PreviewGallery /></Suspense>
      : <Root />}
  </React.StrictMode>,
);
