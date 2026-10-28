# Sprout Hop

Phaser 3 + TypeScript + Vite. Node.js 24 이상 (`nvm use`).

총 10개 스테이지: 기본 탐험 → 위험한 다리 → 가속 돌파 → 바람의 언덕 → 버섯 숲길 → 용암 운반선 → 하늘 정원 → 깊은 숲의 질주 → 화산 심장부 → 마지막 새싹.
스테이지 전환 시 HP·점수·코인은 누적 유지하고, 마지막 스테이지에서 전체 클리어를 표시합니다.

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

앱인토스 개발 테스트:

```sh
npm run dev:toss
```

`http://localhost:5173`을 열고 우측 하단 AIT devtools에서 SDK·Safe Area를 확인합니다.
SDK 3.x는 별도 샌드박스 앱을 지원하지 않으며 브라우저 devtools가 개발 테스트 환경입니다.
실제 기기에서는 PC와 같은 Wi-Fi에 연결한 뒤 터미널의 Network 주소를 열 수 있습니다.
일반 웹 모드(`npm run dev`)에는 devtools가 포함되지 않습니다.

앱인토스 번들 생성·실기기 테스트:

1. 앱인토스 콘솔에서 게임 미니앱을 등록합니다. `apps-in-toss.config.ts`의 `appName: 'sprout-hop'`을 콘솔에 등록한 실제 키와 일치시킵니다. 표시 이름·아이콘·게임 분류는 콘솔에서 설정합니다.
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
