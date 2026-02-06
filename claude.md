# SYBA 프로젝트 Claude 가이드

## 프로젝트 개요
- **앱 이름**: SYBA (Start Your Bitcoin Adoption)
- **목적**: 비트코인 기반 가계부 앱 (암호화된 로컬 저장)
- **핵심 철학**:
  - **로컬 데이터 주권** - 데이터는 암호화되어 로컬에만 저장, 로그인 시에만 복호화
  - **최소 기록, 최대 가시성** - 한번 기록으로 자산/부채/지출 자동 연동
- **기술 스택**: React Native (Expo SDK 54), TypeScript, NativeWind v4, Zustand, Supabase

## 핵심 파일 위치
- 진행 현황: `/PROGRESS.md`
- 기획 문서: `/01-planning.md`
- 앱 코드: `/app/`
- 상수/설정: `/app/src/constants/`
- 스토어: `/app/src/stores/`
- 서비스: `/app/src/services/`

---

## 🚨 초기 설계 시 잘못된 방향과 교훈

> 다음 프로젝트에서는 이 실수를 반복하지 않도록 **개발 시작 전에 반드시 확인**할 것

### 1. OAuth 제공자 선택 실패 (Discord → LNURL-auth)

**잘못된 결정:**
- Discord OAuth를 인증 방식으로 선택

**문제점:**
- Discord OAuth는 `exp://` (Expo 개발 URL)를 리다이렉트 URI로 지원하지 않음
- 커스텀 스킴 (`myapp://`)도 지원 안 함
- 개발 중 테스트 불가능

**교훈:**
```
✅ OAuth 제공자 선택 전 확인사항:
1. Expo 개발 URL (exp://) 리다이렉트 지원 여부
2. 커스텀 스킴 리다이렉트 지원 여부
3. 실제 Expo 앱에서 테스트한 사례가 있는지 검색
```

**올바른 접근:**
- LNURL-auth 사용 (QR 코드 기반, 리다이렉트 불필요)
- 또는 Google/Apple OAuth (Expo에서 공식 지원)

---

### 2. 알림 시스템 설계 실패 (Discord Bot → expo-notifications)

**잘못된 결정:**
- Discord Bot으로 알림 전송

**문제점:**
- 사용자가 Discord에 가입해야 함
- 앱과 Discord 연동 복잡
- 앱 사용 중 알림 수신 어려움

**교훈:**
```
✅ 알림 시스템 선택 전 확인사항:
1. 앱 내 통합이 가능한가?
2. 사용자가 추가 서비스 가입이 필요한가?
3. 오프라인에서도 로컬 알림이 가능한가?
```

**올바른 접근:**
- expo-notifications 사용 (앱 내 통합, 로컬 알림 지원)

---

### 3. 데이터 플로우 설계 누락

**잘못된 결정:**
- 새로운 데이터 스토어(debtStore) 추가 시 앱 초기화 로직에 loadDebts() 호출 누락

**문제점:**
- 데이터 저장은 되지만 앱 재시작 시 표시 안 됨
- 디버깅에 시간 소요

**교훈:**
```
✅ 새로운 데이터 스토어 추가 시 체크리스트:
1. 스토어 생성 (stores/xxxStore.ts)
2. 타입 정의 (types/xxx.ts)
3. 저장소 경로 추가 (utils/storage.ts - FILE_PATHS)
4. ⭐ 앱 초기화에 load 함수 호출 추가 (app/(tabs)/_layout.tsx)
5. 백업/복원 로직에 포함 (utils/storage.ts - restoreBackup)
```

---

### 4. 모달 라우팅 이해 부족

**잘못된 결정:**
- 상세 화면을 만들지 않고 항목 탭 시 "unmatched route" 에러 방치

**문제점:**
- 할부/대출 목록에서 항목 탭 시 상세 화면으로 이동 안 됨

**교훈:**
```
✅ 목록 화면 구현 시 체크리스트:
1. 목록 화면 (xxx-list.tsx 또는 탭 화면)
2. ⭐ 상세/수정 모달 (xxx-detail.tsx)
3. 추가 모달 (add-xxx.tsx)
4. router.push() 경로와 실제 파일 경로 일치 확인
```

