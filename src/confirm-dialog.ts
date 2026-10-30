// Yes/no card over everything else (pause menu included). Resolves true only on the confirm button;
// cancel, Escape or a tap outside the card resolve false. Focus starts on cancel, the safe choice.
export function confirmDialog(options: { title: string; message: string; confirm: string; cancel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = '<div class="result-card confirm-card"><h1></h1><p></p><div class="confirm-actions"><button type="button" class="confirm-cancel"></button><button type="button" class="confirm-ok"></button></div></div>';
    const title = overlay.querySelector('h1')!;
    const message = overlay.querySelector('p')!;
    const cancel = overlay.querySelector<HTMLButtonElement>('.confirm-cancel')!;
    const ok = overlay.querySelector<HTMLButtonElement>('.confirm-ok')!;
    title.textContent = options.title;
    message.textContent = options.message;
    cancel.textContent = options.cancel ?? '취소';
    ok.textContent = options.confirm;
    overlay.setAttribute('aria-label', options.title);
    const close = (answer: boolean) => {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(answer);
    };
    // Capture phase, so the game's own Escape/P handling never sees these keys.
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.code === 'Escape') close(false);
    };
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(false); });
    window.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    cancel.focus({ preventScroll: true });
  });
}
