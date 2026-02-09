import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAssetStore } from '../../src/stores/assetStore';
import { useAuthStore } from '../../src/stores/authStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { isFiatAsset, isBitcoinAsset } from '../../src/types/asset';
import { formatKrw, formatSats, formatTimeAgo } from '../../src/utils/formatters';

type WalletType = 'onchain' | 'lightning';

export default function AssetDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { encryptionKey } = useAuthStore();
  const { assets, updateAsset, deleteAsset } = useAssetStore();
  const { btcKrw } = usePriceStore();

  const asset = assets.find((a) => a.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [isNegativeBalance, setIsNegativeBalance] = useState(false);
  const [walletType, setWalletType] = useState<WalletType>('onchain');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 예상 이자 수정 모달
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [editingInterest, setEditingInterest] = useState('');

  // 초기값 설정
  useEffect(() => {
    if (asset) {
      setName(asset.name);
      const absBalance = Math.abs(asset.balance);
      setBalance(absBalance.toLocaleString());
      setIsNegativeBalance(asset.balance < 0);
      if (isBitcoinAsset(asset)) {
        setWalletType(asset.walletType);
      }
    }
  }, [asset]);

  if (!asset) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#9CA3AF' }}>{t('common.notFound')}</Text>
        <TouchableOpacity
          style={{ marginTop: 16, padding: 12, backgroundColor: '#22C55E', borderRadius: 8 }}
          onPress={() => router.back()}
        >
          <Text style={{ color: '#FFFFFF' }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isFiat = isFiatAsset(asset);
  const isBtc = isBitcoinAsset(asset);
  const balanceNumber = parseInt(balance.replace(/[^0-9]/g, '')) || 0;
  const actualBalance = isNegativeBalance ? -balanceNumber : balanceNumber;

  // 비트코인 원화 환산
  const btcKrwValue = isBtc && btcKrw
    ? asset.balance * (btcKrw / 100_000_000)
    : 0;

  // 마이너스통장 관련 계산
  const isOverdraft = isFiat && asset.isOverdraft;
  const creditLimit = isFiat && asset.creditLimit ? asset.creditLimit : 0;
  const interestRate = isFiat && asset.interestRate ? asset.interestRate : 0;
  const availableAmount = isOverdraft ? creditLimit + asset.balance : 0; // 가용 한도

  // 예상 월 이자 계산 (마이너스 잔액일 때만)
  const calculateEstimatedInterest = () => {
    if (!isOverdraft || asset.balance >= 0) return 0;
    return Math.round(Math.abs(asset.balance) * (interestRate / 100 / 12));
  };

  const estimatedInterest = isFiat && asset.estimatedInterest !== undefined && asset.estimatedInterest !== null
    ? asset.estimatedInterest
    : calculateEstimatedInterest();

  const handleBalanceChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers) {
      setBalance(parseInt(numbers).toLocaleString());
    } else {
      setBalance('');
    }
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

    setIsSubmitting(true);

    try {
      const updateData: Record<string, unknown> = {
        name: name.trim(),
        balance: actualBalance,
      };

      if (isBtc) {
        updateData.walletType = walletType;
      }

      await updateAsset(asset.id, updateData, encryptionKey);
      setIsEditing(false);
      Alert.alert(t('common.done'), t('asset.editDone'));
    } catch (error) {
      console.error('자산 수정 실패:', error);
      Alert.alert(t('common.error'), t('asset.editFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('asset.deleteConfirm'),
      t('asset.deleteMessage', { name: asset.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!encryptionKey) return;
            try {
              await deleteAsset(asset.id, encryptionKey);
              router.back();
            } catch (error) {
              console.error('자산 삭제 실패:', error);
              Alert.alert(t('common.error'), t('asset.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  // 보기 모드
  if (!isEditing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
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
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#666666" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>{t('asset.detailTitle')}</Text>
          <TouchableOpacity onPress={() => setIsEditing(true)}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#22C55E' }}>{t('common.edit')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }}>
          {/* 자산 정보 카드 */}
          <View
            style={{
              backgroundColor: isOverdraft && asset.balance < 0 ? '#FEE2E2' : isFiat ? '#F0FDF4' : '#FEF3C7',
              borderRadius: 16,
              padding: 24,
              marginBottom: 20,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 40, marginBottom: 12 }}>
              {isOverdraft ? '💳' : isFiat ? '🏦' : '₿'}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 4 }}>
              {asset.name}
            </Text>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 16 }}>
              {isOverdraft ? t('asset.overdraft') : isFiat ? t('asset.fiat') : isBitcoinAsset(asset) ? (asset.walletType === 'onchain' ? 'Onchain' : 'Lightning') : ''}
            </Text>

            {/* 잔액 */}
            <Text
              style={{
                fontSize: 32,
                fontWeight: 'bold',
                color: asset.balance < 0 ? '#EF4444' : isFiat ? '#22C55E' : '#F7931A',
              }}
            >
              {isFiat ? formatKrw(asset.balance) : formatSats(asset.balance)}
            </Text>

            {/* 마이너스통장: 한도 및 가용 금액 */}
            {isOverdraft && (
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#666666' }}>{t('assets.limit')}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A' }}>
                    {formatKrw(creditLimit)}
                  </Text>
                </View>
                <Text style={{ color: '#D1D5DB' }}>|</Text>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#666666' }}>{t('assets.available')}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: availableAmount > 0 ? '#22C55E' : '#EF4444' }}>
                    {formatKrw(availableAmount)}
                  </Text>
                </View>
              </View>
            )}

            {/* 원화 환산 (비트코인) */}
            {isBtc && btcKrw && (
              <Text style={{ fontSize: 14, color: '#666666', marginTop: 8 }}>
                = {formatKrw(Math.round(btcKrwValue))}
              </Text>
            )}
          </View>

          {/* 마이너스통장: 예상 이자 */}
          {isOverdraft && asset.balance < 0 && (
            <View
              style={{
                backgroundColor: '#FEF3C7',
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 12, color: '#92400E' }}>{t('asset.estimatedInterestLabel')}</Text>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#F59E0B' }}>
                    {formatKrw(estimatedInterest)}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    {t('asset.rateBasedOn', { rate: interestRate })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 8,
                    padding: 10,
                  }}
                  onPress={() => {
                    setEditingInterest(estimatedInterest.toString());
                    setShowInterestModal(true);
                  }}
                >
                  <Ionicons name="pencil" size={20} color="#F59E0B" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 상세 정보 */}
          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 16 }}>
              {t('asset.detailInfo')}
            </Text>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('asset.assetType')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {isFiat ? `${t('asset.fiat')} (KRW)` : `${t('asset.bitcoin')} (sats)`}
              </Text>
            </View>

            {isBitcoinAsset(asset) && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('asset.walletType')}</Text>
                <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                  {asset.walletType === 'onchain' ? 'Onchain (L1)' : 'Lightning (L2)'}
                </Text>
              </View>
            )}

            {isOverdraft && (
              <>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('asset.creditLimit')}</Text>
                  <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                    {formatKrw(creditLimit)}
                  </Text>
                </View>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('asset.annualRate')}</Text>
                  <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                    {interestRate}%
                  </Text>
                </View>
              </>
            )}

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('asset.registrationDate')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {new Date(asset.createdAt).toLocaleDateString('ko-KR')}
              </Text>
            </View>

            <View>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('asset.lastUpdate')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {formatTimeAgo(asset.updatedAt)}
              </Text>
            </View>
          </View>

          {/* 삭제 버튼 */}
          <TouchableOpacity
            style={{
              backgroundColor: '#FEE2E2',
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
              marginBottom: 40,
            }}
            onPress={handleDelete}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#DC2626' }}>{t('asset.deleteConfirm')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 수정 모드
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
          <TouchableOpacity onPress={() => setIsEditing(false)}>
            <Text style={{ fontSize: 16, color: '#666666' }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>{t('asset.editTitle')}</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSubmitting}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: isSubmitting ? '#9CA3AF' : '#22C55E',
              }}
            >
              {t('common.save')}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ padding: 20 }}>
            {/* 자산명 */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
                {isFiat ? t('asset.accountName') : t('asset.walletName')} *
              </Text>
              <TextInput
                style={{
                  backgroundColor: '#F9FAFB',
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 16,
                  color: '#1A1A1A',
                }}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* 비트코인 지갑 유형 */}
            {isBtc && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('asset.walletType')}</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: walletType === 'onchain' ? '#F7931A' : '#F3F4F6',
                      alignItems: 'center',
                    }}
                    onPress={() => setWalletType('onchain')}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: walletType === 'onchain' ? '#FFFFFF' : '#666666',
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
                      backgroundColor: walletType === 'lightning' ? '#F7931A' : '#F3F4F6',
                      alignItems: 'center',
                    }}
                    onPress={() => setWalletType('lightning')}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: walletType === 'lightning' ? '#FFFFFF' : '#666666',
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
                <Text style={{ fontSize: 14, color: '#666666' }}>
                  {isBtc ? t('asset.balanceSats') : t('asset.balanceFiat')}
                </Text>
                {/* 마이너스 잔액 토글 (마이너스통장인 경우만) */}
                {isOverdraft && (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isNegativeBalance ? '#FEE2E2' : '#F3F4F6',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                    }}
                    onPress={() => setIsNegativeBalance(!isNegativeBalance)}
                  >
                    <Text style={{ fontSize: 12, color: isNegativeBalance ? '#EF4444' : '#666666', fontWeight: '600' }}>
                      {isNegativeBalance ? t('asset.negative') : t('asset.positive')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isNegativeBalance ? '#FEE2E2' : '#F9FAFB',
                  borderRadius: 8,
                  paddingHorizontal: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    color: isNegativeBalance ? '#EF4444' : isFiat ? '#22C55E' : '#F7931A',
                    marginRight: 4,
                  }}
                >
                  {isNegativeBalance ? '-₩' : isFiat ? '₩' : '₿'}
                </Text>
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 24,
                    fontWeight: 'bold',
                    paddingVertical: 16,
                    color: isNegativeBalance ? '#EF4444' : '#1A1A1A',
                  }}
                  placeholder="0"
                  keyboardType="number-pad"
                  value={balance}
                  onChangeText={handleBalanceChange}
                />
                {isBtc && (
                  <Text style={{ fontSize: 14, color: '#F7931A' }}>sats</Text>
                )}
              </View>

              {/* 원화 환산 (비트코인인 경우) */}
              {isBtc && btcKrw && balanceNumber > 0 && (
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
                  = {formatKrw(Math.round(balanceNumber * (btcKrw / 100_000_000)))} ({t('asset.currentRate')})
                </Text>
              )}

              {/* 마이너스통장 가용 한도 표시 */}
              {isOverdraft && creditLimit > 0 && (
                <Text style={{ fontSize: 12, color: isNegativeBalance ? '#EF4444' : '#22C55E', marginTop: 8 }}>
                  {t('asset.availableLimit', { amount: formatKrw(creditLimit - (isNegativeBalance ? balanceNumber : 0)) })}
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 예상 이자 수정 모달 */}
      <Modal visible={showInterestModal} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '85%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 8 }}>
              {t('asset.editEstimatedInterest')}
            </Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>
              {t('asset.editEstimatedInterestHint')}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                paddingHorizontal: 16,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 18, color: '#F59E0B', marginRight: 4 }}>₩</Text>
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 20,
                  fontWeight: 'bold',
                  paddingVertical: 12,
                  color: '#1A1A1A',
                }}
                placeholder="0"
                keyboardType="number-pad"
                value={editingInterest}
                onChangeText={(text) => {
                  const numbers = text.replace(/[^0-9]/g, '');
                  setEditingInterest(numbers);
                }}
                autoFocus
              />
            </View>

            <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 20 }}>
              {t('asset.autoCalcLabel', { amount: formatKrw(calculateEstimatedInterest()), rate: interestRate })}
            </Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: 14,
                  backgroundColor: '#F3F4F6',
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                onPress={() => setShowInterestModal(false)}
              >
                <Text style={{ fontSize: 16, color: '#666666' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: 14,
                  backgroundColor: '#F59E0B',
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                onPress={async () => {
                  if (!encryptionKey) return;
                  const newInterest = parseInt(editingInterest) || 0;
                  try {
                    await updateAsset(
                      asset.id,
                      { estimatedInterest: newInterest },
                      encryptionKey
                    );
                    setShowInterestModal(false);
                  } catch (error) {
                    Alert.alert(t('common.error'), t('asset.saveFailed'));
                  }
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>

            {/* 자동 계산으로 되돌리기 */}
            <TouchableOpacity
              style={{
                marginTop: 12,
                padding: 12,
                alignItems: 'center',
              }}
              onPress={async () => {
                if (!encryptionKey) return;
                try {
                  await updateAsset(
                    asset.id,
                    { estimatedInterest: undefined },
                    encryptionKey
                  );
                  setShowInterestModal(false);
                } catch (error) {
                  Alert.alert(t('common.error'), t('asset.saveFailed'));
                }
              }}
            >
              <Text style={{ fontSize: 14, color: '#9CA3AF' }}>{t('asset.revertToAutoCalc')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
