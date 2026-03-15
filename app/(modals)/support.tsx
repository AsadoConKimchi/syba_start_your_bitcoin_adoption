import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { useAuthStore } from '../../src/stores/authStore';
import { createTicket, getMyTickets } from '../../src/services/supportService';
import { generateDiagnosticReport } from '../../src/services/diagnosticService';
import { SUPPORT_EMAIL } from '../../src/constants/config';
import type { SupportTicket, TicketCategory, TicketStatus } from '../../src/types/support';
import { TICKET_CATEGORIES } from '../../src/types/support';

// 상태별 색상
const STATUS_COLORS: Record<TicketStatus, string> = {
  open: '#3B82F6',
  in_progress: '#F59E0B',
  waiting_user: '#EF4444',
  resolved: '#10B981',
  closed: '#6B7280',
};

export default function SupportScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useSubscriptionStore();
  const { encryptionKey } = useAuthStore();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewTicket, setShowNewTicket] = useState(false);

  // 새 티켓 폼
  const [category, setCategory] = useState<TicketCategory>('other');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachDiagnostics, setAttachDiagnostics] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const result = await getMyTickets(user.id);
    setTickets(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // 카테고리 변경 시 진단 데이터 첨부 기본값 설정
  const handleCategoryChange = (cat: TicketCategory) => {
    setCategory(cat);
    setAttachDiagnostics(cat === 'bug' || cat === 'account');
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!subject.trim() || !message.trim()) {
      Alert.alert('', t('support.subject') + ' / ' + t('support.message'));
      return;
    }

    setIsSubmitting(true);

    // 진단 데이터 생성
    let diagnosticData: Record<string, unknown> | undefined;
    if (attachDiagnostics && encryptionKey) {
      try {
        diagnosticData = await generateDiagnosticReport(encryptionKey) as unknown as Record<string, unknown>;
      } catch {
        // 진단 데이터 생성 실패 시 무시하고 티켓만 제출
      }
    }

    const ticket = await createTicket(user.id, category, subject.trim(), message.trim(), diagnosticData);
    setIsSubmitting(false);

    if (ticket) {
      Alert.alert('', t('support.submitSuccess'));
      setShowNewTicket(false);
      setSubject('');
      setMessage('');
      setCategory('other');
      setAttachDiagnostics(false);
      loadTickets();
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* 헤더 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, flex: 1 }}>
          {t('support.title')}
        </Text>
        {user && (
          <TouchableOpacity
            onPress={() => setShowNewTicket(true)}
            style={{ backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
          >
            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>
              {t('support.newTicket')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {!user ? (
        // 미로그인 상태
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={theme.textMuted} />
          <Text style={{ fontSize: 16, color: theme.textMuted, marginTop: 16, textAlign: 'center' }}>
            {t('support.loginRequired')}
          </Text>
          <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 12 }}>
            {t('support.contactEmail')}: {SUPPORT_EMAIL}
          </Text>
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {/* 이메일 문의 안내 */}
          <View style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: theme.textMuted }}>
              {t('support.contactEmail')}: {SUPPORT_EMAIL}
            </Text>
          </View>

          {/* 티켓 목록 */}
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>
            {t('support.myTickets')}
          </Text>

          {tickets.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Ionicons name="document-text-outline" size={40} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, marginTop: 12 }}>{t('support.noTickets')}</Text>
            </View>
          ) : (
            tickets.map((ticket) => (
              <TouchableOpacity
                key={ticket.id}
                onPress={() => router.push({ pathname: '/(modals)/ticket-detail', params: { ticketId: ticket.id } })}
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{
                    backgroundColor: STATUS_COLORS[ticket.status] + '20',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}>
                    <Text style={{ fontSize: 11, color: STATUS_COLORS[ticket.status], fontWeight: '600' }}>
                      {t(`support.status.${ticket.status}`)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginLeft: 8 }}>
                    {t(`support.categories.${ticket.category}`)}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginLeft: 'auto' }}>
                    {formatDate(ticket.updated_at)}
                  </Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '500', color: theme.text }} numberOfLines={1}>
                  {ticket.subject}
                </Text>
                {ticket.last_message && (
                  <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }} numberOfLines={1}>
                    {ticket.last_sender === 'admin' ? `${t('support.admin')}: ` : ''}{ticket.last_message}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* 새 티켓 모달 */}
      <Modal visible={showNewTicket} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <TouchableOpacity onPress={() => setShowNewTicket(false)} style={{ marginRight: 12 }}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, flex: 1 }}>
              {t('support.newTicket')}
            </Text>
          </View>

          <ScrollView style={{ flex: 1, padding: 16 }}>
            {/* 카테고리 선택 */}
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 8 }}>
              {t('support.category')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {TICKET_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => handleCategoryChange(cat)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: category === cat ? theme.primary : theme.backgroundSecondary,
                  }}
                >
                  <Text style={{
                    fontSize: 13,
                    color: category === cat ? '#FFF' : theme.text,
                    fontWeight: category === cat ? '600' : '400',
                  }}>
                    {t(`support.categories.${cat}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 제목 */}
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 8 }}>
              {t('support.subject')}
            </Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder={t('support.subject')}
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.inputBorder,
                padding: 12,
                fontSize: 15,
                marginBottom: 20,
              }}
              placeholderTextColor={theme.textMuted}
              maxLength={100}
            />

            {/* 내용 */}
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 8 }}>
              {t('support.message')}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t('support.message')}
              multiline
              numberOfLines={6}
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.inputBorder,
                padding: 12,
                fontSize: 15,
                minHeight: 120,
                textAlignVertical: 'top',
                marginBottom: 24,
              }}
              placeholderTextColor={theme.textMuted}
              maxLength={2000}
            />

            {/* 진단 데이터 첨부 토글 */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: theme.backgroundSecondary,
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
            }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 14, color: theme.text }}>
                  {t('diagnostics.attachToTicket')}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                  {t('diagnostics.description')}
                </Text>
              </View>
              <Switch
                value={attachDiagnostics}
                onValueChange={setAttachDiagnostics}
                trackColor={{ false: theme.textMuted, true: theme.primary }}
              />
            </View>

            {/* 제출 버튼 */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSubmitting || !subject.trim() || !message.trim()}
              style={{
                backgroundColor: (!subject.trim() || !message.trim()) ? theme.textMuted : theme.primary,
                paddingVertical: 14,
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>
                  {t('support.submit')}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
