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
import { useCardStore } from '../../src/stores/cardStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { Card } from '../../src/types/card';

const FREE_CARD_LIMIT = 3;

export default function CardListScreen() {
  const { cards, deleteCard, setDefaultCard } = useCardStore();
  const { isSubscribed } = useSubscriptionStore();
  const [editMode, setEditMode] = useState(false);

  // 무료 사용자의 경우 카드 추가 가능 여부
  const canAddMoreCards = isSubscribed || cards.length < FREE_CARD_LIMIT;

  const handleDelete = (card: Card) => {
    Alert.alert(
      '카드 삭제',
      `"${card.name}" 카드를 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => deleteCard(card.id),
        },
      ]
    );
  };

  const handleSetDefault = (card: Card) => {
    setDefaultCard(card.id);
    Alert.alert('기본 카드 설정', `"${card.name}"이(가) 기본 카드로 설정되었습니다.`);
  };

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
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>카드 관리</Text>
        <TouchableOpacity onPress={() => setEditMode(!editMode)}>
          <Text style={{ fontSize: 14, color: '#F7931A' }}>
            {editMode ? '완료' : '편집'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, padding: 20 }}>
        {cards.length === 0 ? (
          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 40,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: 12 }}>💳</Text>
            <Text style={{ fontSize: 16, color: '#666666', textAlign: 'center', marginBottom: 20 }}>
              등록된 카드가 없습니다
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F7931A',
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
              }}
              onPress={() => router.push('/(modals)/add-card')}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                카드 등록하기
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
                  height: 120,
                }}
              >
                <View style={{ flex: 1, justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                        {card.company}
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
                        <Text style={{ fontSize: 10, color: '#FFFFFF' }}>기본</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                      {card.type === 'credit' ? '신용카드' : card.type === 'debit' ? '체크카드' : '선불카드'}
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
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
          {/* 무료 사용자 카드 제한 안내 */}
          {!isSubscribed && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
                {cards.length}/{FREE_CARD_LIMIT}장 등록됨
                {!canAddMoreCards && ' (프리미엄 구독 시 무제한)'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={{
              backgroundColor: canAddMoreCards ? '#F7931A' : '#9CA3AF',
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
                  '카드 등록 제한',
                  `무료 사용자는 최대 ${FREE_CARD_LIMIT}장까지 등록할 수 있습니다.`,
                  [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '프리미엄 구독',
                      onPress: () => router.push('/(modals)/subscription'),
                    },
                  ]
                );
              }
            }}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              새 카드 등록
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
