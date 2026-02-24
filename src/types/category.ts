export interface CustomCategory {
  id: string;
  name: string;
  icon: string;  // 이모지
  color: string; // hex
}

export interface CategoryGroup {
  id: string;
  name: string;
  isDefault: boolean;
  expenseCategories: CustomCategory[];
  incomeCategories: CustomCategory[];
  createdAt: string;
  updatedAt: string;
}
