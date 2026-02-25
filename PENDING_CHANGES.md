# 다음 빌드 대기 중인 변경사항

**현재 배포 버전:** v0.1.13
**다음 예정 버전:** v1.0.0 (Play Store)

---

## v0.1.5에서 완료된 항목

- [x] QR코드 LNURL bech32 형식 수정 (`subscription.tsx:359`)
- [x] 로딩 화면 홍보 문구 8개 랜덤 로테이션 (`_layout.tsx`)
- [x] 백업 파일 공유: `Share.share` → `expo-sharing` 변경 (`settings.tsx`)
- [x] 백업 암호화 안내 문구: 정적 텍스트 → Alert 확인창 방식으로 변경 (`settings.tsx`)

---

## 코드 변경 완료 (빌드 대기)

- [x] C-1: installment.ts 중복 타입 → debt.ts로 통일 (types/index.ts 수정)
- [x] C-3: encryptionKey를 Zustand state에서 클로저 변수로 이동 (authStore + 4개 참조 파일)
- [x] C-4: addExpense/addIncome에 자산 차감 실패 시 롤백 로직 추가
- [ ] C-5: blink.ts 레거시 파일 삭제 (Jin 로컬에서 직접)
- [ ] flutter 폴더 삭제 (Jin 로컬에서 직접)

---

## 추후 구현 예정

### 1. ~~백업 로컬 저장 기능 추가~~ ✅ v0.1.6에서 완료
- StorageAccessFramework + Alert 3버튼(취소/기기에 저장/외부 공유) 구현 완료

### 2. 결제 상태 확인: 폴링 → Supabase Realtime 전환
- **현재 상태**: `blinkProxy.ts`의 `waitForPayment()`가 3초마다 Edge Function 폴링 → 콜드 스타트 시 첫 요청 실패 에러 발생
- **수정 파일**:
  1. `src/services/blinkProxy.ts` — `waitForPayment()` 폴링 제거, Supabase Realtime 구독으로 교체 (~20줄)
  2. `app/(modals)/subscription.tsx` — 호출부 조정 (~5줄)
  3. Supabase Edge Function (`blink-proxy`) — 결제 확인 시 `payments` 테이블 status를 PAID로 업데이트 추가 (~10줄)
- **수정 방법**:
  1. 인보이스 생성 시 `payments` 테이블에 레코드 생성 (status: PENDING)
  2. 앱에서 `supabase.channel().on('postgres_changes', ...)` 로 해당 레코드 구독
  3. Edge Function에서 Blink 결제 확인 → `payments` 테이블 PAID 업데이트
  4. Realtime이 앱에 즉시 알림 → 구독 활성화
- **장점**: Edge Function 반복 호출 제거, 콜드 스타트 문제 해결, 실시간 반응
- **비용**: Supabase Realtime은 무료 티어에 포함 (추가 비용 없음)

---

## 대시보드 변경 완료 (빌드 불필요)

- [x] Supabase `payments` 테이블 SELECT 정책 추가 — 인보이스 생성 실패 해결
- [x] Supabase `blink-proxy` Edge Function 코드 배포 — CORS + Rate Limiting 적용
- [x] Supabase `lnurl-auth` Edge Function callback URL 수정 — 환경변수 방식
- [x] Supabase RLS 정책 전체 수정 — 테이블별 최소 권한 적용

---

## 버그 리포트

| 날짜 | 증상 | 원인 | 상태 |
|------|------|------|------|
| 2026-02-07 | QR 스캔 시 "지원하지 않는 형식" | QR에 raw URL 대신 bech32 필요 | ✅ v0.1.5 해결 |
| 2026-02-07 | 인보이스 생성 실패 | payments 테이블 SELECT 정책 누락 | ✅ 해결 |
| 2026-02-07 | 백업 시 "텍스트 공유" 표시 | Share.share()의 url은 iOS 전용 | ✅ v0.1.5 해결 (expo-sharing) |

---

## 빌드 체크리스트

빌드 전 확인:
- [ ] 모든 코드 변경 완료
- [ ] 테스트 완료
- [ ] 버전 번호 업데이트 (app.json)
- [ ] 커밋 & 푸시
- [ ] GitHub Release 생성
