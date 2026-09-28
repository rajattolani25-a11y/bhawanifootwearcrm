export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      credit_payments: {
        Row: {
          amount: number
          collected_by: string | null
          customer_id: string | null
          id: string
          note: string | null
          paid_at: string
          payment_mode: string
          sale_id: string
        }
        Insert: {
          amount: number
          collected_by?: string | null
          customer_id?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          payment_mode?: string
          sale_id: string
        }
        Update: {
          amount?: number
          collected_by?: string | null
          customer_id?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          payment_mode?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          brand_preference: string | null
          created_at: string
          id: string
          is_premium: boolean
          last_stamp_date: string | null
          legacy_id: string | null
          mobile: string
          name: string
          premium_stamps: number
          premium_visits: number
          regular_stamps: number
          regular_visits: number
          shoe_size: string | null
        }
        Insert: {
          brand_preference?: string | null
          created_at?: string
          id?: string
          is_premium?: boolean
          last_stamp_date?: string | null
          legacy_id?: string | null
          mobile: string
          name?: string
          premium_stamps?: number
          premium_visits?: number
          regular_stamps?: number
          regular_visits?: number
          shoe_size?: string | null
        }
        Update: {
          brand_preference?: string | null
          created_at?: string
          id?: string
          is_premium?: boolean
          last_stamp_date?: string | null
          legacy_id?: string | null
          mobile?: string
          name?: string
          premium_stamps?: number
          premium_visits?: number
          regular_stamps?: number
          regular_visits?: number
          shoe_size?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          legacy_id: string | null
          mode: string
          note: string | null
          spent_on: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          legacy_id?: string | null
          mode?: string
          note?: string | null
          spent_on?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          legacy_id?: string | null
          mode?: string
          note?: string | null
          spent_on?: string
        }
        Relationships: []
      }
      loyalty_events: {
        Row: {
          action: string
          created_at: string
          customer_id: string | null
          id: string
          note: string | null
          reward_id: string | null
          sale_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          customer_id?: string | null
          id?: string
          note?: string | null
          reward_id?: string | null
          sale_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          note?: string | null
          reward_id?: string | null
          sale_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          amount: number
          card: string
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          milestone: number
          status: string
          unlocked_at: string
          used_sale_id: string | null
        }
        Insert: {
          amount: number
          card: string
          created_at?: string
          customer_id: string
          expires_at?: string
          id?: string
          milestone: number
          status?: string
          unlocked_at?: string
          used_sale_id?: string | null
        }
        Update: {
          amount?: number
          card?: string
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          milestone?: number
          status?: string
          unlocked_at?: string
          used_sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_used_sale_id_fkey"
            columns: ["used_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      product_costs: {
        Row: {
          product_id: string
          purchase_price: number
        }
        Insert: {
          product_id: string
          purchase_price?: number
        }
        Update: {
          product_id?: string
          purchase_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          created_at: string
          damaged_stock: number
          id: string
          legacy_id: string | null
          min_stock: number
          product_id: string
          rack: string | null
          size: string
          sku: string | null
          stock: number
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          damaged_stock?: number
          id?: string
          legacy_id?: string | null
          min_stock?: number
          product_id: string
          rack?: string | null
          size: string
          sku?: string | null
          stock?: number
        }
        Update: {
          barcode?: string | null
          created_at?: string
          damaged_stock?: number
          id?: string
          legacy_id?: string | null
          min_stock?: number
          product_id?: string
          rack?: string | null
          size?: string
          sku?: string | null
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          article: string
          brand: string
          category: string
          color: string | null
          created_at: string
          gender: string | null
          id: string
          image_url: string | null
          legacy_id: string | null
          mrp: number
          season: string | null
          selling_price: number
          status: string
        }
        Insert: {
          article: string
          brand?: string
          category?: string
          color?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          image_url?: string | null
          legacy_id?: string | null
          mrp?: number
          season?: string | null
          selling_price?: number
          status?: string
        }
        Update: {
          article?: string
          brand?: string
          category?: string
          color?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          image_url?: string | null
          legacy_id?: string | null
          mrp?: number
          season?: string | null
          selling_price?: number
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          gst_amount: number | null
          gst_rate: number | null
          id: string
          invoice_no: string | null
          legacy_id: string | null
          paid_amount: number | null
          purchase_date: string
          purchase_price: number
          quantity: number
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          total: number
          variant_id: string | null
        }
        Insert: {
          gst_amount?: number | null
          gst_rate?: number | null
          id?: string
          invoice_no?: string | null
          legacy_id?: string | null
          paid_amount?: number | null
          purchase_date?: string
          purchase_price?: number
          quantity?: number
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number
          variant_id?: string | null
        }
        Update: {
          gst_amount?: number | null
          gst_rate?: number | null
          id?: string
          invoice_no?: string | null
          legacy_id?: string | null
          paid_amount?: number | null
          purchase_date?: string
          purchase_price?: number
          quantity?: number
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_costs: {
        Row: {
          profit: number
          sale_id: string
          total_cost: number
        }
        Insert: {
          profit?: number
          sale_id: string
          total_cost?: number
        }
        Update: {
          profit?: number
          sale_id?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_costs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          discount: number
          id: string
          price: number
          product_name: string
          qty: number
          sale_id: string
          size: string
          sku: string | null
          variant_id: string | null
        }
        Insert: {
          discount?: number
          id?: string
          price: number
          product_name: string
          qty: number
          sale_id: string
          size: string
          sku?: string | null
          variant_id?: string | null
        }
        Update: {
          discount?: number
          id?: string
          price?: number
          product_name?: string
          qty?: number
          sale_id?: string
          size?: string
          sku?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          created_at: string
          damaged: boolean
          id: string
          kind: string
          note: string | null
          product_name: string
          qty: number
          refund: number
          sale_id: string | null
          sale_item_id: string | null
          size: string
          user_id: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          damaged?: boolean
          id?: string
          kind?: string
          note?: string | null
          product_name?: string
          qty: number
          refund?: number
          sale_id?: string | null
          sale_item_id?: string | null
          size?: string
          user_id?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          damaged?: boolean
          id?: string
          kind?: string
          note?: string | null
          product_name?: string
          qty?: number
          refund?: number
          sale_id?: string | null
          sale_item_id?: string | null
          size?: string
          user_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          bill_no: string
          bill_type: string
          customer_id: string | null
          customer_name: string | null
          discount: number
          due_amount: number
          give_stamp: boolean
          gst_amount: number
          gst_rate: number
          id: string
          legacy_id: string | null
          paid_amount: number
          payment_mode: string
          reward_amount: number
          reward_id: string | null
          sale_date: string
          split_cash: number | null
          staff_id: string | null
          stamp_premium: boolean
          stamp_regular: boolean
          subtotal: number
          tax_mode: string
          taxable: number
          total: number
        }
        Insert: {
          bill_no: string
          bill_type?: string
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          due_amount?: number
          give_stamp?: boolean
          gst_amount?: number
          gst_rate?: number
          id?: string
          legacy_id?: string | null
          paid_amount?: number
          payment_mode?: string
          reward_amount?: number
          reward_id?: string | null
          sale_date?: string
          split_cash?: number | null
          staff_id?: string | null
          stamp_premium?: boolean
          stamp_regular?: boolean
          subtotal?: number
          tax_mode?: string
          taxable?: number
          total?: number
        }
        Update: {
          bill_no?: string
          bill_type?: string
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          due_amount?: number
          give_stamp?: boolean
          gst_amount?: number
          gst_rate?: number
          id?: string
          legacy_id?: string | null
          paid_amount?: number
          payment_mode?: string
          reward_amount?: number
          reward_id?: string | null
          sale_date?: string
          split_cash?: number | null
          staff_id?: string | null
          stamp_premium?: boolean
          stamp_regular?: boolean
          subtotal?: number
          tax_mode?: string
          taxable?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          id: string
          legacy_id: string | null
          moved_at: string
          note: string | null
          product_name: string | null
          qty_in: number
          qty_out: number
          type: string
          user_id: string | null
          variant_id: string | null
        }
        Insert: {
          id?: string
          legacy_id?: string | null
          moved_at?: string
          note?: string | null
          product_name?: string | null
          qty_in?: number
          qty_out?: number
          type: string
          user_id?: string | null
          variant_id?: string | null
        }
        Update: {
          id?: string
          legacy_id?: string | null
          moved_at?: string
          note?: string | null
          product_name?: string | null
          qty_in?: number
          qty_out?: number
          type?: string
          user_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          bill_footer: string | null
          business_address: string | null
          business_name: string
          business_phone: string | null
          daily_target: number | null
          gstin: string | null
          id: number
          updated_at: string
        }
        Insert: {
          bill_footer?: string | null
          business_address?: string | null
          business_name?: string
          business_phone?: string | null
          daily_target?: number | null
          gstin?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          bill_footer?: string | null
          business_address?: string | null
          business_name?: string
          business_phone?: string | null
          daily_target?: number | null
          gstin?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          gstin: string | null
          id: string
          legacy_id: string | null
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          legacy_id?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      collect_credit_payment: {
        Args: {
          _amount: number
          _mode?: string
          _note?: string
          _sale_id: string
        }
        Returns: Json
      }
      create_sale: { Args: { _items: Json; _sale: Json }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member: { Args: { _user_id: string }; Returns: boolean }
      process_return: {
        Args: {
          _damaged: boolean
          _kind: string
          _note: string
          _qty: number
          _sale_item_id: string
        }
        Returns: number
      }
      receive_stock: {
        Args: {
          _invoice: string
          _items: Json
          _supplier_id: string
          _supplier_name: string
        }
        Returns: number
      }
      reset_store_data: { Args: { _confirmation: string }; Returns: undefined }
      reward_amount: { Args: { _card: string; _m: number }; Returns: number }
    }
    Enums: {
      app_role: "owner" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "staff"],
    },
  },
} as const
