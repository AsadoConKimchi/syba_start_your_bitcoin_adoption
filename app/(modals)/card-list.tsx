import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useCardStore } from '../../src/stores/cardStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { Card } from '../../src/types/card';

const FREE_CARD_LIMIT = 3;

export default function CardListScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { cards, deleteCard, setDefaultCard } = useCardStore();
  const { isSubscribed } = useSubscriptionStore();
  const [editMode, setEditMode] = useState(false);

  // 무료 사용자의 경우 카드 추가 가능 여부
  const canAddMoreCards = isSubscribed || cards.length < FREE_CARD_LIMIT;

  const handleDelete = (card: Card) => {
    Alert.alert(
      t('card.deleteConfirm'),
      t('card.deleteMessage', { name: card.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteCard(card.id),
        },
      ]
    );
  };

  const handleSetDefault = (card: Card) => {
    setDefaultCard(card.id);
    Alert.alert(t('card.setDefault'), t('card.setDefaultMessage', { name: card.name }));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
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
          <Ionicons name="arrow-back" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('card.management')}</Text>
        <TouchableOpacity onPress={() => setEditMode(!editMode)}>
          <Text style={{ fontSize: 14, color: theme.primary }}>
            {editMode ? t('common.done') : t('common.edit')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, padding: 20 }}>
        {cards.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
              borderRadius: 12,
              padding: 40,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: 12 }}>💳</Text>
            <Text style={{ fontSize: 16, color: theme.textSecondary, textAlign: 'center', marginBottom: 20 }}>
              {t('card.noCards')}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
              }}
              onPress={() => router.push('/(modals)/add-card')}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                {t('card.addFirstCard')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {cards.map(card => (
              <View
                key={card.id}
                style={{
                  backgroundColor: card.color,
                  borderRadius: 12,
                  padding: 16,
                  minHeight: 120,
                }}
              >
                <View style={{ flex: 1, justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                        {t('cardCompanies.' + card.company)}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginTop: 2 }}>
                        {card.name}
                      </Text>
                    </View>
                    {card.isDefault && (
                      <View
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ fontSize: 10, color: '#FFFFFF' }}>{t('card.defaultBadge')}</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                      {card.type === 'credit' ? t('card.credit') : card.type === 'debit' ? t('card.debit') : t('card.prepaid')}
                    </Text>

                    {editMode ? (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {!card.isDefault && (
                          <TouchableOpacity
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.2)',
                              padding: 8,
                              borderRadius: 8,
                            }}
                            onPress={() => handleSetDefault(card)}
                          >
                            <Ionicons name="star-outline" size={16} color="#FFFFFF" />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={{
                            backgroundColor: 'rgba(239,68,68,0.8)',
                            padding: 8,
                            borderRadius: 8,
                          }}
                          onPress={() => handleDelete(card)}
                        >
                          <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Ionicons name="card" size={24} color="rgba(255,255,255,0.5)" />
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 카드 추가 버튼 */}
      {cards.length > 0 && (
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: theme.border }}>
          {/* 무료 사용자 카드 제한 안내 */}
          {!isSubscribed && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center' }}>
                {t('card.cardCount', { count: cards.length, max: FREE_CARD_LIMIT })}
                {!canAddMoreCards && ` ${t('card.premiumUnlimited')}`}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={{
              backgroundColor: canAddMoreCards ? theme.primary : theme.textMuted,
              padding: 16,
              borderRadius: 8,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
            onPress={() => {
              if (canAddMoreCards) {
                router.push('/(modals)/add-card');
              } else {
                Alert.alert(
                  t('card.registerLimitTitle'),
                  t('card.registerLimitMessage', { max: FREE_CARD_LIMIT }),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('card.premiumSubscribe'),
                      onPress: () => router.push('/(modals)/subscription'),
                    },
                  ]
                );
              }
            }}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              {t('card.addNewCard')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
