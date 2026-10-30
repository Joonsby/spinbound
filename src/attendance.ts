// Daily attendance: one claim per local calendar day. The weekly rewards repeat; robots come at
// set totals of days (CHARACTERS with an 'attendance' unlock). Pure data for the Node tests.

export type AttendanceItem = 'shield' | 'extra-heart' | 'magnet';
export type AttendanceReward = { coins: number; items: AttendanceItem[]; label: string; icon: string };
export type Attendance = { last: string; days: number };

const reward = (coins: number, items: AttendanceItem[], label: string, icon: string): AttendanceReward => ({ coins, items, label, icon });

export const ATTENDANCE_WEEK: AttendanceReward[] = [
  reward(200, [], '200', 'coin'),
  reward(0, ['shield'], '보호막', 'shield'),
  reward(300, [], '300', 'coin'),
  reward(0, ['magnet', 'extra-heart'], '자석·체력', 'magnet'),
  reward(500, [], '500', 'coin'),
  reward(0, ['shield', 'extra-heart', 'magnet'], '아이템 3종', 'box'),
  reward(1000, [], '1000', 'coin'),
];

// Total days of attendance that also hand out a robot.
export const ATTENDANCE_MILESTONES = [7, 14, 28];

// Local date as YYYY-MM-DD, so the day turns over at the player's midnight.
export function dayKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const canClaim = (attendance: Attendance, today: string) => attendance.last !== today;

// Reward for the next claim, after `days` claims so far.
export const nextReward = (days: number) => ATTENDANCE_WEEK[days % ATTENDANCE_WEEK.length];
