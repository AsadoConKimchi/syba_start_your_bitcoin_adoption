import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { CustomCategory, CategoryGroup } from '../types/category';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../constants/categories';
import { saveEncrypted, loadEncrypted, FILE_PATHS } from '../utils/storage';
import { useAuthStore } from './authStore';

interface CategoryState {
  groups: CategoryGroup[];
  activeGroupId: string; // 'default' = 기본 그룹
  isLoaded: boolean;
}

interface CategoryActions {
  loadCategories: (encryptionKey: string) => Promise<void>;
  addGroup: (name: string) => Promise<void>;
  updateGroup: (groupId: string, updates: Partial<Pick<CategoryGroup, 'name'>>) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  setActiveGroup: (groupId: string) => Promise<void>;
  addCategory: (groupId: string, type: 'expense' | 'income', category: Omit<CustomCategory, 'id'>) => Promise<void>;
  updateCategory: (groupId: string, type: 'expense' | 'income', categoryId: string, updates: Partial<CustomCategory>) => Promise<void>;
  deleteCategory: (groupId: string, type: 'expense' | 'income', categoryId: string) => Promise<void>;
  reorderCategories: (groupId: string, type: 'expense' | 'income', categories: CustomCategory[]) => Promise<void>;
  getActiveExpenseCategories: () => CustomCategory[];
  getActiveIncomeCategories: () => CustomCategory[];
}

const saveState = async (state: { groups: CategoryGroup[]; activeGroupId: string }) => {
  const encryptionKey = useAuthStore.getState().getEncryptionKey();
  if (!encryptionKey) {
    if (__DEV__) console.log('[categoryStore] No encryption key, skip save');
    return;
  }
  await saveEncrypted(FILE_PATHS.CATEGORIES, state, encryptionKey);
};

