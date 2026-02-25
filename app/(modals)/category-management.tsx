import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useCategoryStore } from '../../src/stores/categoryStore';
import { useAuthStore } from '../../src/stores/authStore';
import { CustomCategory } from '../../src/types/category';

const COLOR_PALETTE = [
  '#FF6B6B', '#4ECDC4', '#A78BFA', '#F472B6', '#60A5FA',
  '#34D399', '#FBBF24', '#818CF8', '#F87171', '#2DD4BF',
  '#F7931A', '#9CA3AF',
];

type TabType = 'expense' | 'income';

export default function CategoryManagementScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { getEncryptionKey } = useAuthStore();
  const encryptionKey = getEncryptionKey();
  const {
    groups, activeGroupId, isLoaded,
    loadCategories, addGroup, updateGroup, deleteGroup, setActiveGroup,
    addCategory, updateCategory, deleteCategory,
    getActiveExpenseCategories, getActiveIncomeCategories,
  } = useCategoryStore();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('expense');

  // Modals
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [catColor, setCatColor] = useState(COLOR_PALETTE[0]);

  useEffect(() => {
    if (encryptionKey && !isLoaded) {
      loadCategories(encryptionKey);
    }
  }, [encryptionKey, isLoaded]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null;

  const categories: CustomCategory[] = selectedGroup
    ? (activeTab === 'expense' ? selectedGroup.expenseCategories : selectedGroup.incomeCategories)
    : [];

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    await addGroup(newGroupName.trim());
    setNewGroupName('');
    setShowNewGroupModal(false);
  };

  const handleDeleteGroup = (groupId: string) => {
    Alert.alert(
      t('categoryGroup.deleteGroup'),
      t('categoryGroup.deleteGroupConfirm'),
      [
        { text: t('categoryGroup.cancel'), style: 'cancel' },
        {
          text: t('categoryGroup.deleteGroup'),
          style: 'destructive',
          onPress: async () => {
            await deleteGroup(groupId);
            if (selectedGroupId === groupId) setSelectedGroupId(null);
          },
        },
      ]
    );
  };

  const handleActivateGroup = async (groupId: string) => {
    await setActiveGroup(groupId);
  };

  const openAddCategory = () => {
    setEditingCategory(null);
    setCatName('');
    setCatIcon('');
    setCatColor(COLOR_PALETTE[0]);
    setShowCategoryModal(true);
  };

  const openEditCategory = (cat: CustomCategory) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatIcon(cat.icon);
    setCatColor(cat.color);
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!catName.trim() || !catIcon.trim() || !selectedGroupId) return;
    if (editingCategory) {
      await updateCategory(selectedGroupId, activeTab, editingCategory.id, {
        name: catName.trim(),
        icon: catIcon.trim(),
        color: catColor,
      });
    } else {
      await addCategory(selectedGroupId, activeTab, {
        name: catName.trim(),
        icon: catIcon.trim(),
        color: catColor,
      });
    }
    setShowCategoryModal(false);
  };

  const handleDeleteCategory = (catId: string) => {
    if (!selectedGroupId) return;
    Alert.alert(
      t('categoryGroup.deleteCategory'),
      t('categoryGroup.deleteCategoryConfirm'),
      [
        { text: t('categoryGroup.cancel'), style: 'cancel' },
        {
          text: t('categoryGroup.deleteCategory'),
          style: 'destructive',
          onPress: () => deleteCategory(selectedGroupId, activeTab, catId),
        },
      ]
    );
  };

  // ── Group List View ──
  if (!selectedGroupId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border,
        }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
            {t('categoryGroup.title')}
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }}>
          {/* Default Group */}
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', padding: 16,
              backgroundColor: theme.backgroundSecondary, borderRadius: 12, marginBottom: 12,
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 20, marginRight: 12 }}>📌</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>
                {t('categoryGroup.defaultGroup')}
              </Text>
            </View>
            {activeGroupId === 'default' && (
              <View style={{
                backgroundColor: '#22C55E', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
              }}>
                <Text style={{ fontSize: 12, color: '#FFFFFF', fontWeight: '600' }}>
                  {t('categoryGroup.activeGroup')}
                </Text>
              </View>
            )}
            {activeGroupId !== 'default' && (
              <TouchableOpacity
                style={{
                  backgroundColor: theme.backgroundTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                }}
                onPress={() => handleActivateGroup('default')}
              >
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                  {t('categoryGroup.useThisGroup')}
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Custom Groups */}
          {groups.map(group => (
            <TouchableOpacity
              key={group.id}
              style={{
                flexDirection: 'row', alignItems: 'center', padding: 16,
                backgroundColor: theme.backgroundSecondary, borderRadius: 12, marginBottom: 12,
              }}
              onPress={() => setSelectedGroupId(group.id)}
              onLongPress={() => handleDeleteGroup(group.id)}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>
                  {group.name}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                  {t('categoryGroup.expenseTab')} {group.expenseCategories.length} · {t('categoryGroup.incomeTab')} {group.incomeCategories.length}
                </Text>
              </View>
              {activeGroupId === group.id && (
                <View style={{
                  backgroundColor: '#22C55E', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 8,
                }}>
                  <Text style={{ fontSize: 12, color: '#FFFFFF', fontWeight: '600' }}>
                    {t('categoryGroup.activeGroup')}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ))}

          {/* New Group Button */}
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.border,
              borderStyle: 'dashed', marginTop: 8,
            }}
            onPress={() => setShowNewGroupModal(true)}
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.primary} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 16, color: theme.primary, fontWeight: '600' }}>
              {t('categoryGroup.newGroup')}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* New Group Modal */}
        <Modal visible={showNewGroupModal} transparent animationType="fade">
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.modalOverlay }}>
            <View style={{ backgroundColor: theme.modalBackground, borderRadius: 16, padding: 24, width: '85%' }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text, marginBottom: 16 }}>
                {t('categoryGroup.newGroup')}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8,
                  padding: 12, fontSize: 16, color: theme.inputText, marginBottom: 16,
                }}
                placeholder={t('categoryGroup.enterGroupName')}
                placeholderTextColor={theme.placeholder}
                value={newGroupName}
                onChangeText={setNewGroupName}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: theme.backgroundTertiary, alignItems: 'center' }}
                  onPress={() => { setShowNewGroupModal(false); setNewGroupName(''); }}
                >
                  <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('categoryGroup.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', opacity: newGroupName.trim() ? 1 : 0.5 }}
                  onPress={handleCreateGroup}
                  disabled={!newGroupName.trim()}
                >
                  <Text style={{ fontSize: 16, color: '#FFFFFF', fontWeight: '600' }}>{t('categoryGroup.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Group Detail View ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border,
      }}>
        <TouchableOpacity onPress={() => setSelectedGroupId(null)} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={theme.primary} />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text, marginLeft: 8 }}>
            {selectedGroup?.name ?? ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, gap: 8 }}>
        {(['expense', 'income'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
              backgroundColor: activeTab === tab
                ? (tab === 'expense' ? '#EF4444' : '#22C55E')
                : theme.backgroundTertiary,
            }}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={{
              fontSize: 14, fontWeight: '600',
              color: activeTab === tab ? '#FFFFFF' : theme.textSecondary,
            }}>
              {t(`categoryGroup.${tab}Tab`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category List */}
      <ScrollView style={{ flex: 1, padding: 20 }}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={{
              flexDirection: 'row', alignItems: 'center', padding: 14,
              backgroundColor: theme.backgroundSecondary, borderRadius: 10, marginBottom: 8,
            }}
            onPress={() => openEditCategory(cat)}
            onLongPress={() => handleDeleteCategory(cat.id)}
          >
            <View style={{
              width: 36, height: 36, borderRadius: 18, backgroundColor: cat.color + '22',
              alignItems: 'center', justifyContent: 'center', marginRight: 12,
            }}>
              <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{cat.name}</Text>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: cat.color, marginRight: 8 }} />
            <Ionicons name="pencil-outline" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        ))}

        {/* Add Category */}
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            padding: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.border,
            borderStyle: 'dashed', marginTop: 4,
          }}
          onPress={openAddCategory}
        >
          <Ionicons name="add" size={20} color={theme.primary} style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 14, color: theme.primary, fontWeight: '600' }}>
            {t('categoryGroup.addCategory')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom: Activate Group */}
      <View style={{ padding: 20, paddingBottom: Platform.OS === 'ios' ? 20 : 20, borderTopWidth: 1, borderTopColor: theme.border }}>
        {activeGroupId === selectedGroupId ? (
          <View style={{ padding: 16, borderRadius: 8, backgroundColor: '#22C55E22', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, color: '#22C55E', fontWeight: '600' }}>
              ✓ {t('categoryGroup.usingGroup')}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={{ padding: 16, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center' }}
            onPress={() => selectedGroupId && handleActivateGroup(selectedGroupId)}
          >
            <Text style={{ fontSize: 16, color: '#FFFFFF', fontWeight: '600' }}>
              {t('categoryGroup.useThisGroup')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Add/Edit Category Modal */}
      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderRadius: 16, padding: 24, width: '85%' }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text, marginBottom: 16 }}>
              {editingCategory ? t('categoryGroup.editCategory') : t('categoryGroup.addCategory')}
            </Text>

            {/* Name */}
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>
              {t('categoryGroup.categoryName')}
            </Text>
            <TextInput
              style={{
                borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8,
                padding: 12, fontSize: 16, color: theme.inputText, marginBottom: 14,
              }}
              placeholder={t('categoryGroup.enterCategoryName')}
              placeholderTextColor={theme.placeholder}
              value={catName}
              onChangeText={setCatName}
              autoFocus
            />

            {/* Icon */}
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>
              {t('categoryGroup.categoryIcon')}
            </Text>
            <TextInput
              style={{
                borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8,
                padding: 12, fontSize: 24, color: theme.inputText, marginBottom: 14, textAlign: 'center',
              }}
              placeholder={t('categoryGroup.enterCategoryIcon')}
              placeholderTextColor={theme.placeholder}
              value={catIcon}
              onChangeText={(text) => setCatIcon(text.slice(-2))}  // keep last emoji
            />

            {/* Color */}
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>
              {t('categoryGroup.categoryColor')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {COLOR_PALETTE.map(color => (
                <TouchableOpacity
                  key={color}
                  style={{
                    width: 36, height: 36, borderRadius: 18, backgroundColor: color,
                    borderWidth: catColor === color ? 3 : 0, borderColor: theme.text,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  onPress={() => setCatColor(color)}
                >
                  {catColor === color && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: theme.backgroundTertiary, alignItems: 'center' }}
                onPress={() => setShowCategoryModal(false)}
              >
                <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('categoryGroup.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1, padding: 12, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center',
                  opacity: catName.trim() && catIcon.trim() ? 1 : 0.5,
                }}
                onPress={handleSaveCategory}
                disabled={!catName.trim() || !catIcon.trim()}
              >
                <Text style={{ fontSize: 16, color: '#FFFFFF', fontWeight: '600' }}>{t('categoryGroup.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
