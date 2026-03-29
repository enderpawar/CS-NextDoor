# 디자인 시스템 규칙

> **정본(소스 오브 트루스):** `src/styles/tokens.css` → `src/styles/global.css` → `src/styles/animations.css` 순 import.  
> 현재 구현 기준의 실질적인 디자인 방향은 `global.css` 하단 **Redesign Override** 구간(`.card-glass`, `.nd-redesign-*`, `.nd-diagnose-page`, `.nd-conversation-view`, `.nd-pwa-hero-panel`)이 우선합니다.  
> `redisign_reference.html`과 PNG 시안은 구조/무드 참고용이며, **실제 값과 클래스 체계는 아래 문서와 구현이 정본**입니다.

---

## 비주얼 방향 (Soft Blue Glass Diagnostic)

- **톤:** 밝은 블루-화이트 배경 + 소프트 인디고 포인트 + 반투명 글래스 카드.
- **무드 키워드:** PC Doctor AI, medical dashboard, frosted glass, editorial enterprise, soft telemetry UI.
- **피해야 할 것:**
  - 예전 `Clean Neutral Enterprise` 문맥의 다크 네이비 히어로 중심 화면
  - 검은 잉크 오프셋 카툰 그림자
  - 웜 크림/오렌지 메인 테마
  - 무거운 메탈/다크 콘솔 계열 UI

---

## 구현 우선순위

1. `src/styles/tokens.css`의 색·폰트·그림자 토큰
2. `src/styles/global.css`의 리디자인 오버라이드
3. `src/components/desktop/ElectronDashboard.tsx` / `src/App.tsx`의 JSX 구조
4. `src/styles/animations.css`의 애니메이션 유틸
5. `index.html`의 Pretendard/CSP, `public/manifest.json`의 테마색

---

## 색상 팔레트 (현재 토큰 기준)

### 배경 계층

| 목적 | 토큰 | 값(요약) |
|------|------|----------|
| 페이지/바디 | `--color-bg-base`, `--color-bg-page` | `#f8f9fd` |
| 소프트 히어로/블루 베이스 | `--color-bg-hero` | `#eef2ff` |
| 글래스 카드 베이스 | `--color-bg-card` | `rgba(255,255,255,0.72)` |
| 서브 영역 | `--color-bg-card-sub` | `#eef2fb` |
| 오버레이 | `--color-bg-overlay` | `rgba(255,255,255,0.54)` |

### 브랜드 블루

| 목적 | 토큰 | 값(요약) |
|------|------|----------|
| 메인 액센트 | `--color-brand` | `#5a81fa` |
| 활성 블루 | `--color-brand-active` | `#446ce4` |
| 브랜드 텍스트 | `--color-text-brand` | `#2c3d8f` |
| 틴트·배경 | `--color-brand-ghost` ~ `--color-brand-focus` | `rgba(90,129,250,…)` 스케일 |

### 텍스트

| 목적 | 토큰 | 값(요약) |
|------|------|----------|
| 제목 | `--color-heading` | `#191c1f` |
| 본문 | `--color-text-primary` | `#1f2431` |
| 보조 | `--color-text-secondary` | `#5d6274` |
| 힌트 | `--color-text-hint` | `#8e95aa` |
| 사이드바 본문 | `--color-text-nav` | `rgba(67,70,84,0.78)` |

### 경계선·유리 질감

- `--color-border`: `rgba(196,197,214,0.72)`  
- `--color-border-subtle`: `rgba(255,255,255,0.58)`  
- `--color-border-ghost`: `rgba(196,197,214,0.46)`  
- **현재 방향:** 다크 보더보다 **화이트/라이트 보더 + 블러**가 우선

### 사이드바 전용

| 토큰 | 값(요약) |
|------|-----------|
| `--color-sidebar-bg` | `rgba(255,255,255,0.32)` |
| `--color-sidebar-text` | `rgba(67,70,84,0.82)` |
| `--color-sidebar-text-hover` | `rgba(44,61,143,0.94)` |
| `--color-sidebar-text-active` | `#446ce4` |
| `--color-sidebar-active-bg` | `rgba(90,129,250,0.12)` |

