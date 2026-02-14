# SYBA 비즈니스 로직 감사 리포트

**감사일:** 2026-02-14  
**감사 범위:** `src/stores/`, `src/services/`, `src/utils/calculations.ts`, `src/utils/debtCalculator.ts`, `src/utils/cardPaymentCalculator.ts`, `src/constants/billingPeriods.ts`, `src/utils/storage.ts`

---

## 🔴 Critical (데이터 정합성 파괴)

### C-1. deleteRecord에서 자산 역복원 누락
- **파일:** `src/stores/ledgerStore.ts` L291-295
- **내용:** `addExpense`/`addIncome`에서 `linkedAssetId`를 통해 자산 잔액을 변동시키지만, `deleteRecord`는 단순히 레코드를 배열에서 제거만 하고 자산 잔액을 복원하지 않음
- **영향:** 지출 기록 삭제 시 자산이 차감된 상태로 남음. 수입 기록 삭제 시 자산이 증가된 상태로 남음
- **재현:** 계좌이체 지출 10만원 기록 → 자산 -10만원 → 기록 삭제 → 자산 여전히 -10만원

### C-2. updateRecord에서 자산 차액 미반영
- **파일:** `src/stores/ledgerStore.ts` L278-289
- **내용:** `updateRecord`는 레코드의 필드를 머지할 뿐, 금액이나 linkedAssetId가 변경되었을 때 자산 잔액 차이를 조정하지 않음
- **영향:** 금액 수정 시 자산 정합성 깨짐. 예: 10만원 지출 → 자산 -10만원 → 5만원으로 수정 → 자산 여전히 -10만원 (5만원 미복원)
- **추가 케이스:**
  - linkedAssetId 변경 시: 기존 자산 복원 + 새 자산 차감 필요
  - paymentMethod 변경 시 (card↔bank): 자산 연동 조건이 달라짐
  - currency 변경 시: 차감 금액 단위가 달라짐

### C-3. syncPendingPrices에서 SATS 기록 잘못 처리
- **파일:** `src/stores/ledgerStore.ts` L306-320
- **내용:** `syncPendingPrices`가 `needsPriceSync`인 모든 레코드에 대해 일괄적으로 `krwToSats(record.amount, btcKrwAtTime)`을 호출함. 그러나 SATS 기록의 경우 `amount`가 이미 sats 값이므로 이 환산은 완전히 잘못됨
- **영향:** SATS로 기록한 지출/수입의 시세가 나중에 동기화되면 `satsEquivalent`가 엉뚱한 값으로 덮어씌워짐
- **수정:** SATS 기록은 `satsEquivalent = record.amount` 유지, `btcKrwAtTime`만 업데이트해야 함

### C-4. 대출 자동 차감 + addExpense 이중 자산 차감
- **파일:** `src/services/autoDeductionService.ts` L133-147
- **내용:** `processLoanRepayments()`에서 `adjustAssetBalance`로 자산 차감 후, `addExpense`도 호출함. `addExpense`에서 `linkedAssetId: null`로 설정했지만, 만약 이 코드가 변경되면 이중 차감 발생. 현재는 안전하지만 **구조적 위험**
- **실제 버그:** `addExpense` 호출 시 자동 생성된 지출 기록에 대해 사용자가 나중에 삭제하면, C-1 버그로 인해 자산 복원도 안 됨. 하지만 원래 차감은 `adjustAssetBalance`로 했으므로 불일치 발생

---

## 🟠 Major (기능 오작동 가능)

### M-1. PremiumGate 컴포넌트 미사용 — 프리미엄 게이팅 전무
- **파일:** `src/components/PremiumGate.tsx` (정의만 존재)
- **내용:** `PremiumGate` 컴포넌트가 정의되어 있으나 어떤 화면에서도 import/사용되지 않음. `isSubscribed`를 체크하는 코드가 screens 디렉토리에 전혀 없음
- **영향:** 무료 사용자가 모든 프리미엄 기능 (부채 관리, 자산 현황, 차트/통계, 무제한 카드, 데이터 백업 등)에 제한 없이 접근 가능
- **수정:** 프리미엄 기능 목록에 따라 각 화면에 PremiumGate 적용 필요

### M-2. 백업 복원 후 스토어 리로드 누락
- **파일:** `src/utils/storage.ts` L218-253 (`restoreBackup`)
- **내용:** `restoreBackup`은 파일을 복원하지만, 각 스토어(ledgerStore, assetStore, debtStore 등)의 메모리 상태를 리로드하지 않음. 앱을 재시작하지 않으면 이전 데이터가 메모리에 남아 있음
- **영향:** 복원 직후 UI에 이전 데이터가 표시되고, 저장 시 복원된 데이터를 다시 덮어씀
- **수정:** 복원 후 모든 스토어의 `load*()` 호출 필요 (호출측 책임일 수 있으나, 함수 문서화 부재)

