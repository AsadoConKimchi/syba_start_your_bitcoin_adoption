import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';

export default function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { changePassword } = useAuthStore();

  const handleSubmit = async () => {
    if (!currentPassword) {
      Alert.alert('오류', '현재 비밀번호를 입력해주세요.');
      return;
    }

    if (!newPassword) {
      Alert.alert('오류', '새 비밀번호를 입력해주세요.');
      return;
    }

    if (newPassword.length < 12) {
      Alert.alert('오류', '비밀번호는 12자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('오류', '새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert('오류', '현재 비밀번호와 다른 비밀번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const success = await changePassword(currentPassword, newPassword);
      if (success) {
        Alert.alert('완료', '비밀번호가 변경되었습니다.', [
          { text: '확인', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('오류', '현재 비밀번호가 일치하지 않습니다.');
      }
    } catch (error) {
      Alert.alert('오류', '비밀번호 변경에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* 헤더 */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 20,
            borderBottomWidth: 1,
            borderBottomColor: '#E5E7EB',
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>
            비밀번호 변경
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#666666" />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, padding: 20 }}>
          {/* 현재 비밀번호 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
              현재 비밀번호
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 8,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                style={{ flex: 1, fontSize: 16, paddingVertical: 14, color: '#1A1A1A' }}
                placeholder="현재 비밀번호 입력"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showCurrentPassword}
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                <Ionicons
                  name={showCurrentPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* 새 비밀번호 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
              새 비밀번호
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 8,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                style={{ flex: 1, fontSize: 16, paddingVertical: 14, color: '#1A1A1A' }}
                placeholder="새 비밀번호 입력 (12자 이상)"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showNewPassword}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                <Ionicons
                  name={showNewPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* 새 비밀번호 확인 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
              새 비밀번호 확인
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 8,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                style={{ flex: 1, fontSize: 16, paddingVertical: 14, color: '#1A1A1A' }}
                placeholder="새 비밀번호 다시 입력"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showNewPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>
            {confirmPassword && newPassword !== confirmPassword && (
              <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>
                비밀번호가 일치하지 않습니다
              </Text>
            )}
          </View>
        </View>

        {/* 변경 버튼 */}
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
          <TouchableOpacity
            style={{
              backgroundColor: '#F7931A',
              padding: 16,
              borderRadius: 8,
              alignItems: 'center',
              opacity: isLoading ? 0.7 : 1,
            }}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              {isLoading ? '변경 중...' : '비밀번호 변경'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
