export interface Transaction {
  id: string;
  user_id: string;
  merchant_name: string;
  transaction_date: string;
  amount_spent: number;
  bitcoin_rewards: number; // Denominated in USDC, not BTC
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractedTransaction {
  merchant_name: string;
  transaction_date: string;
  amount_spent: number;
  bitcoin_rewards: number;
}

export interface VideoProcessResult {
  transactions: ExtractedTransaction[];
  duplicates: number;
  added: number;
}
