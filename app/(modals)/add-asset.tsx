import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useAssetStore } from '../../src/stores/assetStore';
import { useAuthStore } from '../../src/stores/authStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { formatKrw, formatSats } from '../../src/utils/formatters';

type AssetType = 'fiat' | 'bitcoin';
type WalletType = 'onchain' | 'lightning';

export default function AddAssetScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [assetType, setAssetType] = useState<AssetType>('fiat');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [isNegativeBalance, setIsNegativeBalance] = useState(false); // 마이너스 잔액 여부
  const [walletType, setWalletType] = useState<WalletType>('onchain');
  // 마이너스통장 관련
  const [isOverdraft, setIsOverdraft] = useState(false);
  const [creditLimit, setCreditLimit] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { addFiatAsset, addBitcoinAsset } = useAssetStore();
  const { getEncryptionKey } = useAuthStore();
  const encryptionKey = getEncryptionKey();
  const { btcKrw } = usePriceStore();

  const balanceNumber = parseInt(balance.replace(/[^0-9]/g, '')) || 0;
  const actualBalance = isNegativeBalance ? -balanceNumber : balanceNumber;
  const creditLimitNumber = parseInt(creditLimit.replace(/[^0-9]/g, '')) || 0;
  const interestRateNumber = parseFloat(interestRate.replace(/[^0-9.]/g, '')) || 0;

  // 비트코인 원화 환산
  const btcKrwValue = assetType === 'bitcoin' && btcKrw
    ? balanceNumber * (btcKrw / 100_000_000)
    : 0;

  const handleBalanceChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers) {
      setBalance(parseInt(numbers).toLocaleString());
    } else {
      setBalance('');
    }
  };

  const handleCreditLimitChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers) {
      setCreditLimit(parseInt(numbers).toLocaleString());
    } else {
      setCreditLimit('');
    }
  };

  const handleInterestRateChange = (text: string) => {
    // 숫자와 소수점만 허용
    const cleaned = text.replace(/[^0-9.]/g, '');
    // 소수점이 두 개 이상이면 첫 번째만 유지
    const parts = cleaned.split('.');
    const formatted = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    setInterestRate(formatted);
  };

  const handleSave = async () => {
    if (!encryptionKey) {
      Alert.alert(t('common.error'), t('common.authRequired'));
      return;
    }

    if (!name.trim()) {
      Alert.alert(t('common.error'), t('asset.nameRequired'));
      return;
    }

    // 마이너스통장 유효성 검사
    if (isOverdraft) {
      if (creditLimitNumber <= 0) {
        Alert.alert(t('common.error'), t('asset.creditLimitRequired'));
        return;
      }
      if (interestRateNumber <= 0 || interestRateNumber > 30) {
        Alert.alert(t('common.error'), t('asset.rateInvalid'));
        return;
      }
      // 마이너스 잔액이 한도를 초과하는지 확인
      if (isNegativeBalance && balanceNumber > creditLimitNumber) {
        Alert.alert(t('common.error'), t('asset.overdraftExceeded'));
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (assetType === 'fiat') {
        await addFiatAsset(
          {
            name: name.trim(),
            balance: actualBalance,
            ...(isOverdraft ? {
              isOverdraft: true,
              creditLimit: creditLimitNumber,
              interestRate: interestRateNumber,
            } : {}),
          },
          encryptionKey
        );
      } else {
        await addBitcoinAsset(
          {
            name: name.trim(),
            balance: balanceNumber,
            walletType,
          },
          encryptionKey
        );
      }

      router.back();
    } catch (error) {
      console.error('자산 추가 실패:', error);
      Alert.alert(t('common.error'), t('asset.addFailed'));
    } finally {
      setIsSubmitting(false);
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
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('asset.addTitle')}</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSubmitting}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: isSubmitting ? theme.textMuted : theme.success,
              }}
            >
              {t('common.save')}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ padding: 20 }}>
            {/* 자산 유형 선택 */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 12 }}>{t('asset.assetType')}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    backgroundColor: assetType === 'fiat' ? '#22C55E' : theme.backgroundTertiary,
                    alignItems: 'center',
                  }}
                  onPress={() => setAssetType('fiat')}
                >
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>🏦</Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: assetType === 'fiat' ? '#FFFFFF' : theme.textSecondary,
                    }}
                  >
                    {t('asset.fiat')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: assetType === 'fiat' ? 'rgba(255,255,255,0.8)' : theme.textMuted,
                    }}
                  >
                    {t('asset.fiatSub')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    backgroundColor: assetType === 'bitcoin' ? theme.primary : theme.backgroundTertiary,
                    alignItems: 'center',
                  }}
                  onPress={() => setAssetType('bitcoin')}
                >
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>₿</Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: assetType === 'bitcoin' ? '#FFFFFF' : theme.textSecondary,
                    }}
                  >
                    {t('asset.bitcoin')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: assetType === 'bitcoin' ? 'rgba(255,255,255,0.8)' : theme.textMuted,
                    }}
                  >
                    {t('asset.bitcoinSub')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 자산명 */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
                {assetType === 'fiat' ? t('asset.accountName') : t('asset.walletName')} *
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 16,
                  color: theme.inputText,
                }}
                placeholder={assetType === 'fiat' ? t('asset.accountPlaceholder') : t('asset.walletPlaceholder')}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* 마이너스통장 토글 (법정화폐만) */}
            {assetType === 'fiat' && (
              <View style={{ marginBottom: 24 }}>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isOverdraft ? theme.warningBanner : theme.backgroundSecondary,
                    borderRadius: 12,
                    padding: 16,
                  }}
                  onPress={() => {
                    setIsOverdraft(!isOverdraft);
                    if (!isOverdraft) {
                      // 마이너스통장 켜면 마이너스 잔액 허용
                    } else {
                      // 마이너스통장 끄면 초기화
                      setCreditLimit('');
                      setInterestRate('');
                      setIsNegativeBalance(false);
                    }
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 20, marginRight: 12 }}>💳</Text>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>
                        {t('asset.overdraft')}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.textMuted }}>
                        {t('asset.overdraftHint')}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: isOverdraft ? theme.primary : theme.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isOverdraft && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* 마이너스통장 설정 (한도, 이자율) */}
            {assetType === 'fiat' && isOverdraft && (
              <>
                {/* 한도 */}
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
                    {t('asset.creditLimit')} *
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: theme.backgroundSecondary,
                      borderRadius: 8,
                      paddingHorizontal: 16,
                    }}
                  >
                    <Text style={{ fontSize: 18, color: theme.error, marginRight: 4 }}>₩</Text>
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: 20,
                        fontWeight: 'bold',
                        paddingVertical: 16,
                        color: theme.inputText,
                      }}
                      placeholder={t('asset.creditLimitPlaceholder')}
                      keyboardType="number-pad"
                      value={creditLimit}
                      onChangeText={handleCreditLimitChange}
                    />
                  </View>
                  <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                    {t('asset.creditLimitHint')}
                  </Text>
                </View>

                {/* 연이자율 */}
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
                    {t('asset.annualRate')} *
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: theme.backgroundSecondary,
                      borderRadius: 8,
                      paddingHorizontal: 16,
                    }}
                  >
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: 20,
                        fontWeight: 'bold',
                        paddingVertical: 16,
                        color: theme.inputText,
                      }}
                      placeholder={t('asset.annualRatePlaceholder')}
                      keyboardType="decimal-pad"
                      value={interestRate}
                      onChangeText={handleInterestRateChange}
                    />
                    <Text style={{ fontSize: 18, color: theme.error }}>%</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                    {t('asset.annualRateHint')}
                  </Text>
                </View>
              </>
            )}

            {/* 비트코인 지갑 유형 */}
            {assetType === 'bitcoin' && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('asset.walletType')}</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: walletType === 'onchain' ? theme.primary : theme.backgroundTertiary,
                      alignItems: 'center',
                    }}
                    onPress={() => setWalletType('onchain')}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: walletType === 'onchain' ? '#FFFFFF' : theme.textSecondary,
                      }}
                    >
                      Onchain
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: walletType === 'lightning' ? theme.primary : theme.backgroundTertiary,
                      alignItems: 'center',
                    }}
                    onPress={() => setWalletType('lightning')}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: walletType === 'lightning' ? '#FFFFFF' : theme.textSecondary,
                      }}
                    >
                      Lightning
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 잔액 */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                  {assetType === 'bitcoin' ? t('asset.balanceSats') : t('asset.balanceFiat')}
                </Text>
                {/* 마이너스 잔액 토글 (마이너스통장인 경우만) */}
                {assetType === 'fiat' && isOverdraft && (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isNegativeBalance ? '#FEE2E2' : theme.backgroundTertiary,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                    }}
                    onPress={() => setIsNegativeBalance(!isNegativeBalance)}
                  >
                    <Text style={{ fontSize: 12, color: isNegativeBalance ? theme.error : theme.textSecondary, fontWeight: '600' }}>
                      {isNegativeBalance ? t('asset.negative') : t('asset.positive')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isNegativeBalance ? '#FEE2E2' : theme.backgroundSecondary,
                  borderRadius: 8,
                  paddingHorizontal: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    color: isNegativeBalance ? theme.error : assetType === 'fiat' ? theme.success : theme.primary,
                    marginRight: 4,
                  }}
                >
                  {isNegativeBalance ? '-₩' : assetType === 'fiat' ? '₩' : '₿'}
                </Text>
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 24,
                    fontWeight: 'bold',
                    paddingVertical: 16,
                    color: isNegativeBalance ? theme.error : theme.inputText,
                  }}
                  placeholder="0"
                  keyboardType="number-pad"
                  value={balance}
                  onChangeText={handleBalanceChange}
                />
                {assetType === 'bitcoin' && (
                  <Text style={{ fontSize: 14, color: theme.primary }}>sats</Text>
                )}
              </View>

              {/* 원화 환산 (비트코인인 경우) */}
              {assetType === 'bitcoin' && btcKrw && balanceNumber > 0 && (
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>
                  = {formatKrw(Math.round(btcKrwValue))} ({t('asset.currentRate')})
                </Text>
              )}

              {/* 마이너스통장 가용 금액 표시 */}
              {assetType === 'fiat' && isOverdraft && creditLimitNumber > 0 && (
                <Text style={{ fontSize: 12, color: isNegativeBalance ? theme.error : theme.success, marginTop: 8 }}>
                  {t('asset.availableLimit', { amount: formatKrw(creditLimitNumber - (isNegativeBalance ? balanceNumber : 0)) })}
                </Text>
              )}
            </View>

            {/* 안내 */}
            <View
              style={{
                backgroundColor: '#F0F9FF',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="information-circle" size={20} color="#0284C7" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#0284C7', marginLeft: 8 }}>
                  {t('asset.note')}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: '#0369A1', lineHeight: 20 }}>
                {assetType === 'fiat'
                  ? t('asset.manualUpdateNote')
                  : t('asset.satsNote')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