**규칙:** 새 UI는 가능하면 직접 `hex/rgba`를 늘리지 말고 토큰을 우선 사용합니다.  
단, 현재 `global.css` 리디자인 오버라이드에는 일부 시안 고정용 `rgba(...)`가 남아 있으므로, 새 컴포넌트 추가 시에는 이 값을 재하드코딩하기보다 토큰으로 흡수하는 쪽이 우선입니다.

---

## 그림자·깊이

- 현재는 **하드 오프셋 그림자**가 아니라 **소프트 블러 그림자**가 정본입니다.
- 핵심 토큰:
  - `--shadow-card`: `0 10px 28px rgba(38,56,138,0.08)`
  - `--shadow-card-hover`: `0 14px 34px rgba(38,56,138,0.12)`
  - `--shadow-card-elevated`: `0 18px 44px rgba(38,56,138,0.14)`
  - `--shadow-btn`: `0 10px 24px rgba(90,129,250,0.22)`
- **글래스 카드 공통 패턴:** `rgba(255,255,255,0.46)` + `border: 1px solid rgba(255,255,255,0.58)` + `backdrop-filter: blur(18px)`

---

## 타이포그래피

### 실제 폰트 기준

- **본문/UI:** `var(--font-sans)` = `Pretendard`, `Noto Sans KR`, 시스템 폰트
- **대형 제목/디스플레이:** `var(--font-display)`도 현재는 `Pretendard` 계열
- **모노/상태값:** `var(--font-mono)` = `JetBrains Mono`

### 중요 메모

- `index.html`에서 Pretendard CDN을 로드합니다.
- `global.css` 상단의 `SBGraphic` `@font-face`와 `Syne` import는 **레거시 잔존 요소**이며, 현재 토큰 기준 주력 폰트는 아닙니다.
- 따라서 새 컴포넌트에서 `Syne` 감성의 과장된 디스플레이 타이포를 재도입하지 않습니다.

### 크기/무게

- 기본 텍스트 스케일은 `tokens.css`의 `--text-*` 사용
- 리디자인 후 실제 화면은 아래 성향을 따릅니다:
  - 메인 헤드라인: 큰 크기 + 강한 `letter-spacing: -0.04em ~ -0.06em`
  - 본문: 14~16px, line-height 1.7~1.8
  - 레이블/오버라인: 10~12px, uppercase, 높은 자간

---

## 레이아웃 구조 (현재 구현 기준)

### Electron

`src/components/desktop/ElectronDashboard.tsx`

- 루트: `.nd-chat-shell.nd-redesign-shell`
- 컬럼: `256px` 좌측 사이드바 + 우측 메인 스테이지
- 사이드바: `.nd-redesign-sidebar`
- 상단 바: `.nd-redesign-topbar`
- 검색 입력: `.nd-redesign-search`
- 랜딩 입력 페이지: `.nd-diagnose-page`
- 대화/결과 페이지: `.nd-conversation-view`

#### Electron 화면 구조

1. 좌측 글래스 사이드바
2. 상단 검색/액션 바
3. 메인 진단 입력 영역
4. 최근 활동 카드
5. 우측 시스템 상태/사양/팁 카드

### PWA

`src/App.tsx`의 `mode !== 'electron'` 분기

- 상단: `.nd-pwa-topbar`
- 메인 그리드: `.nd-pwa-main`
- 히어로 패널: `.nd-pwa-hero-panel`
- 보조 카드 그리드: `.nd-pwa-side-grid`
- 기능 카드: `.nd-pwa-card-grid`
- 하단 정보 카드: `.nd-pwa-support-grid`

### 반응형

- `@media (max-width: 1180px)`:
  - Electron 2열 -> 1열
  - PWA hero/conversation -> 1열
  - 일부 카드 그리드 2열 유지
- `@media (max-width: 820px)`:
  - 상단 바 세로 적층
  - 검색바 전체폭
  - PWA 카드/지원 그리드 1열

---

## 카드 계층

### 공통 글래스 카드

아래 클래스군은 현재 같은 카드 언어를 공유합니다.

