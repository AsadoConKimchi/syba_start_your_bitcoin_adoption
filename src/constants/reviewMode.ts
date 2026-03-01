/**
 * Google Play Store Review Mode
 *
 * Google 심사팀이 LNURL-auth (Lightning 지갑) 없이 앱의 프리미엄 기능을
 * 테스트할 수 있도록 하는 리뷰어 모드.
 *
 * 사용법: 앱 첫 실행 시 비밀번호 설정 화면에서 REVIEWER_PASSWORD를 입력하면
 * 자동으로 리뷰어 모드가 활성화되어 프리미엄 구독 상태가 됨.
 */

// Google Play 심사팀에게 제공할 테스트 비밀번호
export const REVIEWER_PASSWORD = 'SYBAReview2026!';

// SecureStore 키
export const REVIEWER_MODE_KEY = 'SYBA_REVIEWER_MODE';
