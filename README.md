# Spinbound

Phaser 3 + TypeScript + Vite. Node.js 24 이상 (`nvm use`).

작은 로봇이 달리다 충분히 빨라지면 스스로 공으로 변해 구르고, 그 속도로 적과 보스를 들이받는 2D 횡스크롤 액션입니다.
조작은 왼쪽·오른쪽·점프 세 가지뿐입니다.

## 규칙

- 이동 ← → / A D · 점프 Space / ↑ (W). 짧게 누르면 낮게, 길게 누르면 높게 뜁니다. 같은 방향을 두 번 톡톡 누르면 그 자리에서 스핀 대시(바로 구르기 돌진, 재사용 0.9초). 점프 입력 버퍼·코요테 타임 각 100ms
- 자동 구르기: 한 방향으로 멈추지 않고 달리면 탄력이 붙어 약 1.8초 뒤 구르고, 부스터를 밟으면 즉시 구릅니다.
  진입 320 px/s · 해제 260 px/s 히스테리시스로 경계 속도에서 깜빡이지 않습니다
- 공격: 구르는 중 진행 방향의 적과 부딪히거나 위에서 떨어지며 밟으면 공격. 걷다가 옆으로 닿으면 피해와 넉백
- 기믹: 스프링(수직·대각), 부스터, 이동 발판, 줄 매달리기(점프해서 닿으면 잡고 점프로 놓기), 구르기로만 부서지는 벽
- 보스(Stage 3): 공격 예고 → 회피 → 약점 노출 → 구르기·밟기로 명중. 6회 명중으로 격파, 3페이즈

10개 스테이지: 새벽 초원의 대모험(학습용 재설계) → 위험한 다리 → 가속 돌파·기계 보스 → 바람의 언덕 → 버섯 숲길 → 용암 운반선 → 하늘 정원 → 깊은 숲의 질주 → 화산 심장부 → 마지막 새싹.
스테이지 전환 시 HP·점수·코인은 누적 유지하고, 마지막 스테이지에서 전체 클리어를 표시합니다. 저장 데이터 키와 형식은 이전 버전과 같습니다.

## 구조

| 경로 | 역할 |
|---|---|
| `src/main.ts` | Phaser.Game 부트스트랩 |
| `src/game/config.ts` | 이동·전투·기믹·보스 튜닝 상수 |
| `src/game/movement.ts` · `contact.ts` | 이동·점프·구르기 규칙과 접촉 판정. 엔진에 의존하지 않아 Node 에서 바로 테스트 |
| `src/game/input.ts` | 터치 버튼(멀티터치) + 키보드 → 프레임 입력 |
| `src/game/player.ts` · `player-animation.ts` | 플레이어 물리 상태 / 포즈→애니메이션 키. 충돌체(30×42)와 스프라이트(48×64) 크기 분리 |
| `src/game/enemies.ts` | 순찰·비행·돌진 몬스터 |
| `src/game/mechanics/` | 스프링·부스터, 이동 발판, 줄, 파괴 벽 |
| `src/game/boss.ts` | 보스 FORGE-06 |
| `src/game/camera.ts` · `hud.ts` | 속도 비례 전방 시야 카메라 / DOM HUD |
| `src/game/game-scene.ts` | 스테이지 조립, 접촉 처리, HP·점수 |
| `src/stages.ts` | 스테이지 데이터 |
| `src/visuals.ts` | 코드로 그리는 임시 텍스처. `robot-<pose>` 애니메이션 키만 등록하면 스프라이트 시트로 교체 가능 |
| `src/audio.ts` · `effects.ts` | 효과음·배경음 / 파티클·잔상·링 풀 |

## 테스트

```sh
npm test
```

Node 내장 테스트 러너(추가 의존성 없음)로 이동·구르기·접촉 규칙과 스테이지 데이터(구덩이 폭, 비행 적 높이,
발판·체크포인트 위치, 보스 아레나 부스터)를 검사합니다. CI 는 기존처럼 `npm run build:toss` 만 실행합니다.

개발 서버 주소에 `?debug=1` 을 붙이면 브라우저 콘솔에서 `window.__spinbound`(상태 조회·입력·텔레포트)와
`window.__spinboundClock.advance(ms)`(프레임 수동 진행)를 쓸 수 있습니다. 운영 빌드에는 포함되지 않습니다.

