import { createRoot } from 'react-dom/client';
import './desktop.css';
import { DesktopApp } from './DesktopApp';

createRoot(document.getElementById('desktop-root')!).render(<DesktopApp />);