### M-3. 백업에 settings 데이터 미포함
- **파일:** `src/utils/storage.ts` L184-196 (`createBackup`)
- **내용:** 백업 데이터에 `settingsStore`의 데이터가 포함되지 않음. settings는 `AsyncStorage`에 별도 저장되는데 (`app_settings` 키), 백업/복원 대상에서 누락
- **영향:** 복원 시 사용자 설정 (언어, 테마 등) 초기화됨

### M-4. 백업에 subscriptionStore 데이터 미포함 (부분적)
- **파일:** `src/utils/storage.ts` L184-196
- **내용:** `FILE_PATHS.SUBSCRIPTION`이 정의되어 있으나 백업 데이터 수집에 포함되지 않음. 구독 상태는 서버(Supabase)에도 있으므로 치명적이지는 않지만, 로컬 캐시 불일치 가능

### M-5. autoDeductionService의 카드/대출/할부 병렬 실행 시 레이스 컨디션
- **파일:** `src/services/autoDeductionService.ts` L268-275
- **내용:** `processAllAutoDeductions`가 카드/대출/할부를 `Promise.all`로 병렬 실행. 대출 상환(`processLoanRepayments`)이 `addExpense`를 호출하고, 할부 처리(`processInstallmentPayments`)도 `addExpense`를 호출함. 두 함수가 동시에 `records` 배열을 수정하면 하나가 다른 하나의 변경을 덮어씀 (Zustand set은 이전 state 기반)
- **영향:** 같은 날 대출 상환일 + 할부 결제일인 경우, 지출 기록 하나가 누락될 수 있음
- **수정:** `Promise.all` → 순차 실행 (`await` 체인)으로 변경

### M-6. getCategoryBreakdown에서 SATS 기록 무시
- **파일:** `src/stores/ledgerStore.ts` L407-410
- **내용:** `getCategoryBreakdown`에서 `r.type === 'expense' && r.currency === 'KRW'`로 필터링하여 SATS 기록이 완전히 제외됨
- **영향:** 비트코인으로 결제한 지출이 카테고리 분석에서 누락됨
- **수정:** SATS 기록도 포함하고 `satsToKrw`로 원화 환산 후 합산

### M-7. debtCalculator의 calculatePaidMonths vs debtStore의 calculatePaidMonths 불일치
- **파일:** `src/utils/debtCalculator.ts` L192-200 vs `src/utils/calculations.ts` L1-12
- **내용:** `debtCalculator.calculatePaidMonths`는 단순히 연월 차이만 계산 (`dayAdjust` 없음). `calculations.calculateElapsedMonths`는 `dayAdjust`로 일자까지 고려. 두 함수가 같은 입력에 다른 결과를 줌
- **예시:** startDate="2026-01-20", 현재="2026-02-14" → `calculatePaidMonths`=1 (월차이), `calculateElapsedMonths`=0 (14<20이므로 -1 적용)
- **영향:** 할부/대출 등록 시 `paidMonths` 자동 계산이 실제 경과 월수와 다를 수 있음

### M-8. 대출 잔여 원금 계산에서 repaymentType 이름 불일치
- **파일:** `src/services/autoDeductionService.ts` L159-170 vs `src/utils/debtCalculator.ts`
- **내용:** autoDeductionService는 `'equalPrincipal'`, `'equalPrincipalAndInterest'` 사용. debtCalculator도 동일한 이름 사용. 하지만 `calculations.ts`의 `calculateRemainingBalance`는 `'equal_principal'`, `'equal_principal_interest'` (snake_case) 사용
- **영향:** `calculations.ts`의 함수들과 `debtCalculator.ts`의 함수들이 서로 다른 RepaymentType enum을 참조. `calculations.ts`를 직접 호출하는 곳이 있다면 타입 불일치로 default 분기 진입 → 잘못된 계산
- **비고:** 두 파일이 같은 목적의 함수를 중복 구현하고 있음 (코드 중복)

---

## 🟡 Minor (개선 권장)

