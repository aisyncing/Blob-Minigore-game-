// Controller navigation for the pause-menu settings panel: move a highlight through the buttons, section headers and settings,
// adjust the highlighted setting left and right, press it with A. It drives the same DOM controls the mouse uses, so every
// setting works the same either way.
const SEL = 'nav-sel';
const ITEMS = '#pauseHead button, summary, .row, .actions button, .actions select, label.chk';

export function createPanelNav(panel, { now = () => performance.now() } = {}) {
  let sel = null, streak = 0, lastAdjust = 0, lastDir = 0;
  const visible = el => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
  const items = () => [...panel.querySelectorAll(ITEMS)].filter(visible);
  const control = el => el && (el.matches('select') ? el : el.matches('.row') ? el.querySelector('input, select') : el.matches('label.chk') ? el.querySelector('input') : null);

  function select(el) {
    if (sel) sel.classList.remove(SEL);
    sel = el; if (!el) return;
    el.classList.add(SEL); el.scrollIntoView?.({ block: 'nearest' });
  }
  function ensure() { const all = items(); if (!sel || !all.includes(sel)) select(all[0] || null); return all; }

  /** step a range input by `dir` steps, bigger steps the longer it is held, never more than a tenth of its range at once */
  function bump(input, dir) {
    const t = now(); streak = dir === lastDir && t - lastAdjust < 260 ? streak + 1 : 0; lastDir = dir; lastAdjust = t;
    const min = +input.min, max = +input.max, step = +input.step || 1, mult = Math.max(1, Math.min(streak < 6 ? 1 : streak < 16 ? 3 : 8, Math.floor((max - min) / step / 10)));
    const v = Math.min(max, Math.max(min, Math.round((+input.value + dir * step * mult) / step) * step));
    if (v === +input.value) return; input.value = String(+v.toFixed(6)); input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return {
    get selected() { return sel; },
    items,
    /** open the menu with the first item highlighted */
    reset() { select(null); ensure(); },
    clear() { select(null); },
    move(dir) {
      const all = ensure(); if (!all.length) return;
      select(all[Math.min(all.length - 1, Math.max(0, all.indexOf(sel) + dir))]);
    },
    adjust(dir) {
      ensure(); const c = control(sel); if (!c) return;
      if (c.type === 'range') bump(c, dir);
      else if (c.type === 'checkbox') { const want = dir > 0; if (c.checked !== want) { c.checked = want; c.dispatchEvent(new Event('change', { bubbles: true })); } }
      else if (c.tagName === 'SELECT') { const i = Math.min(c.options.length - 1, Math.max(0, c.selectedIndex + dir)); if (i !== c.selectedIndex) { c.selectedIndex = i; c.dispatchEvent(new Event('change', { bubbles: true })); } }
    },
    /** A: buttons and section headers click, checkboxes flip */
    press() {
      ensure(); if (!sel) return;
      const c = control(sel);
      if (c && c.type === 'checkbox') { c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (!c) sel.click();
    },
  };
}
