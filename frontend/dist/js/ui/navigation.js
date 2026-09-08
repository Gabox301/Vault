// Vault — ui/navigation.js

export function wireNav() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

export function switchView(view) {
  document.querySelectorAll('.nav-item').forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach((v) => {
    const on = v.id === `view-${view}`;
    v.classList.toggle('active', on);
    // Sincroniza hidden + aria para lectores y para el nuevo markup con `hidden`
    v.hidden = !on;
    v.setAttribute('aria-hidden', on ? 'false' : 'true');
  });
}
