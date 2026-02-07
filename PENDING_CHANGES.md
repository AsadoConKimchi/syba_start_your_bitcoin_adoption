# 다음 빌드 대기 중인 변경사항

**현재 배포 버전:** v0.1.5
**다음 예정 버전:** v0.1.6

---

## v0.1.5에서 완료된 항목

- [x] QR코드 LNURL bech32 형식 수정 (`subscription.tsx:359`)
- [x] 로딩 화면 홍보 문구 8개 랜덤 로테이션 (`_layout.tsx`)
- [x] 백업 파일 공유: `Share.share` → `expo-sharing` 변경 (`settings.tsx`)
- [x] 백업 암호화 안내 문구: 정적 텍스트 → Alert 확인창 방식으로 변경 (`settings.tsx`)

---

## 코드 변경 완료 (빌드 대기)

(현재 없음)

---

## 추후 구현 예정

### 1. 백업 로컬 저장 기능 추가
- **현재 상태**: `Sharing.shareAsync()`는 시스템 공유 시트만 열림 → Google Drive/Gmail 등 외부 공유는 되지만, 기기 로컬 저장소에 직접 저장하는 옵션이 없음
- **파일**: `app/(tabs)/settings.tsx` — `handleBackup()` 함수
- **수정 방법**:
  1. `expo-file-system`의 `StorageAccessFramework` 사용
  2. `SAF.requestDirectoryPermissionsAsync()`로 사용자가 저장 위치 선택
  3. `SAF.createFileAsync()`로 `.enc` 파일을 선택한 위치에 저장
  4. Alert에서 "로컬 저장" / "외부 공유" 선택지 제공
- **관련 Phase**: Phase C (Google Drive/iCloud 백업과 연계)

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
