import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { registerSW } from 'virtual:pwa-register';
import { queryClient } from './lib/api';
import { ToastProvider } from './components/toast';
import { App } from './App';
import { installKeyboard } from './lib/keyboard';
import './styles.css';

registerSW({ immediate: true });
installKeyboard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Honour the OS "reduce motion" setting everywhere: transforms are skipped, opacity still fades. */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
