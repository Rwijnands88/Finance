export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          created_at?: string;
        };
        Update: {
          display_name?: string;
        };
      };
      households: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          name?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          household_id: string;
          fixed_expense_instance_id: string | null;
          category_id: string;
          amount: number;
          transaction_date: string;
          type: "fixed" | "variable";
          note: string | null;
          entered_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          fixed_expense_instance_id?: string | null;
          category_id: string;
          amount: number;
          transaction_date: string;
          type: "fixed" | "variable";
          note?: string | null;
          entered_by: string;
        };
        Update: {
          amount?: number;
          transaction_date?: string;
          note?: string | null;
          category_id?: string;
        };
      };
    };
  };
};
