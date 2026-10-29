import { createRoot } from 'react-dom/client';
import './lumina.css';
import './grimiau.css';
import './redesign.css';
import './atualizacao.css';
import App from './App';
import { applyAppearance } from './lib/theme.js';
import { applyMotion } from './lib/motion.js';

applyAppearance();
applyMotion();
createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
