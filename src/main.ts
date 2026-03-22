import './globals.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { mount, mountSampleData } from './ui/App';
import { UpdatePage } from './ui/pages/UpdatePage';
import { DebugPage } from './ui/pages/DebugPage';
import { DeleteRequestPage } from './ui/pages/DeleteRequestPage';
import { LabelPage } from './ui/pages/LabelPage';

window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root')!;

  // Simple routing check
  const path = window.location.pathname;
  if (path === '/update' || path === '/app/update') {
    const updatePage = new UpdatePage();
    updatePage.mount(root);
  } else if (path === '/debug' || path === '/app/debug') {
    const debugPage = new DebugPage();
    debugPage.mount(root);
  } else if (path === '/delete' || path === '/app/delete') {
    const deleteRequestPage = new DeleteRequestPage();
    deleteRequestPage.mount(root);
  } else if (path === '/label' || path === '/app/label') {
    const labelPage = new LabelPage();
    labelPage.mount(root);
  } else if (path === '/sample-data' || path === '/app/sample-data') {
    mountSampleData(root);
  } else {
    mount(root);
  }
});