### m-1. addExpense에서 overrideBtcKrw 파라미터 선언 오류
- **파일:** `src/stores/ledgerStore.ts` L99
- **내용:** `addExpense` 함수 시그니처에 `overrideBtcKrw`가 없으나 함수 본문에서 사용됨. 실제 타입 정의(L36-39)에도 없음. TypeScript 컴파일 에러 가능성
- **비고:** 확인 결과 함수 본문 첫 줄에서 참조하지만 파라미터로 받지 않고 있음 — 실제론 미사용 코드일 수 있음 (addIncome에만 있음)

### m-2. 카드 결제일 산정기간에서 월말(31일) 처리
- **파일:** `src/constants/billingPeriods.ts` — `getBillingPeriodByCompany`
- **내용:** `endDay === 31`인 경우 해당 월 마지막 날로 조정하지만, `startDay === 30` 또는 `31`인 경우(2월 등)는 미처리. 예: 전전월 30일 시작인데 2월이면 30일이 없음 → JS Date가 자동으로 3월 2일로 만듦
- **영향:** 2월이 포함된 산정기간에서 시작일이 1~2일 어긋날 수 있음

### m-3. getTodayTotal에서 SATS 합계 미반환
- **파일:** `src/stores/ledgerStore.ts` L342-363
- **내용:** `getTodayTotal`은 원화 합계만 반환하고 sats 합계는 반환하지 않음. `getMonthlyTotal`은 sats 합계도 반환. API 불일치

### m-4. getThisMonthDue 날짜 계산 잠재적 오류
- **파일:** `src/stores/debtStore.ts` L188-202
- **내용:** `(start.getMonth() + item.paidMonths + 1) % 12`로 다음 납부월을 계산하는데, 12월(11)에서 13개월 후면 `(11+13+1) % 12 = 1`이 되어 2월이 되지만, 연도 계산에서 `Math.floor((11+13+1) / 12) = 2`로 2년 후가 됨. 이는 정확하지만, 24개월 이상 떨어진 경우 `nextPaymentMonth`와 thisMonth가 우연히 일치할 수 있음
- **비고:** 실질적으로 active 상태의 할부/대출에서만 호출되므로 문제 가능성 낮음

### m-5. 할부 무이자 반올림 오차 누적
- **파일:** `src/utils/debtCalculator.ts` L14-19
- **내용:** 무이자 할부의 `monthlyPayment = Math.round(totalAmount / months)`. 예: 100,000원 / 3개월 = 33,333원 × 3 = 99,999원. 마지막 회차에 1원 차이 발생
- **영향:** `remainingAmount`가 마지막 회차에서 정확히 0이 안 될 수 있음 (Math.max(0, ...)로 방어는 됨)

### m-6. snapshotStore에서 이전 달 누락 스냅샷 보완 미구현
- **파일:** `src/stores/snapshotStore.ts` L93-98
- **내용:** 주석에 "이전 달 데이터로 스냅샷 생성은 어려우므로 현재 상태로 대체 저장"이라고 되어 있으나, 실제로 이전 달 스냅샷을 저장하는 코드가 없음 (로그만 출력)

### m-7. autoDeductionService의 AsyncStorage 키 오염 가능
- **파일:** `src/services/autoDeductionService.ts`
- **내용:** `LAST_CARD_DEDUCTION` 등의 키에 카드/대출 ID가 누적되지만, 삭제된 카드/대출의 항목은 정리되지 않음. 시간이 지나면 AsyncStorage에 사용하지 않는 ID가 쌓임
- **영향:** 기능적 문제 없음. 스토리지 낭비만 발생

### m-8. 중복 계산 함수 존재
- **파일:** `src/utils/calculations.ts` + `src/utils/debtCalculator.ts`
- **내용:** 월 상환금 계산, 잔여 원금 계산, 경과 개월 수 계산 등이 두 파일에 중복 구현. `calculations.ts`는 snake_case RepaymentType, `debtCalculator.ts`는 camelCase RepaymentType 사용
- **수정:** 하나로 통합하고 다른 하나 제거 권장

---

## 📊 요약

| Severity | 개수 | 설명 |
|----------|------|------|
| 🔴 Critical | 4 | 자산 정합성 파괴, 이중 차감, 환산 오류 |
| 🟠 Major | 8 | 프리미엄 게이팅 전무, 백업 누락, 레이스 컨디션 |
| 🟡 Minor | 8 | 반올림 오차, API 불일치, 코드 중복 |

### 최우선 수정 대상
1. **C-1, C-2:** deleteRecord/updateRecord에 자산 역복원 로직 추가
2. **C-3:** syncPendingPrices에서 SATS 기록 분기 처리
3. **M-1:** PremiumGate를 프리미엄 기능 화면에 적용
4. **M-5:** processAllAutoDeductions 순차 실행으로 변경
