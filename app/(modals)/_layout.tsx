import { Stack } from 'expo-router';

export default function ModalsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, presentation: 'modal' }}>
      {/* 기록 관련 */}
      <Stack.Screen name="add-expense" />
      <Stack.Screen name="add-income" />
      <Stack.Screen name="edit-record" />

      {/* 카드 관련 */}
      <Stack.Screen name="add-card" />
      <Stack.Screen name="edit-card" />
      <Stack.Screen name="card-list" />

      {/* 부채 관련 */}
      <Stack.Screen name="add-loan" />
      <Stack.Screen name="add-installment" />
      <Stack.Screen name="loan-detail" />
      <Stack.Screen name="installment-detail" />

      {/* 이체 관련 */}
      <Stack.Screen name="add-transfer" />

      {/* 자산 관련 */}
      <Stack.Screen name="add-asset" />
      <Stack.Screen name="asset-detail" />

      {/* 카테고리 관련 */}
      <Stack.Screen name="category-management" />

      {/* 고정비용 관련 */}
      <Stack.Screen name="recurring-list" />
      <Stack.Screen name="add-recurring" />
      <Stack.Screen name="edit-recurring" />

      {/* 설정 관련 */}
      <Stack.Screen name="change-password" />
      <Stack.Screen name="subscription" />
    </Stack>
  );
}
