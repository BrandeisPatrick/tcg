import React from 'react';
import ReactDOM from 'react-dom/client';
import { Root } from './Root';
import { PreviewGallery } from './ui/PreviewGallery';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/exo-2/index.css';
import './ui/styles.css';

const params = new URLSearchParams(window.location.search);
const isPreview = params.get('preview') === '1';

window.addEventListener('contextmenu', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isPreview ? <PreviewGallery /> : <Root />}
  </React.StrictMode>,
);
