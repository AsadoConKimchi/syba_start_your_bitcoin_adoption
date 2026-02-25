# CHANGELOG

버전 규칙:
- **patch** (0.1.x): 버그픽스, 보안 수정, UX 개선
- **minor** (0.x.0): 신규 기능 추가
- **versionCode**: 릴리즈마다 항상 +1

---

## [1.0.0] - 2026-02-25
versionCode: 1

### 코드 품질 & 보안
- C-1: installment.ts/loan.ts 중복 타입 제거 → debt.ts 단일 소스로 통일
- C-3: 암호화 키를 Zustand state에서 클로저 변수로 이동 (React DevTools 노출 방지)
- C-4: addExpense/addIncome에 자산 차감 실패 시 자동 롤백 추가
- C-5: blink.ts 레거시 파일 삭제 (blinkProxy.ts만 사용)
- v1 잔재 정리: payment.tsx 모달, appConfigService prefetch 제거
- PremiumGate v2 전환: subscription_prices 테이블 기반 가격 표시 + 로딩 상태 UI

### 신규 기능
- display_id: Settings에서 SYBA-xxxxxxxx 형식 사용자 식별자 표시 + 복사 기능
- Supabase CS 인프라: subscription_history, cs_actions, 관리자 RPC 함수, 비즈니스 메트릭 뷰

### UI/UX
- 다크모드: DateTimePicker 10개 인스턴스에 themeVariant 적용
- Push Notification 코드 BACKLOG 처리 (v0.2.x 예정)

### 백엔드
- subscribe.html: 3-tier 구독 시스템 (monthly/annual/lifetime), 할인 코드 지원
- blink-proxy Edge Function 재배포
- Supabase migration 003: CS 개선사항 (display_id, subscription_history, admin RPC)

---

## [0.1.13] - 2026-02-24
versionCode: 3

### 신규 기능
- 계좌 간 이체 (Transfer): 원자적 처리, 실패 시 자동 롤백
- 선불카드 충전 (TopUp): 계좌 → 선불카드 잔액 충전
- 카테고리 그룹 관리: 기본 카테고리 + 사용자 정의 그룹 생성/관리
  - 그룹별 지출/수입 카테고리 각각 커스터마이징 (이름, 이모지, 색상)
  - 활성 그룹 선택 시 기록 화면에 즉시 반영
- CSV Import: 맞춤형 템플릿 다운로드 + CSV 일괄 기록 가져오기
  - 등록된 계좌/카드/대출/할부 이름이 안내된 SYBA 전용 양식
  - 가져오기 시 지출/수입 기록 생성 + 연결 계좌 잔액 자동 반영

### 보안
- 재설치 감지: 앱 재설치 시 Keychain 자동 초기화 (Face ID 우회 이슈 수정)

### UX
- Setup 화면: [새로 시작] / [백업 파일로 복구] 선택 화면 분리
- Settings: 불필요한 데이터 복원 버튼 제거

### 버그픽스
- BTC 시세 저장 방식 수정: 지출/수입 기록 시 항상 해당 날짜 Upbit 일봉 종가 기준으로 저장
  - 수정 전: 오늘 날짜 기록 → 실시간 현재가 사용 (날짜 무관)
  - 수정 후: 오늘/과거 날짜 모두 해당 날짜 종가로 통일
- 기록 화면(add-expense, add-income): 과거 날짜 선택 시 해당 날짜 종가로 sats 미리보기 표시 ("해당 날짜 종가" 라벨)
- 수정 화면(edit-record): sats 미리보기를 실시간 시세 대신 기록 당시 저장된 시세로 표시 ("기록 당시 시세" 라벨)
- 수정 화면(edit-record): 금액 변경 시 기록 당시 시세 기준으로 satsEquivalent 재계산하여 저장

---

## [0.1.12] - 2026-02-21
versionCode: 2

### 국제화 (i18n)
- KRW 하드코딩 제거 → 다통화 대응
- 김치프리미엄 현지화 표현 변경
  - EN: Exchange Bitcoin Premium Alert
  - ES: Alerta de brecha de bitcoin (아르헨티나 리오플라텐세)
  - JA: 取引所プレミアム通知
- 4개 언어(한/영/스/일) 번역 전반 수정

---

## [0.1.11] - 이전
versionCode: 1

### 초기 기능
- 비밀번호 + Face ID 인증
- 지출/수입 기록 (카드, 현금, 라이트닝, 온체인)
- 할부 관리
- 대출 관리
- 자산 관리 (원화 계좌, 비트코인)
- 백업 / 복구
- 구독 서비스 관리
- 라이트닝 결제 (Blink API, 프리미엄)
- 다국어 지원 (한/영/스/일)
