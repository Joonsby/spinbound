// TEMPORARY mock ads until Apps in Toss ads (TossAds / GoogleAdMob) are connected.
// The game only calls showRewardedAd(); the banner is a fixed slot in index.html (#ad-banner-slot).
// Replacing the provider later only touches this file and that slot.

const MOCK_AD_SECONDS = 3;

// Resolves true when the ad was watched to the end (grant the reward), false when it was closed early.
export function showRewardedAd(purpose: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ad-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '광고');
    overlay.innerHTML = '<div class="ad-card"><span class="ad-tag">광고 · 테스트</span><p class="ad-purpose"></p><p class="ad-timer" aria-live="polite"></p><button type="button" class="ad-close">닫기</button></div>';
    const purposeText = overlay.querySelector<HTMLElement>('.ad-purpose')!;
    const timerText = overlay.querySelector<HTMLElement>('.ad-timer')!;
    const button = overlay.querySelector<HTMLButtonElement>('.ad-close')!;
    purposeText.textContent = purpose;
    let left = MOCK_AD_SECONDS;
    const render = () => {
      timerText.textContent = left > 0 ? `${left}초 후 보상을 받을 수 있어요` : '광고 시청 완료';
      button.textContent = left > 0 ? '닫기 (보상 없음)' : '보상 받기';
      button.classList.toggle('ad-done', left <= 0);
    };
    const timer = window.setInterval(() => { left -= 1; render(); if (left <= 0) window.clearInterval(timer); }, 1000);
    button.addEventListener('click', () => {
      window.clearInterval(timer);
      overlay.remove();
      resolve(left <= 0);
    });
    render();
    document.body.append(overlay);
    button.focus({ preventScroll: true });
  });
}