---

### 5. API 스펙 미확인

**잘못된 결정:**
- Blink API 결제 확인 시 `paymentHash` 파라미터 사용

**문제점:**
- 결제 상태 확인 실패
- 실제로는 `paymentRequest` 파라미터 필요

**교훈:**
```
✅ 외부 API 연동 전 확인사항:
1. 공식 API 문서 정독
2. 파라미터명 정확히 확인 (camelCase vs snake_case)
3. 응답 구조 확인 (data.xxx vs xxx)
4. 가능하면 Postman/curl로 먼저 테스트
```

---

### 6. 프로토콜 표준 미확인 (LNURL bech32)

**잘못된 결정:**
- LNURL을 raw URL 형태로 QR 코드 생성

**문제점:**
- Lightning 지갑에서 QR 인식 실패
- LNURL 표준은 bech32 인코딩 필수

**교훈:**
```
✅ 새로운 프로토콜 구현 시 확인사항:
1. 공식 스펙 문서 확인 (예: github.com/lnurl/luds)
2. 인코딩/포맷 요구사항 확인
3. 실제 지갑/클라이언트로 테스트
```

---

## 개발 시 주의사항 (과거 실수 기반)

### 1. 외부 서비스 연동
- **OAuth 연동 전**: 해당 서비스가 Expo 개발 URL (`exp://`)을 지원하는지 반드시 확인
- Discord OAuth는 커스텀 스킴을 지원하지 않음 → LNURL-auth 사용
- 새로운 외부 서비스 연동 시 **제약사항을 먼저 조사**할 것

### 2. API 파라미터
- **Blink API**: 결제 상태 확인 시 `paymentHash`가 아닌 `paymentRequest` 사용
- API 문서를 정확히 읽고 파라미터명 확인 필수
- 에러 발생 시 API 문서 재확인

### 3. 표준 형식 준수
- **LNURL**: 반드시 bech32 인코딩된 형식 (`LNURL1...`) 사용
- raw URL을 그대로 사용하면 Lightning 지갑에서 인식 못 함
- 새로운 프로토콜 구현 시 **표준 스펙 문서 확인** 필수

### 4. Expo Router 모달
- 같은 (modals) 그룹 내에서 `router.push()`하면 스택이 아닌 **교체**됨
- 모달 위에 모달을 띄우려면 React Native의 `<Modal>` 컴포넌트 사용
- 또는 별도의 모달 그룹 생성

### 5. 비동기 처리 & Race Condition
- WebSocket 콜백에서 상태 변경 시 중복 처리 방지 필요
- `isProcessingRef` 같은 플래그로 중복 실행 차단
- cleanup 함수에서 구독 해제 필수

### 6. Supabase Edge Functions
- 외부에서 호출 시 JWT 검증이 기본 활성화됨
- LNURL 콜백처럼 외부 서비스가 호출하는 경우 JWT 검증 비활성화 필요
- Supabase 대시보드 > Edge Functions > 해당 함수 > Settings

### 7. 데이터베이스 스키마
- 테이블 생성 전 인증 방식 확정 필요
- 인증 방식 변경 시 테이블 재생성 필요할 수 있음
- NOT NULL 제약조건 신중하게 설정

### 8. 에러 처리
- catch 블록을 비워두지 말고 최소한 로깅 추가
- 오프라인/네트워크 에러는 사용자에게 명확히 표시
- 개발 중에는 console.error로 디버깅 정보 출력

### 9. expo-notifications 타입
- `NotificationBehavior`에 `shouldShowBanner`, `shouldShowList` 필수
- `trigger`는 Date 객체가 아닌 `{ type: 'date', date: Date }` 형식 사용
- expo-notifications 버전 업데이트 시 타입 변경 주의

### 10. Zustand 스토어 반환값
- 생성 함수(addExpense 등)에서 ID 반환이 필요하면 타입과 구현 모두 수정
- 연관 데이터 생성 시 (지출→할부) ID 연결 필요

### 11. 실시간 시세 필요 여부 판단 실수

