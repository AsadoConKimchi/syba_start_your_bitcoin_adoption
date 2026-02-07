import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';

export default function SetupScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { setupPassword, biometricAvailable } = useAuthStore();

  const handleSetup = async () => {
    if (password.length < 12) {
      Alert.alert('오류', '비밀번호는 12자 이상이어야 합니다.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('오류', '비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    try {
      await setupPassword(password);

      if (biometricAvailable) {
        router.replace('/(auth)/biometric-setup');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert('오류', '비밀번호 설정에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
    >
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        {/* 헤더 */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔐</Text>
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1A1A1A' }}>
            SYBA
          </Text>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
            Start Your Bitcoin Adoption
          </Text>
        </View>

        {/* 폼 */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, color: '#1A1A1A', marginBottom: 8 }}>
            비밀번호를 설정해주세요
          </Text>

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#E5E7EB',
              borderRadius: 8,
              padding: 16,
              fontSize: 16,
              marginBottom: 12,
              color: '#1A1A1A',
            }}
            placeholder="비밀번호 (12자 이상)"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
          />

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#E5E7EB',
              borderRadius: 8,
              padding: 16,
              fontSize: 16,
              color: '#1A1A1A',
            }}
            placeholder="비밀번호 확인"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
          />
        </View>

        {/* 버튼 */}
        <TouchableOpacity
          style={{
            backgroundColor: '#F7931A',
            padding: 16,
            borderRadius: 8,
            alignItems: 'center',
            opacity: isLoading ? 0.7 : 1,
          }}
          onPress={handleSetup}
          disabled={isLoading}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            {isLoading ? '설정 중...' : '다음'}
          </Text>
        </TouchableOpacity>

        {/* 경고 */}
        <View style={{ marginTop: 24, padding: 16, backgroundColor: '#FEF3C7', borderRadius: 8 }}>
          <Text style={{ fontSize: 14, color: '#92400E', textAlign: 'center' }}>
            ⚠️ 비밀번호 분실 시 데이터 복구가 불가합니다.{'\n'}
            안전한 곳에 기록해두세요.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
