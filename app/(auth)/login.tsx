import { useState, useEffect } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { deleteSecure, SECURE_KEYS } from '../../src/utils/encryption';
import { clearAllData } from '../../src/utils/storage';

export default function LoginScreen() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const {
    verifyPassword,
    authenticateWithBiometric,
    biometricEnabled,
    biometricAvailable,
    failedAttempts,
    checkLockStatus,
    getRemainingLockTime,
  } = useAuthStore();

  const [remainingTime, setRemainingTime] = useState(0);
  const isLocked = checkLockStatus();

  // 잠금 타이머
  useEffect(() => {
    if (isLocked) {
      const interval = setInterval(() => {
        const time = getRemainingLockTime();
        setRemainingTime(time);
        if (time <= 0) {
          checkLockStatus();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isLocked]);

  // 생체인증 자동 시도
  useEffect(() => {
    if (biometricEnabled && biometricAvailable && !isLocked) {
      handleBiometric();
    }
  }, [biometricEnabled, biometricAvailable]);

  const handleLogin = async () => {
    if (!password) {
      Alert.alert('오류', '비밀번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const success = await verifyPassword(password);
    setIsLoading(false);

    if (success) {
      router.replace('/(tabs)');
    } else {
      setPassword('');
      if (checkLockStatus()) {
        // 잠금됨
      } else {
        Alert.alert('오류', '비밀번호가 일치하지 않습니다.');
      }
    }
  };

  const handleBiometric = async () => {
    const success = await authenticateWithBiometric();
    if (success) {
      router.replace('/(tabs)');
    }
  };

  // 임시: 데이터 리셋 (개발용)
  const handleReset = () => {
    Alert.alert(
      '데이터 초기화',
      '모든 데이터가 삭제됩니다. 계속할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            await deleteSecure(SECURE_KEYS.PASSWORD_HASH);
            await deleteSecure(SECURE_KEYS.ENCRYPTION_SALT);
            await deleteSecure(SECURE_KEYS.ENCRYPTION_KEY);
            await deleteSecure(SECURE_KEYS.BIOMETRIC_ENABLED);
            await clearAllData();
            Alert.alert('완료', '앱을 다시 시작해주세요.');
          },
        },
      ]
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };

  if (isLocked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 48, marginBottom: 24 }}>🔒</Text>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
          5회 실패로 잠금되었습니다
        </Text>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#F7931A' }}>
          {formatTime(remainingTime)}
        </Text>
        <Text style={{ fontSize: 14, color: '#666666', marginTop: 8 }}>
          후 다시 시도
        </Text>
      </View>
    );
  }

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
            비밀번호를 입력해주세요
          </Text>

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#E5E7EB',
              borderRadius: 8,
              padding: 16,
              fontSize: 16,
              color: '#1A1A1A',
            }}
            placeholder="비밀번호"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            onSubmitEditing={handleLogin}
          />

          {failedAttempts > 0 && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>
              실패 횟수: {failedAttempts}/5
            </Text>
          )}
        </View>

        {/* 로그인 버튼 */}
        <TouchableOpacity
          style={{
            backgroundColor: '#F7931A',
            padding: 16,
            borderRadius: 8,
            alignItems: 'center',
            opacity: isLoading ? 0.7 : 1,
          }}
          onPress={handleLogin}
          disabled={isLoading}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            {isLoading ? '확인 중...' : '로그인'}
          </Text>
        </TouchableOpacity>

        {/* 생체인증 */}
        {biometricEnabled && biometricAvailable && (
          <>
            <View style={{ alignItems: 'center', marginVertical: 16 }}>
              <Text style={{ color: '#666666' }}>또는</Text>
            </View>

            <TouchableOpacity
              style={{
                borderWidth: 1,
                borderColor: '#E5E7EB',
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
              }}
              onPress={handleBiometric}
            >
              <Ionicons name="finger-print" size={24} color="#F7931A" />
              <Text style={{ marginLeft: 8, fontSize: 16, color: '#1A1A1A' }}>
                생체인증 사용
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* 임시: 리셋 버튼 (개발용) */}
        {__DEV__ && (
          <TouchableOpacity
            style={{ marginTop: 32, alignItems: 'center' }}
            onPress={handleReset}
          >
            <Text style={{ color: '#EF4444', fontSize: 12 }}>
              데이터 초기화 (개발용)
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