GitHub → Vercel 자동 배포:

- 커밋을 GitHub에 push하면 GitHub Actions가 Node.js 24에서 `npm ci`와 `npm run build:toss`를 실행합니다.
- Vercel Git 연동은 같은 push의 웹 빌드를 독립적으로 실행합니다. 빌드 실패 시 기존 프로덕션이 유지됩니다.
- `main`에 push하면 [프로덕션](https://sonic-runner-pi.vercel.app)이 자동 갱신되고, 다른 브랜치는 Preview 배포를 생성합니다.
- 로컬 `git add`·커밋만으로는 배포되지 않으며 원격 push가 필요합니다. 별도 Vercel 토큰을 저장소에 넣지 않습니다.

```sh
git add .
git commit -m "Update game"
git push origin main
```

일반 웹 실행·빌드:

```sh
npm ci
npm run dev
npm run build
npm run preview
```

성능 진단은 기본 OFF입니다. 개발 서버 주소에 `?perf=1`을 붙이면 FPS·프레임 시간,
활성/전체 객체 수·애니메이션 수·활성 Collider/Overlap 수·충돌 후보 쌍 검사 수를 표시합니다.
예: `http://localhost:5173/?perf=1`. Collider 수는 등록된 검사기 수이고,
후보 쌍 수는 실제 충돌 성공 횟수가 아닌 Arcade `separate()` 호출 횟수입니다.
표시는 0.5초 간격이며, 씬 종료 시 계측·패널을 제거합니다.
실제 모바일에서 같은 경로를 플레이하며 비교해야 성능 개선 여부를 판단할 수 있습니다.

앱인토스 개발 테스트:

```sh
npm run dev:toss
```

`http://localhost:5173`을 열고 우측 하단 AIT devtools에서 SDK·Safe Area를 확인합니다.
SDK 3.x는 별도 샌드박스 앱을 지원하지 않으며 브라우저 devtools가 개발 테스트 환경입니다.
실제 기기에서는 PC와 같은 Wi-Fi에 연결한 뒤 터미널의 Network 주소를 열 수 있습니다.
일반 웹 모드(`npm run dev`)에는 devtools가 포함되지 않습니다.

앱인토스 번들 생성·실기기 테스트:

1. 앱인토스 콘솔에서 게임 미니앱을 등록합니다. `apps-in-toss.config.ts`의 `appName: 'spinbound'`을 콘솔에 등록한 실제 키와 일치시킵니다. 표시 이름·아이콘·게임 분류는 콘솔에서 설정합니다.
2. `npm run build:toss`로 기존 `dist/`와 프로젝트 루트의 `<appName>.ait`를 생성합니다.
3. 콘솔의 출시하기에 `.ait`를 업로드하고 생성된 QR/`intoss-private://` 테스트 링크를 토스 앱에서 엽니다. 배포·출시 요청은 이 프로젝트에서 자동 실행하지 않습니다.
4. iOS/Android에서 홈 이동·앱 복귀, 사운드 ON/OFF, 회전·Safe Area, 네이티브 닫기 버튼과 게임 UI 겹침을 확인합니다. 오디오는 최초 탭 이후 재생되며, 복귀 시 브라우저가 재생을 막으면 다시 탭합니다.

백그라운드 처리는 브라우저 `visibilitychange`, `blur/focus`, `pagehide/pageshow`를 사용합니다. 문서에 없는 SDK AppState API는 사용하지 않습니다. 씬 일시정지만 복원하므로 클리어·게임오버의 물리 정지 상태는 유지됩니다.

SDK 연동과 번들 생성 범위이며 실제 토스 앱 테스트·출시 검수는 별도로 필요합니다. 로그인·광고·결제·리더보드·사용자 식별/저장은 구현하지 않았습니다.

공식 문서:

- [SDK 3.x 설정 및 devtools](https://developers-apps-in-toss.toss.im/documentation/integration/sdk-3.x)
- [게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-game)
- [Safe Area](https://developers-apps-in-toss.toss.im/documentation/common/screen/safe-area)
- [WebView 설정](https://developers-apps-in-toss.toss.im/documentation/integration/props)