- `.card-glass`
- `.nd-prompt-shell`
- `.nd-response-board`
- `.nd-page-hero`
- `.nd-detail-shell`
- `.nd-stat-card`
- `.nd-data-table-wrap`
- `.nd-event-list`
- `.nd-pwa-card`
- `.nd-pwa-support-card`

### 반경 기준

- 대형 패널: `28px ~ 36px`
- pill/button: `9999px`
- 카드 내부 리스트 아이템: `24px ~ 30px`

---

## 컴포넌트별 시각 패턴

### 사이드바

- 반투명 화이트 배경 + blur
- 브랜드명은 블루 텍스트 (`.nd-redesign-brand-title`)
- 메뉴는 pill형 버튼 (`.nd-redesign-nav-item`)
- 활성 상태는 블루 틴트 배경 + 얕은 그림자

### 입력 카드

- 입력 래퍼: 글래스 카드
- 실제 textarea: 더 밝은 내부 panel (`.nd-prompt-input`)
- CTA 버튼: 블루 그라데이션 pill (`.nd-submit-fab`, `.nd-redesign-scan-button`)

### 우측 시스템 카드

- 미리보기 카드: `.nd-system-preview`
- 사양 카드: `.nd-system-specs`
- 도움 카드: `.nd-system-tip`
- 제목은 굵은 Pretendard, 정보 행은 좌우 정렬 리스트

### 대화/진단 결과

- 결과 패널: `.nd-response-board`
- 버블: `.nd-bubble.user`, `.nd-bubble.ai`, `.nd-bubble.error`
- 가설 카드: `.nd-hypothesis-card`
- 현재도 모두 **같은 글래스 카드 패밀리** 안에 있어야 합니다.

---

## 애니메이션

정본 파일: `src/styles/animations.css`

- 진입: `fadeIn`, `fadeInUp`, `fadeInDown`, `springIn`
- 로딩: `dotBounce`
- 글로우: `glowPulse`
- 부유/오브: `floatIdle`, `orbBreath`
- 랜딩 전환: `ndLandingCollapse`, `ndConversationExpand`

**규칙:**

- 애니메이션은 과하지 않게 사용
- 진단 입력/랜딩은 `animate-fade-in-up`, `animate-spring-in` 중심
- 결과 화면은 등장/전환 애니메이션만 사용하고 계속 흔들리는 효과는 지양
- `prefers-reduced-motion`은 전역 처리 유지

---

## HTML / 앱 셸 메타

### `index.html`

- Pretendard CDN 로드 필수
- CSP에 `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com` 허용
- `theme-color`는 `#f8f9fd`

### `public/manifest.json`

- `background_color`: `#f8f9fd`
- `theme_color`: `#f8f9fd`

---

## import 순서

```css
import './styles/tokens.css';
import './styles/global.css';
import './styles/animations.css';
```

---

## 구현 규칙

- `redisign_reference.html`의 div 구조/스타일을 그대로 복붙하지 않습니다.
- 기존 React 컴포넌트 안에서 `return` JSX 구조로 재구성합니다.
- 새 화면을 만들 때도 **현재 클래스 체계(`nd-*`, `nd-redesign-*`, `nd-pwa-*`)를 이어서 사용**합니다.
- 데스크톱과 PWA는 같은 토큰을 공유하되, PWA는 밀도를 낮추고 레이아웃만 다르게 가져갑니다.
- 기존 진단 로직, IPC, 상태 흐름은 건드리지 않고 표현 계층만 수정합니다.

---

## 컴포넌트 CSS 체크리스트

- [ ] 기본 폰트가 Pretendard 계열인지 확인
- [ ] 카드가 글래스 배경 + 라이트 보더 + blur 조합인지 확인
- [ ] 버튼이 pill형 반경과 블루 포인트를 따르는지 확인
- [ ] Electron은 `좌측 사이드바 + 상단 바 + 메인/우측 패널` 구조를 유지하는지 확인
- [ ] PWA는 `hero + support cards` 구조를 유지하는지 확인
- [ ] 애니메이션은 `animations.css` 유틸 재사용
- [ ] 반응형 구간(`1180px`, `820px`)에서 붕괴 없는지 확인
