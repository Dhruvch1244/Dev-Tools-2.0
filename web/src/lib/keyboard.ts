// Phone keyboard behaviour, installed once for the whole app.
//
// iOS doesn't shrink the layout viewport for the on-screen keyboard, so anything position: fixed
// (bottom sheets, the tab bar, the + button) stays where it was — underneath the keyboard. We track
// the visual viewport instead and publish it as CSS variables:
//   --kb   height the keyboard covers at the bottom of the layout viewport (0 when closed)
//   --vvh  height of what's actually visible
//   html[data-kb]  set while typing with the keyboard up
// Sheets lift themselves by --kb; the tab bar and + button step aside (see styles.css).

const TEXT_INPUT = 'input:not([type=checkbox],[type=radio],[type=range],[type=file],[type=button],[type=submit]), textarea, select, [contenteditable=true], .cm-content';
const isTyping = (el: Element | null): el is HTMLElement => !!el && el.matches(TEXT_INPUT);
const numeric = (el: HTMLElement) => el instanceof HTMLInputElement && (el.type === 'number' || /^(numeric|decimal)$/.test(el.inputMode));

export function installKeyboard() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const touch = matchMedia('(pointer: coarse)').matches;

  if (vv) {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Pinch-zoom also shrinks the visual viewport, so only count it as a keyboard while a field has focus.
        const kb = isTyping(document.activeElement) ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
        root.style.setProperty('--kb', `${kb}px`);
        root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
        root.toggleAttribute('data-kb', kb > 120);
      });
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', () => setTimeout(update, 50));
    update();
  }

  document.addEventListener('focusin', (e) => {
    const el = e.target as Element;
    if (!touch || !isTyping(el)) return;
    // Tapping a number (weight, reps, amount) selects it, so typing replaces it instead of appending.
    if (numeric(el)) setTimeout(() => (el as HTMLInputElement).select(), 0);
    // Once the keyboard has finished sliding up, make sure the field isn't hidden behind it.
    setTimeout(() => document.activeElement === el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350);
  });

  // Return on a lone field (search boxes, weight) dismisses the keyboard — and fires its onBlur save.
  // Fields inside a <form> submit as usual; React handlers that preventDefault keep control.
  document.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || !(el instanceof HTMLInputElement) || el.form) return;
    if (!isTyping(el)) return;
    el.blur();
  });
}