export const useCategoryStore = create<CategoryState & CategoryActions>((set, get) => ({
  groups: [],
  activeGroupId: 'default',
  isLoaded: false,

  loadCategories: async (encryptionKey: string) => {
    try {
      const data = await loadEncrypted<{ groups: CategoryGroup[]; activeGroupId: string } | { expense: unknown[]; income: unknown[] }>(
        FILE_PATHS.CATEGORIES,
        encryptionKey,
        { groups: [], activeGroupId: 'default' }
      );

      // Migration: v1.1.1 이전 포맷 { expense: [], income: [] } → 신규 그룹 포맷으로 변환
      if ('expense' in data && !('groups' in data)) {
        if (__DEV__) console.log('[categoryStore] Migrating old format → groups');
        const oldData = data as { expense: unknown[]; income: unknown[] };
        const hasCustomData =
          (Array.isArray(oldData.expense) && oldData.expense.length > 0) ||
          (Array.isArray(oldData.income) && oldData.income.length > 0);

        if (hasCustomData) {
          // 사용자 커스텀 카테고리를 "마이그레이션" 그룹으로 보존
          const now = new Date().toISOString();
          const migratedGroup: CategoryGroup = {
            id: uuidv4(),
            name: 'My Categories',
            isDefault: false,
            expenseCategories: Array.isArray(oldData.expense)
              ? oldData.expense.filter((c): c is CustomCategory =>
                  typeof c === 'object' && c !== null && 'id' in c && 'name' in c && 'icon' in c && 'color' in c
                )
              : [...DEFAULT_EXPENSE_CATEGORIES],
            incomeCategories: Array.isArray(oldData.income)
              ? oldData.income.filter((c): c is CustomCategory =>
                  typeof c === 'object' && c !== null && 'id' in c && 'name' in c && 'icon' in c && 'color' in c
                )
              : [...DEFAULT_INCOME_CATEGORIES],
            createdAt: now,
            updatedAt: now,
          };
          const groups = [migratedGroup];
          const activeGroupId = migratedGroup.id;
          set({ groups, activeGroupId, isLoaded: true });
          await saveEncrypted(FILE_PATHS.CATEGORIES, { groups, activeGroupId }, encryptionKey);
          if (__DEV__) console.log('[categoryStore] Migrated old categories to group:', migratedGroup.id);
        } else {
          set({ groups: [], activeGroupId: 'default', isLoaded: true });
        }
        return;
      }

      const typed = data as { groups: CategoryGroup[]; activeGroupId: string };
      set({
        groups: typed.groups || [],
        activeGroupId: typed.activeGroupId || 'default',
        isLoaded: true,
      });
      if (__DEV__) console.log('[categoryStore] Loaded', typed.groups?.length, 'groups, active:', typed.activeGroupId);
    } catch (error) {
      if (__DEV__) console.log('[categoryStore] Load error:', error);
      set({ groups: [], activeGroupId: 'default', isLoaded: true });
    }
  },

  addGroup: async (name: string) => {
    const now = new Date().toISOString();
    const newGroup: CategoryGroup = {
      id: uuidv4(),
      name,
      isDefault: false,
      expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
      incomeCategories: [...DEFAULT_INCOME_CATEGORIES],
      createdAt: now,
      updatedAt: now,
    };
    const groups = [...get().groups, newGroup];
    set({ groups });
    await saveState({ groups, activeGroupId: get().activeGroupId });
    if (__DEV__) console.log('[categoryStore] Added group:', name);
  },

  updateGroup: async (groupId: string, updates) => {
    const groups = get().groups.map(g =>
      g.id === groupId ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g
    );
    set({ groups });
    await saveState({ groups, activeGroupId: get().activeGroupId });
  },

  deleteGroup: async (groupId: string) => {
    const groups = get().groups.filter(g => g.id !== groupId);
    let activeGroupId = get().activeGroupId;
    if (activeGroupId === groupId) activeGroupId = 'default';
    set({ groups, activeGroupId });
    await saveState({ groups, activeGroupId });
    if (__DEV__) console.log('[categoryStore] Deleted group:', groupId);
  },

  setActiveGroup: async (groupId: string) => {
    set({ activeGroupId: groupId });
    await saveState({ groups: get().groups, activeGroupId: groupId });
    if (__DEV__) console.log('[categoryStore] Active group set to:', groupId);
  },

  addCategory: async (groupId, type, category) => {
    const newCat: CustomCategory = { ...category, id: uuidv4() };
    const key = type === 'expense' ? 'expenseCategories' : 'incomeCategories';
    const groups = get().groups.map(g =>
      g.id === groupId
        ? { ...g, [key]: [...g[key], newCat], updatedAt: new Date().toISOString() }
        : g
    );
    set({ groups });
    await saveState({ groups, activeGroupId: get().activeGroupId });
  },

  updateCategory: async (groupId, type, categoryId, updates) => {
    const key = type === 'expense' ? 'expenseCategories' : 'incomeCategories';
    const groups = get().groups.map(g =>
      g.id === groupId
        ? {
            ...g,
            [key]: g[key].map((c: CustomCategory) => (c.id === categoryId ? { ...c, ...updates } : c)),
            updatedAt: new Date().toISOString(),
          }
        : g
    );
    set({ groups });
    await saveState({ groups, activeGroupId: get().activeGroupId });
  },

  deleteCategory: async (groupId, type, categoryId) => {
    const key = type === 'expense' ? 'expenseCategories' : 'incomeCategories';
    const groups = get().groups.map(g =>
      g.id === groupId
        ? {
            ...g,
            [key]: g[key].filter((c: CustomCategory) => c.id !== categoryId),
            updatedAt: new Date().toISOString(),
          }
        : g
    );
    set({ groups });
    await saveState({ groups, activeGroupId: get().activeGroupId });
  },

  reorderCategories: async (groupId, type, categories) => {
    const key = type === 'expense' ? 'expenseCategories' : 'incomeCategories';
    const groups = get().groups.map(g =>
      g.id === groupId ? { ...g, [key]: categories, updatedAt: new Date().toISOString() } : g
    );
    set({ groups });
    await saveState({ groups, activeGroupId: get().activeGroupId });
  },

  getActiveExpenseCategories: () => {
    const { activeGroupId, groups } = get();
    if (activeGroupId === 'default') return [...DEFAULT_EXPENSE_CATEGORIES];
    const group = groups.find(g => g.id === activeGroupId);
    return group?.expenseCategories ?? [...DEFAULT_EXPENSE_CATEGORIES];
  },

  getActiveIncomeCategories: () => {
    const { activeGroupId, groups } = get();
    if (activeGroupId === 'default') return [...DEFAULT_INCOME_CATEGORIES];
    const group = groups.find(g => g.id === activeGroupId);
    return group?.incomeCategories ?? [...DEFAULT_INCOME_CATEGORIES];
  },
}));
