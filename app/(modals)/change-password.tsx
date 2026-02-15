import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/stores/authStore';

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const { changePassword } = useAuthStore();

  const passwordChecks = useMemo(() => ({
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasLength: newPassword.length >= 12,
  }), [newPassword]);

  const allChecksPassed = Object.values(passwordChecks).every(Boolean);

  const handleSubmit = async () => {
    if (!currentPassword) {
      Alert.alert(t('common.error'), t('changePassword.currentRequired'));
      return;
    }

    if (!newPassword) {
      Alert.alert(t('common.error'), t('changePassword.newRequired'));
      return;
    }

    if (!allChecksPassed) {
      Alert.alert(t('common.error'), t('changePassword.tooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('common.error'), t('changePassword.confirmMismatch'));
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert(t('common.error'), t('changePassword.samePassword'));
      return;
    }

    setIsLoading(true);
    setProgress(0);

    try {
      const success = await changePassword(currentPassword, newPassword, (p) => setProgress(p));
      if (success) {
        Alert.alert(t('common.done'), t('changePassword.success'), [
          { text: t('common.confirm'), onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(t('common.error'), t('changePassword.wrongCurrent'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('changePassword.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
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
            borderBottomColor: theme.border,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
            {t('changePassword.title')}
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, padding: 20 }}>
          {/* 현재 비밀번호 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
              {t('changePassword.currentPassword')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                style={{ flex: 1, fontSize: 16, paddingVertical: 14, color: theme.inputText }}
                placeholder={t('changePassword.currentPasswordPlaceholder')}
                placeholderTextColor={theme.placeholder}
                secureTextEntry={!showCurrentPassword}
                textContentType="none"
                autoComplete="off"
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                <Ionicons
                  name={showCurrentPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* 새 비밀번호 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
              {t('changePassword.newPassword')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                style={{ flex: 1, fontSize: 16, paddingVertical: 14, color: theme.inputText }}
                placeholder={t('changePassword.newPasswordPlaceholder')}
                placeholderTextColor={theme.placeholder}
                secureTextEntry={!showNewPassword}
                textContentType="none"
                autoComplete="off"
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                <Ionicons
                  name={showNewPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* 비밀번호 강도 체크 */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, marginTop: -16 }}>
              {([
                ['hasUppercase', t('auth.passwordReqUppercase')],
                ['hasLowercase', t('auth.passwordReqLowercase')],
                ['hasNumber', t('auth.passwordReqNumber')],
                ['hasLength', t('auth.passwordReqLength')],
              ] as const).map(([key, label]) => {
                const met = passwordChecks[key as keyof typeof passwordChecks];
                return (
                  <Text key={key} style={{ fontSize: 13, color: met ? '#22C55E' : '#EF4444' }}>
                    {met ? '✅' : '❌'}{label}
                  </Text>
                );
              })}
            </View>

          {/* 새 비밀번호 확인 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
              {t('changePassword.confirmNewPassword')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                paddingHorizontal: 16,
              }}
            >
              <TextInput
                style={{ flex: 1, fontSize: 16, paddingVertical: 14, color: theme.inputText }}
                placeholder={t('changePassword.confirmPasswordPlaceholder')}
                placeholderTextColor={theme.placeholder}
                secureTextEntry={!showNewPassword}
                textContentType="none"
                autoComplete="off"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>
            {confirmPassword && newPassword !== confirmPassword && (
              <Text style={{ fontSize: 12, color: theme.error, marginTop: 4 }}>
                {t('changePassword.passwordMismatch')}
              </Text>
            )}
          </View>
        </View>

        {/* 변경 버튼 */}
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: theme.border }}>
          {isLoading ? (
            <View>
            <View style={{
              height: 36,
              justifyContent: 'flex-end',
              alignItems: 'flex-start',
            }}>
              <Image
                source={require('../../assets/icon.png')}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  marginLeft: progress * (Dimensions.get('window').width - 48 - 32),
                }}
              />
            </View>
            <View style={{
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: theme.border,
              height: 52,
              justifyContent: 'center',
            }}>
              <View style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: '#F7931A',
                borderRadius: 8,
              }} />
              <Text style={{
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: '600',
                textAlign: 'center',
                zIndex: 1,
              }}>
                🔓 {t('auth.decrypting')} {Math.round(progress * 100)}%
              </Text>
            </View>
            </View>
          ) : (
            <TouchableOpacity
              style={{
                backgroundColor: allChecksPassed && newPassword === confirmPassword && currentPassword
                  ? theme.primary
                  : theme.border,
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
              }}
              onPress={handleSubmit}
              disabled={!allChecksPassed || newPassword !== confirmPassword || !currentPassword}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                {t('changePassword.change')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
