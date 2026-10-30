import { ATTENDANCE_MILESTONES, ATTENDANCE_WEEK, canClaim, dayKey } from './attendance';
import { CHARACTERS } from './characters';
import { MODAL_CLOSE_MS } from './game/hud';
import { robotPortraitUrl } from './graphics/robot-art';
import { claimAttendance, getPlayerProgress, ITEMS } from './progress';

const icon = (name: string) => `<i class="icon icon-${name}" aria-hidden="true"></i>`;
const rewardIcon = (name: string) => name === 'coin' ? '<i class="coin-icon" aria-hidden="true"></i>' : icon(name);
const burst = `<i class="claim-burst" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<b style="--i:${i}"></b>`).join('')}</i>`;

// Weekly attendance card over the lobby: today's cell is the claim button. onClose gets whether a reward was claimed.
export function openAttendance(onClose: (claimed: boolean) => void) {
  const overlay = document.createElement('div');
  overlay.className = 'attendance-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '출석 체크');
  const card = document.createElement('div');
  card.className = 'result-card attendance-card';
  overlay.append(card);
  let claimed = false;

  const render = (note = '') => {
    const { attendance } = getPlayerProgress();
    const open = canClaim(attendance, dayKey());
    // Show the week in progress; right after the 7th claim, the finished week.
    const done = open ? attendance.days % 7 : (attendance.days - 1) % 7 + 1;
    const days = ATTENDANCE_WEEK.map((reward, index) => {
      const state = index < done ? 'claimed' : index === done && open ? 'today' : 'later';
      const fresh = claimed && index === done - 1;
      const claim = state === 'today' ? `<button type="button" class="day-claim" aria-label="DAY ${index + 1} 보상 받기"><span>받기</span></button>` : '';
      const effect = fresh ? `${burst}<span class="claim-float" aria-hidden="true">+${reward.coins || reward.label}</span>` : '';
      return `<li class="day-cell" data-state="${state}"${fresh ? ' data-fresh' : ''}><span class="day-label">DAY ${index + 1}</span>${rewardIcon(reward.icon)}<strong>${reward.label}</strong>${claim}${effect}</li>`;
    }).join('');
    const milestones = ATTENDANCE_MILESTONES.map((total) => {
      const robot = CHARACTERS.find(({ unlock }) => unlock.kind === 'attendance' && unlock.days === total);
      if (!robot) return '';
      return `<li class="${attendance.days >= total ? 'got' : ''}"><img src="${robotPortraitUrl(robot)}" alt="${robot.name}"><span>${total}일</span></li>`;
    }).join('');
    card.innerHTML = `<i class="result-badge" aria-hidden="true"></i><h1>출석 체크</h1><p class="attendance-total">총 ${attendance.days}일 출석</p>`
      + `<ul class="attendance-days">${days}</ul>`
      + `<p class="attendance-note">${note || '누적 출석 보상'}</p><ul class="attendance-milestones">${milestones}</ul>`
      + '<button type="button" class="attendance-close">닫기</button>';
    card.querySelector<HTMLButtonElement>(open ? '.day-claim' : '.attendance-close')?.focus({ preventScroll: true });
  };

  const close = () => {
    if (overlay.classList.contains('modal-closing')) return;
    window.removeEventListener('keydown', onKey, true);
    overlay.classList.add('modal-closing');
    window.setTimeout(() => overlay.remove(), MODAL_CLOSE_MS);
    onClose(claimed);
  };
  const onKey = (event: KeyboardEvent) => { if (event.code === 'Escape') { event.stopPropagation(); close(); } };
  overlay.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target === overlay || target.closest('.attendance-close')) { close(); return; }
    if (!target.closest('.day-claim')) return;
    const result = claimAttendance(dayKey());
    if (!result) return;
    claimed = true;
    // Redraws after this keep the card still so only the claimed cell animates.
    card.dataset.settled = '';
    const gains = [
      ...(result.reward.coins ? [`코인 +${result.reward.coins}`] : []),
      ...result.reward.items.map((id) => `${ITEMS[id].name} +1`),
      ...(result.robot ? [`${result.robot.name} 획득!`] : []),
    ];
    render(gains.join(' · '));
  });
  window.addEventListener('keydown', onKey, true);
  render();
  document.body.append(overlay);
}
