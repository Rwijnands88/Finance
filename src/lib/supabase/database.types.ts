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
        Relationships: [];
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
        Relationships: [];
      };
      household_members: {
        Row: {
          household_id: string;
          user_id: string;
          role: "member";
          created_at: string;
        };
        Insert: {
          household_id: string;
          user_id: string;
          role?: "member";
          created_at?: string;
        };
        Update: {
          role?: "member";
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          kind: "shared" | "personal";
          owner_user_id: string | null;
          opening_balance: number;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          kind: "shared" | "personal";
          owner_user_id?: string | null;
          opening_balance?: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          kind?: "shared" | "personal";
          owner_user_id?: string | null;
          opening_balance?: number;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          kind: "fixed" | "variable" | "both";
          color: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          kind: "fixed" | "variable" | "both";
          color?: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          kind?: "fixed" | "variable" | "both";
          color?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      recurring_expenses: {
        Row: {
          id: string;
          household_id: string;
          account_id: string | null;
          name: string;
          category_id: string;
          current_amount: number;
          starts_on: string;
          ends_on: string | null;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          account_id?: string | null;
          name: string;
          category_id: string;
          current_amount: number;
          starts_on: string;
          ends_on?: string | null;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          name?: string;
          category_id?: string;
          current_amount?: number;
          starts_on?: string;
          ends_on?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      fixed_expense_instances: {
        Row: {
          id: string;
          household_id: string;
          recurring_expense_id: string;
          month: string;
          name_snapshot: string;
          category_id: string;
          amount_snapshot: number;
          status: "pending" | "confirmed" | "adjusted" | "skipped";
          confirmed_by: string | null;
          confirmed_at: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          recurring_expense_id: string;
          month: string;
          name_snapshot: string;
          category_id: string;
          amount_snapshot: number;
          status?: "pending" | "confirmed" | "adjusted" | "skipped";
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name_snapshot?: string;
          category_id?: string;
          amount_snapshot?: number;
          status?: "pending" | "confirmed" | "adjusted" | "skipped";
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          note?: string | null;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          household_id: string;
          account_id: string | null;
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
          account_id?: string | null;
          fixed_expense_instance_id?: string | null;
          category_id: string;
          amount: number;
          transaction_date: string;
          type: "fixed" | "variable";
          note?: string | null;
          entered_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          amount?: number;
          transaction_date?: string;
          note?: string | null;
          category_id?: string;
        };
        Relationships: [];
      };
      fuel_details: {
        Row: {
          transaction_id: string;
          vehicle_id: string;
          liters: number;
        };
        Insert: {
          transaction_id: string;
          vehicle_id: string;
          liters: number;
        };
        Update: {
          vehicle_id?: string;
          liters?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      monthly_category_totals: {
        Row: {
          household_id: string;
          month: string;
          category_id: string;
          category_name: string;
          category_kind: "fixed" | "variable" | "both";
          category_color: string;
          total_amount: number;
        };
        Relationships: [];
      };
      monthly_person_totals: {
        Row: {
          household_id: string;
          month: string;
          entered_by: string;
          display_name: string;
          total_amount: number;
        };
        Relationships: [];
      };
      monthly_account_category_totals: {
        Row: {
          household_id: string;
          account_id: string;
          account_name: string;
          account_kind: "shared" | "personal";
          month: string;
          category_id: string;
          category_name: string;
          category_kind: "fixed" | "variable" | "both";
          category_color: string;
          total_amount: number;
        };
        Relationships: [];
      };
      monthly_account_person_totals: {
        Row: {
          household_id: string;
          account_id: string;
          account_name: string;
          account_kind: "shared" | "personal";
          month: string;
          entered_by: string;
          display_name: string;
          total_amount: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      can_access_account: {
        Args: {
          target_account_id: string;
        };
        Returns: boolean;
      };
      create_fixed_instances_for_month: {
        Args: {
          target_household_id: string;
          target_month: string;
        };
        Returns: Database["public"]["Tables"]["fixed_expense_instances"]["Row"][];
      };
      confirm_fixed_expense_instance: {
        Args: {
          target_instance_id: string;
          target_amount?: number | null;
          target_note?: string | null;
        };
        Returns: Database["public"]["Tables"]["transactions"]["Row"];
      };
      seed_default_accounts: {
        Args: {
          target_household_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