**잘못된 판단:**
- 홈 탭에 5분마다 시세 갱신이 필요하다고 제안

**문제점:**
- 홈 탭은 **이미 기록된 수입/지출의 합계**를 표시
- 기록 시점의 sats 값으로 저장되므로 시세가 바뀌어도 기록된 값은 변하지 않음
- 불필요한 API 호출 제안

**교훈:**
```
✅ 실시간 시세가 필요한 화면 판단 기준:
1. 현재 시세로 환산해서 보여주는 값인가? → 실시간 필요
2. 이미 기록된 과거 시점의 값인가? → 실시간 불필요

[실시간 필요]
- 자산 탭: 원화 자산 → sats 환산 (현재 시세 기준)
- 부채 탭: 원화 부채 → sats 참고값 (현재 시세 기준)

[실시간 불필요]
- 홈 탭: 기록된 수입/지출 합계 (기록 당시 sats로 저장됨)
- 기록 탭: 개별 기록 (기록 당시 sats로 저장됨)
```

### 12. 표시 단위 설정의 맥락 무시

**잘못된 구현:**
- displayUnit 설정을 부채 탭에도 동일하게 적용 (BTC 모드면 sats 메인)

**문제점:**
- 부채는 **원화로 상환**해야 하는 고정 금액
- BTC 시세가 오르면 sats 숫자가 줄어들어 "부채가 줄었다"는 착각 유발
- 실제로 갚아야 할 금액은 변하지 않음

**교훈:**
```
✅ 표시 단위 적용 시 데이터의 본질 고려:
1. 자산: BTC 구매력 관점 → displayUnit 적용 O
2. 수입/지출: 기록 시점 가치 → displayUnit 적용 O
3. 부채: 상환해야 할 고정 금액 → 항상 원화 메인, sats는 참고용

[부채 표시 규칙]
- 메인: 항상 원화 (₩)
- 서브: sats 환산 참고값 (≈ X sats)
- displayUnit 설정과 무관하게 동작
```

### 13. UI 일관성 미준수 (토글 순서)

**잘못된 구현:**
- 화면마다 토글 버튼 순서가 제각각 (KRW | BTC vs BTC | KRW)
- 선택된 상태의 스타일도 불일치

**문제점:**
- 사용자 혼란
- 앱이 정리되지 않은 느낌

**교훈:**
```
✅ UI 컴포넌트 일관성 체크리스트:
1. 토글/버튼 순서 통일 (BTC | KRW)
2. 선택 상태 스타일 통일
   - BTC 선택: 오렌지(#F7931A) 배경, 흰색 텍스트
   - KRW 선택: 흰색 배경, 검정 텍스트
3. 새 화면 추가 시 기존 화면의 스타일 참고
4. 단위 표시 통일: sats, ₩ (만원), K sats 등
```

### 14. CI/CD 워크플로우 위치 확인 누락

**잘못된 검색:**
- `.github/workflows/`만 확인하고 "자동 빌드 없음"이라고 답변

**문제점:**
- EAS는 자체 워크플로우 시스템 사용 (`.eas/workflows/`)
- 사용자에게 잘못된 정보 제공

**교훈:**
```
✅ CI/CD 워크플로우 확인 시 체크리스트:
1. .github/workflows/ (GitHub Actions)
2. .eas/workflows/ (EAS Workflows)
3. .circleci/ (CircleCI)
4. .gitlab-ci.yml (GitLab CI)
5. bitbucket-pipelines.yml (Bitbucket)
6. 한 곳만 확인하고 "없다"고 단정하지 말 것
```

---

## 코드 스타일

### 컴포넌트
- 함수형 컴포넌트 + hooks 사용
- 스타일은 inline style 객체 (NativeWind className도 가능)
- 한국어 UI 텍스트

### 상태 관리
- Zustand 스토어 사용
- 비동기 작업은 스토어 액션에서 처리
- 로딩/에러 상태 관리 필수

### 타입
- TypeScript strict 모드
- interface 선호 (type alias보다)
- any 사용 지양

---

## 현재 구현된 주요 플로우

