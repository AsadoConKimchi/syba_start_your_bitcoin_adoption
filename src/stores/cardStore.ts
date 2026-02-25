import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Card } from '../types/card';
import { saveEncrypted, loadEncrypted, FILE_PATHS } from '../utils/storage';
import { useAuthStore } from './authStore';

interface CardState {
  cards: Card[];
  isLoading: boolean;
}

interface CardActions {
  loadCards: () => Promise<void>;
  saveCards: () => Promise<void>;
  addCard: (card: Omit<Card, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateCard: (id: string, updates: Partial<Card>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  getDefaultCard: () => Card | undefined;
  getCardById: (id: string) => Card | undefined;
  setDefaultCard: (id: string) => Promise<void>;
  updateCardBalance: (cardId: string, delta: number) => Promise<void>;
}

export const useCardStore = create<CardState & CardActions>((set, get) => ({
  cards: [],
  isLoading: false,

  loadCards: async () => {
    const encryptionKey = useAuthStore.getState().getEncryptionKey();
    if (!encryptionKey) return;

    set({ isLoading: true });
    const cards = await loadEncrypted<Card[]>(
      FILE_PATHS.CARDS,
      encryptionKey,
      []
    );
    set({ cards, isLoading: false });
  },

  saveCards: async () => {
    console.log('[DEBUG] saveCards 시작');
    const encryptionKey = useAuthStore.getState().getEncryptionKey();
    console.log('[DEBUG] encryptionKey:', encryptionKey ? '있음' : '없음 (null)');

    if (!encryptionKey) {
      console.log('[DEBUG] encryptionKey가 없어서 카드 저장 중단');
      return;
    }

    try {
      await saveEncrypted(FILE_PATHS.CARDS, get().cards, encryptionKey);
      console.log('[DEBUG] 카드 저장 성공');
    } catch (error) {
      console.log('[DEBUG] 카드 저장 실패:', error);
      throw error;
    }
  },

  addCard: async (cardData) => {
    const now = new Date().toISOString();
    const { cards } = get();

    // 첫 번째 카드면 기본 카드로 설정
    const isDefault = cards.length === 0 ? true : cardData.isDefault;

    // 새 카드가 기본 카드면 기존 기본 카드 해제
    let updatedCards = cards;
    if (isDefault) {
      updatedCards = cards.map(c => ({ ...c, isDefault: false }));
    }

    const card: Card = {
      ...cardData,
      id: uuidv4(),
      isDefault,
      createdAt: now,
      updatedAt: now,
    };

    set({ cards: [...updatedCards, card] });
    await get().saveCards();
  },

  updateCard: async (id, updates) => {
    set(state => ({
      cards: state.cards.map(card =>
        card.id === id
          ? { ...card, ...updates, updatedAt: new Date().toISOString() }
          : card
      ),
    }));
    await get().saveCards();
  },

  deleteCard: async (id) => {
    const { cards } = get();
    const deletedCard = cards.find(c => c.id === id);
    const remainingCards = cards.filter(c => c.id !== id);

    // 삭제된 카드가 기본 카드였으면 첫 번째 카드를 기본으로
    if (deletedCard?.isDefault && remainingCards.length > 0) {
      remainingCards[0].isDefault = true;
    }

    set({ cards: remainingCards });
    await get().saveCards();
  },

  getDefaultCard: () => {
    return get().cards.find(c => c.isDefault);
  },

  getCardById: (id: string) => {
    return get().cards.find(c => c.id === id);
  },

  updateCardBalance: async (cardId, delta) => {
    const card = get().cards.find(c => c.id === cardId);
    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }
    if (card.type !== 'prepaid') {
      throw new Error(`Card is not prepaid: ${cardId}`);
    }
    const currentBalance = card.balance ?? 0;
    const newBalance = currentBalance + delta;
    if (__DEV__) { console.log(`[updateCardBalance] ${card.name}: ${currentBalance} → ${newBalance} (${delta >= 0 ? '+' : ''}${delta})`); }

    set(state => ({
      cards: state.cards.map(c =>
        c.id === cardId
          ? { ...c, balance: newBalance, updatedAt: new Date().toISOString() }
          : c
      ),
    }));
    await get().saveCards();
  },

  setDefaultCard: async (id) => {
    set(state => ({
      cards: state.cards.map(card => ({
        ...card,
        isDefault: card.id === id,
        updatedAt: card.id === id ? new Date().toISOString() : card.updatedAt,
      })),
    }));
    await get().saveCards();
  },
}));
