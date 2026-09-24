import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import Popup from './Popup';
import { ErrorBoundary } from '@/components/ui/error-boundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Popup />
    </ErrorBoundary>
  </StrictMode>,
);
