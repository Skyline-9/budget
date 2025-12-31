export type Transaction = {
  id: string;
  date: string; // YYYY-MM-DD
  amountCents: number; // negative for expense, positive for income
  categoryId: string;
  merchant?: string;
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type TransactionCreate = {
  date: string;
  amountCents: number;
  categoryId: string;
  merchant?: string;
  notes?: string;
};

export type TransactionUpdate = Partial<TransactionCreate>;