### LNURL-auth (로그인)
1. 앱에서 Supabase에 세션 생성 (k1 챌린지)
2. QR 코드로 LNURL 표시 (bech32 인코딩)
3. 사용자가 Lightning 지갑으로 스캔 & 서명
4. 지갑이 Edge Function 호출 → 서명 검증 → 세션 업데이트
5. 앱에서 폴링으로 인증 완료 확인

### Blink API (결제)
1. `createLightningInvoice()`로 Invoice 생성
2. QR 코드로 Invoice 표시
3. WebSocket으로 결제 상태 실시간 구독
4. PAID 확인 시 구독 활성화

### 데이터 플로우
1. 로그인 → encryptionKey 획득
2. _layout.tsx에서 loadRecords(), loadCards(), loadDebts() 호출
3. 각 스토어에서 암호화된 파일 복호화 → 상태 업데이트
4. 화면에서 상태 구독하여 표시

### 지출-할부 자동 연동
1. add-expense.tsx에서 할부 선택 (installmentMonths > 1)
2. addExpense() 호출 → expense ID 반환
3. addInstallment() 호출 (expenseId 연결)
4. 부채 탭에 자동으로 할부 기록 표시

### 알림 스케줄링
1. 앱 로드 시 _layout.tsx에서 알림 스케줄링
2. loans/installments 변경 시 재스케줄링
3. 대출 상환: 1일 전 + 당일 알림
4. 할부 결제: 카드 결제일 1일 전 알림

### 자산 연동 (Phase 5)
1. 지출/수입 기록 시 자산 선택 가능 (linkedAssetId)
2. 카드 등록 시 결제 계좌 연결 가능 (linkedAssetId)
3. 결제수단별 자산 필터링:
   - 계좌이체 → 법정화폐 자산만
   - Lightning → Lightning 지갑만
   - Onchain → Onchain 지갑만
4. 자산 선택 시 즉시 잔액 변동 (계좌이체/Lightning/Onchain)

### 자동 자산 차감 (Week 17)
1. 앱 시작 시 `processAllAutoDeductions()` 호출 (_layout.tsx)
2. 카드 결제일 자동 차감:
   - 오늘이 카드 결제일이면 연결 계좌에서 결제 예정액 차감
   - AsyncStorage로 월별 처리 여부 추적 (중복 방지)
3. 대출 상환일 자동 차감:
   - 오늘이 상환일이면 연결 계좌에서 월 상환금 차감
   - 상환 상태 업데이트 (paidMonths, remainingPrincipal, status)
   - 상환 방식별 원금 계산 (원금균등, 원리금균등, 만기일시)
4. 서비스 위치: `src/services/autoDeductionService.ts`

---

## 주요 데이터 타입

### 자산 (Asset)
```typescript
// 법정화폐 자산 (FiatAsset)
{
  id: string;
  type: 'fiat';
  name: string;
  balance: number;           // 마이너스 가능 (마이너스통장)
  currency: 'KRW';
  // 마이너스통장 전용
  isOverdraft?: boolean;     // 마이너스통장 여부
  creditLimit?: number;      // 한도 (예: 10,000,000)
  interestRate?: number;     // 연이자율 (%, 예: 10.5)
  estimatedInterest?: number;// 사용자 수정 예상 이자
}

// 비트코인 자산 (BitcoinAsset)
{
  id: string;
  type: 'bitcoin';
  name: string;
  balance: number;           // sats 단위
  walletType: 'onchain' | 'lightning';
}
```

### 지출/수입 연동
```typescript
// Expense, Income 공통
linkedAssetId?: string;      // 연결된 자산 ID (즉시 차감/증가용)

// Card
linkedAssetId?: string;      // 결제일에 출금될 계좌

// Loan
repaymentDay?: number;       // 상환일 (1~28), 없으면 시작일 기준
linkedAssetId?: string;      // 상환금이 출금될 계좌
```

### 카드사별 결제일/산정기간
- `src/constants/billingPeriods.ts`에 13개 카드사 공식 데이터 저장
- 카드 등록 시 카드사/결제일 선택하면 산정기간 자동 계산
- 인터넷은행(카카오/토스/케이)은 체크카드만 있어 산정기간 없음
