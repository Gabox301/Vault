// Vault — ui/pagination.js
// Paginado reutilizable, vanilla, sin estado global.
// PAGE_SIZE por defecto 5 como pide el producto.

export const PAGE_SIZE = 5;
export const GROUPS_PAGE_SIZE = 7;

/**
 * Tamaño elástico según alto de ventana: 720px → min, 1080px → max.
 * Evita hueco ocioso al maximizar sin romper paginado en mínimo (1100x720).
 */
export function getAdaptivePageSize({ min = 5, max = 12 } = {}) {
  const h = window.innerHeight || 720;
  const minH = 720;
  const maxH = 1080;
  const ratio = Math.max(0, Math.min(1, (h - minH) / (maxH - minH)));
  return Math.max(min, Math.min(max, Math.round(min + ratio * (max - min))));
}

/**
 * Paginado puro (sin DOM).
 * @param {Array} items
 * @param {number} page - 0-based
 * @param {number} pageSize
 * @returns {{ pageItems: Array, totalPages: number, currentPage: number }}
 */
export function paginate(items, page, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  const start = currentPage * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages: items.length ? totalPages : 0,
    currentPage,
  };
}

/**
 * Renderiza controles de paginación dentro de `container`.
 * Si solo hay 1 página, lo oculta.
 * @param {HTMLElement} container - div.pagination (se crea si no existe)
 * @param {number} totalPages
 * @param {number} currentPage - 0-based
 * @param {(newPage:number)=>void} onChange
 */
export function renderPagination(container, totalPages, currentPage, onChange) {
  if (!container) return;
  container.innerHTML = '';
  if (totalPages <= 1) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  container.setAttribute('role', 'navigation');
  container.setAttribute('aria-label', 'Paginación');

  const first = document.createElement('button');
  first.type = 'button';
  first.className = 'pagination-btn';
  first.textContent = '«';
  first.setAttribute('aria-label', 'Primera página');
  first.disabled = currentPage === 0;
  first.addEventListener('click', () => onChange(0));
  container.appendChild(first);

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'pagination-btn';
  prev.textContent = '‹';
  prev.setAttribute('aria-label', 'Página anterior');
  prev.disabled = currentPage === 0;
  prev.addEventListener('click', () => onChange(currentPage - 1));
  container.appendChild(prev);

  // Ventana compacta: 3 números centrados, first/last son botones dedicados
  const maxVisible = 3;
  let startPage, endPage;
  if (totalPages <= maxVisible + 2) {
    // pocas páginas: first + ventana central + last sin duplicar
    startPage = 1;
    endPage = Math.max(1, totalPages - 1);
  } else {
    // ventana central excluyendo primera y última (ya tienen botón dedicado)
    startPage = Math.max(1, currentPage - 1);
    endPage = Math.min(totalPages - 1, startPage + maxVisible);
    if (endPage - startPage < maxVisible) startPage = Math.max(1, endPage - maxVisible);
    if (startPage > 1) {
      const ell = document.createElement('span');
      ell.className = 'pagination-ellipsis';
      ell.textContent = '…';
      container.appendChild(ell);
    }
    for (let i = startPage; i < endPage; i++) {
      container.appendChild(pageButton(i, currentPage, onChange));
    }
    if (endPage < totalPages - 1) {
      const ell = document.createElement('span');
      ell.className = 'pagination-ellipsis';
      ell.textContent = '…';
      container.appendChild(ell);
    }
    // first/last ya están, no añadir más
    // Renderizamos solo ventana central, first/last quedan como extremos
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'pagination-btn';
    next.textContent = '›';
    next.setAttribute('aria-label', 'Página siguiente');
    next.disabled = currentPage >= totalPages - 1;
    next.addEventListener('click', () => onChange(currentPage + 1));
    container.appendChild(next);

    const last = document.createElement('button');
    last.type = 'button';
    last.className = 'pagination-btn';
    last.textContent = '»';
    last.setAttribute('aria-label', 'Última página');
    last.disabled = currentPage >= totalPages - 1;
    last.addEventListener('click', () => onChange(totalPages - 1));
    container.appendChild(last);

    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `${currentPage + 1} / ${totalPages}`;
    info.setAttribute('aria-live', 'polite');
    container.appendChild(info);
    return;
  }

  for (let i = startPage; i < endPage; i++) {
    container.appendChild(pageButton(i, currentPage, onChange));
  }

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'pagination-btn';
  next.textContent = '›';
  next.setAttribute('aria-label', 'Página siguiente');
  next.disabled = currentPage >= totalPages - 1;
  next.addEventListener('click', () => onChange(currentPage + 1));
  container.appendChild(next);

  const last = document.createElement('button');
  last.type = 'button';
  last.className = 'pagination-btn';
  last.textContent = '»';
  last.setAttribute('aria-label', 'Última página');
  last.disabled = currentPage >= totalPages - 1;
  last.addEventListener('click', () => onChange(totalPages - 1));
  container.appendChild(last);

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = `${currentPage + 1} / ${totalPages}`;
  info.setAttribute('aria-live', 'polite');
  container.appendChild(info);
}

function pageButton(pageIndex, currentPage, onChange) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pagination-btn' + (pageIndex === currentPage ? ' is-active' : '');
  btn.textContent = String(pageIndex + 1);
  btn.setAttribute('aria-label', `Página ${pageIndex + 1}`);
  btn.setAttribute('aria-current', pageIndex === currentPage ? 'page' : 'false');
  if (pageIndex !== currentPage) {
    btn.addEventListener('click', () => onChange(pageIndex));
  } else {
    btn.disabled = true;
  }
  return btn;
}

/**
 * Debounce simple para resize.
 * @param {Function} fn
 * @param {number} ms
 */
export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Helper: obtiene o crea el div.pagination hermano del list container.
 * @param {HTMLElement} listEl - ej. #commands-list
 * @param {string} id - id para el nuevo div si se crea
 * @returns {HTMLElement}
 */
export function getOrCreatePaginationEl(listEl, id) {
  if (!listEl) return null;
  let el = document.getElementById(id);
  if (el) return el;
  // buscar hermano pagination existente
  let sibling = listEl.nextElementSibling;
  if (sibling && sibling.classList.contains('pagination')) return sibling;
  el = document.createElement('div');
  el.id = id;
  el.className = 'pagination hidden';
  listEl.insertAdjacentElement('afterend', el);
  return el;
}
