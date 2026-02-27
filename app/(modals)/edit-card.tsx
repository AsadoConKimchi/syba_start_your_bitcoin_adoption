import { useState, useEffect, useMemo } from 'react';
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
import { useTheme } from '../../src/hooks/useTheme';
import { useCardStore } from '../../src/stores/cardStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { CardCompanyId } from '../../src/constants/cardCompanies';
import { CardType, getPaymentDayOptions, getBillingPeriodForCard } from '../../src/types/card';
import { getCurrentRegion } from '../../src/regions';
import { isFiatAsset } from '../../src/types/asset';

const CARD_COLORS = [
  '#1A1A1A', '#3B82F6', '#22C55E', '#F7931A',
  '#EF4444', '#8B5CF6', '#EC4899', '#F59E0B',
];

export default function EditCardScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { cards, updateCard, getCardById } = useCardStore();
  const { assets } = useAssetStore();
  const { records } = useLedgerStore();
  const { installments } = useDebtStore();
  const region = getCurrentRegion();

  const card = getCardById(cardId || '');

  // Check if card has linked records (expenses or installments)
  const hasLinkedRecords = useMemo(() => {
    if (!cardId) return false;
    const hasExpenses = records.some(
      r => r.type === 'expense' && 'cardId' in r && r.cardId === cardId
    );
    const hasInstallments = installments.some(i => i.cardId === cardId);
    return hasExpenses || hasInstallments;
  }, [cardId, records, installments]);

  const [name, setName] = useState('');
  const [company, setCompany] = useState<CardCompanyId | null>(null);
  const [cardType, setCardType] = useState<CardType>('credit');
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [paymentDay, setPaymentDay] = useState<number | null>(null);
  const [billingStartDay, setBillingStartDay] = useState<number | null>(null);
  const [billingEndDay, setBillingEndDay] = useState<number | null>(null);
  const [showPaymentDayPicker, setShowPaymentDayPicker] = useState(false);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);
  const [linkedAccountId, setLinkedAccountId] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showDebitAccountPicker, setShowDebitAccountPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fiatAssets = assets.filter(isFiatAsset);

  // Initialize form with existing card data
  useEffect(() => {
    if (card) {
      setName(card.name);
      setCompany(card.company);
      setCardType(card.type);
      setColor(card.color);
      setPaymentDay(card.paymentDay ?? null);
      setBillingStartDay(card.billingStartDay ?? null);
      setBillingEndDay(card.billingEndDay ?? null);
      setLinkedAssetId(card.linkedAssetId ?? null);
      setLinkedAccountId(card.linkedAccountId ?? null);
    }
  }, [card?.id]);

  const availablePaymentDays = useMemo(() => {
    if (!company) return [];
    return getPaymentDayOptions(company);
  }, [company]);

  useEffect(() => {
    if (company && paymentDay && !availablePaymentDays.includes(paymentDay)) {
      setPaymentDay(null);
      setBillingStartDay(null);
      setBillingEndDay(null);
    }
  }, [company, availablePaymentDays]);

  useEffect(() => {
    if (paymentDay && company) {
      const { startDay, endDay } = getBillingPeriodForCard(company, paymentDay);
      setBillingStartDay(startDay);
      setBillingEndDay(endDay);
    }
  }, [paymentDay, company]);

  const billingPeriodText = useMemo(() => {
    if (!paymentDay || !company || !billingStartDay || !billingEndDay) return null;
    const rules = region.billingRules[company]?.rules[paymentDay];
    if (!rules) return `${t('card.prevMonth')} ${billingStartDay}${t('card.dayUnit')} ~ ${t('card.currentMonth')} ${billingEndDay}${t('card.dayUnit')}`;
    const startMonth = rules.start.monthOffset === -2 ? t('card.twoMonthsAgo') : t('card.prevMonth');
    const endMonth = rules.end.monthOffset === -1 ? t('card.prevMonth') : t('card.currentMonth');
    return `${startMonth} ${billingStartDay}${t('card.dayUnit')} ~ ${endMonth} ${billingEndDay}${t('card.dayUnit')}`;
  }, [paymentDay, company, billingStartDay, billingEndDay, t, region]);

  const selectedCompanyName = company ? t('cardCompanies.' + company) : '';

  const handleSave = async () => {
    if (!cardId || !card) return;

    if (!name.trim()) {
      Alert.alert(t('common.error'), t('card.nameRequired'));
      return;
    }
    if (!company) {
      Alert.alert(t('common.error'), t('card.companyRequired'));
      return;
    }

    setIsLoading(true);
    try {
      await updateCard(cardId, {
        name: name.trim(),
        ...(!hasLinkedRecords ? { company, type: cardType } : {}),
        color,
        ...(cardType === 'credit' && paymentDay
          ? { paymentDay, billingStartDay: billingStartDay || undefined, billingEndDay: billingEndDay || undefined }
          : cardType === 'credit' ? { paymentDay: undefined, billingStartDay: undefined, billingEndDay: undefined } : {}),
        ...(cardType === 'credit' ? { linkedAssetId: linkedAssetId || undefined } : { linkedAssetId: undefined }),
        ...(cardType === 'debit' ? { linkedAccountId: linkedAccountId || undefined } : { linkedAccountId: undefined }),
      });
      Alert.alert('', t('card.editDone'), [
        { text: t('common.confirm'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common.error'), t('card.editFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!card) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.textSecondary }}>{t('common.notFound')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('card.editTitle')}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
          {/* Card preview */}
          <View style={{ backgroundColor: color, borderRadius: 12, padding: 20, marginBottom: 24, minHeight: 180, justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{selectedCompanyName || t('card.company')}</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginTop: 4 }}>{name || t('card.cardName')}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                {cardType === 'credit' ? t('card.credit') : cardType === 'debit' ? t('card.debit') : t('card.prepaid')}
              </Text>
              <Ionicons name="card" size={32} color="rgba(255,255,255,0.5)" />
            </View>
          </View>

          {/* Card name */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('card.cardName')}</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, fontSize: 16, color: theme.inputText }}
              placeholder={t('card.cardNamePlaceholder')}
              placeholderTextColor={theme.placeholder}
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Card company */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('card.company')}</Text>
              {hasLinkedRecords && (
                <Text style={{ fontSize: 11, color: theme.warning }}>{t('card.hasLinkedRecords')}</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, opacity: hasLinkedRecords ? 0.5 : 1 }}>
              {region.cardCompanies.map(comp => (
                <TouchableOpacity
                  key={comp.id}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                    backgroundColor: company === comp.id ? theme.primary : theme.backgroundTertiary,
                  }}
                  onPress={() => {
                    if (hasLinkedRecords) {
                      Alert.alert(t('card.editRestricted'), t('card.editRestrictedMessage'));
                      return;
                    }
                    setCompany(comp.id);
                  }}
                >
                  <Text style={{ fontSize: 14, color: company === comp.id ? '#FFFFFF' : theme.textSecondary }}>
                    {t('cardCompanies.' + comp.id)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Card type */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('card.cardType')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, opacity: hasLinkedRecords ? 0.5 : 1 }}>
              {[
                { id: 'credit', label: t('card.credit') },
                { id: 'debit', label: t('card.debit') },
                { id: 'prepaid', label: t('card.prepaid') },
              ].map(type => (
                <TouchableOpacity
                  key={type.id}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center',
                    backgroundColor: cardType === type.id ? theme.primary : theme.backgroundTertiary,
                  }}
                  onPress={() => {
                    if (hasLinkedRecords) {
                      Alert.alert(t('card.editRestricted'), t('card.editRestrictedMessage'));
                      return;
                    }
                    setCardType(type.id as CardType);
                  }}
                >
                  <Text style={{ fontSize: 14, color: cardType === type.id ? '#FFFFFF' : theme.textSecondary }}>{type.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Payment day (credit only) */}
          {cardType === 'credit' && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('card.paymentDay')}</Text>
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setShowPaymentDayPicker(true)}
              >
                <Text style={{ fontSize: 16, color: paymentDay ? theme.text : theme.textMuted }}>
                  {paymentDay ? t('card.paymentDayFormat', { day: paymentDay }) : t('card.selectPaymentDay')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              {billingPeriodText && (
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>
                  {t('card.billingPeriod', { period: billingPeriodText })}
                </Text>
              )}
            </View>
          )}

          {/* Linked account (credit only) */}
          {cardType === 'credit' && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('card.linkedAccount')}</Text>
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setShowAssetPicker(true)}
              >
                <Text style={{ fontSize: 16, color: linkedAssetId ? theme.text : theme.textMuted }}>
                  {linkedAssetId ? fiatAssets.find(a => a.id === linkedAssetId)?.name ?? t('card.linkedAccount') : t('card.selectLinkedAccount')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>{t('card.autoDeductHint')}</Text>
            </View>
          )}

          {/* Linked account (debit only) */}
          {cardType === 'debit' && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('card.debitLinkedAccount')}</Text>
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setShowDebitAccountPicker(true)}
              >
                <Text style={{ fontSize: 16, color: linkedAccountId ? theme.text : theme.textMuted }}>
                  {linkedAccountId ? fiatAssets.find(a => a.id === linkedAccountId)?.name ?? t('card.selectDebitAccount') : t('card.selectDebitAccount')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>{t('card.debitAccountHint')}</Text>
            </View>
          )}

          {/* Card color */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('card.cardColor')}</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {CARD_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: theme.primary }}
                  onPress={() => setColor(c)}
                >
                  {color === c && (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Save button */}
          <View style={{ padding: 20, paddingBottom: 40 }}>
            <TouchableOpacity
              style={{ backgroundColor: theme.primary, padding: 16, borderRadius: 8, alignItems: 'center', opacity: isLoading ? 0.7 : 1 }}
              onPress={handleSave}
              disabled={isLoading}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                {isLoading ? t('common.saving') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Payment day picker modal */}
      <Modal visible={showPaymentDayPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('card.selectPaymentDayTitle')}</Text>
              <TouchableOpacity onPress={() => setShowPaymentDayPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {company && (
              <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>
                {t('card.availablePaymentDays', { company: t('cardCompanies.' + company) })}
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {availablePaymentDays.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={{ width: '18%', padding: 12, backgroundColor: paymentDay === day ? theme.primary : theme.backgroundTertiary, borderRadius: 8, margin: '1%', alignItems: 'center' }}
                  onPress={() => { setPaymentDay(day); setShowPaymentDayPicker(false); }}
                >
                  <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 16, color: paymentDay === day ? '#FFFFFF' : theme.text }}>
                    {t('card.dayFormat', { day })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={{ padding: 16, backgroundColor: theme.backgroundTertiary, borderRadius: 8, alignItems: 'center' }}
              onPress={() => { setPaymentDay(null); setBillingStartDay(null); setBillingEndDay(null); setShowPaymentDayPicker(false); }}
            >
              <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('card.noSettings')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Credit card linked account picker */}
      <Modal visible={showAssetPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('card.selectAccountTitle')}</Text>
              <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {fiatAssets.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Ionicons name="wallet-outline" size={48} color={theme.textMuted} />
                <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 12, textAlign: 'center' }}>{t('card.noAccounts')}</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {fiatAssets.map((asset) => (
                  <TouchableOpacity
                    key={asset.id}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: linkedAssetId === asset.id ? theme.warningBanner : theme.backgroundSecondary, borderRadius: 8, marginBottom: 8 }}
                    onPress={() => { setLinkedAssetId(asset.id); setShowAssetPicker(false); }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text style={{ fontSize: 18 }}>🏦</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{asset.name}</Text>
                    {linkedAssetId === asset.id && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={{ padding: 16, backgroundColor: theme.backgroundTertiary, borderRadius: 8, alignItems: 'center', marginTop: 8 }}
              onPress={() => { setLinkedAssetId(null); setShowAssetPicker(false); }}
            >
              <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('card.noSettings')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Debit card linked account picker */}
      <Modal visible={showDebitAccountPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('card.debitLinkedAccount')}</Text>
              <TouchableOpacity onPress={() => setShowDebitAccountPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {fiatAssets.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Ionicons name="wallet-outline" size={48} color={theme.textMuted} />
                <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 12, textAlign: 'center' }}>{t('card.noAccountsForDebit')}</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {fiatAssets.map((asset) => (
                  <TouchableOpacity
                    key={asset.id}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: linkedAccountId === asset.id ? theme.warningBanner : theme.backgroundSecondary, borderRadius: 8, marginBottom: 8 }}
                    onPress={() => { setLinkedAccountId(asset.id); setShowDebitAccountPicker(false); }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text style={{ fontSize: 18 }}>🏦</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{asset.name}</Text>
                    {linkedAccountId === asset.id && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={{ padding: 16, backgroundColor: theme.backgroundTertiary, borderRadius: 8, alignItems: 'center', marginTop: 8 }}
              onPress={() => { setLinkedAccountId(null); setShowDebitAccountPicker(false); }}
            >
              <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('card.noSettings')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
