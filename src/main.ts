import './styles.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { mount } from './ui/App';

window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root')!;
  mount(root);
});