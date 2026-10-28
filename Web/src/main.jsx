import { createRoot } from 'react-dom/client';
import './lumina.css';
import './grimiau.css';
import App from './App';
import { applyAppearance } from './lib/theme.js';

applyAppearance();
createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
