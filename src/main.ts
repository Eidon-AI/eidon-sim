import './globals.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { mount } from './ui/App';
import { UpdatePage } from './ui/pages/UpdatePage';

window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root')!;
  
  // Simple routing check
  const path = window.location.pathname;
  if (path === '/update' || path === '/app/update') {
    const updatePage = new UpdatePage();
    updatePage.mount(root);
  } else {
    mount(root);
  }
});
