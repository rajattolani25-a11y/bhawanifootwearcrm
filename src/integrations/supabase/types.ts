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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      catalog_bookings: {
        Row: {
          receipt_recorded: boolean | null
          client_request_id: string | null
          request_hash: string | null
          refund_paid_at: string | null
          refund_reference: string | null
          refund_mode: string | null
          address: string | null
          advance: number
          area: string | null
          booking_no: string
          confirmed_at: string | null
          coupon_code: string | null
          coupon_discount: number
          created_at: string
          customer_name: string
          delivery_charge: number
          expires_at: string
          fulfillment: string
          id: string
          mobile: string
          note: string | null
          price: number
          product_name: string
          sale_id: string | null
          size: string
          status: string
          status_history: Json
          variant_id: string
        }
        Insert: {
          receipt_recorded?: boolean | null
          client_request_id?: string | null
          request_hash?: string | null
          refund_paid_at?: string | null
          refund_reference?: string | null
          refund_mode?: string | null
          address?: string | null
          advance: number
          area?: string | null
          booking_no: string
          confirmed_at?: string | null
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          customer_name: string
          delivery_charge?: number
          expires_at: string
          fulfillment?: string
          id?: string
          mobile: string
          note?: string | null
          price: number
          product_name: string
          sale_id?: string | null
          size: string
          status?: string
          status_history?: Json
          variant_id: string
        }
        Update: {
          receipt_recorded?: boolean | null
          client_request_id?: string | null
          request_hash?: string | null
          refund_paid_at?: string | null
          refund_reference?: string | null
          refund_mode?: string | null
          address?: string | null
          advance?: number
          area?: string | null
          booking_no?: string
          confirmed_at?: string | null
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          customer_name?: string
          delivery_charge?: number
          expires_at?: string
          fulfillment?: string
          id?: string
          mobile?: string
          note?: string | null
          price?: number
          product_name?: string
          sale_id?: string | null
          size?: string
          status?: string
          status_history?: Json
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_bookings_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_bookings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_hero_settings: {
        Row: {
          action: string
          button_label: string
          category: string
          custom_text: string
          enabled: boolean
          heading: string
          id: number
          image_path: string | null
          image_scale: number
          motion: boolean
          offer_kind: string
          offer_value: number
          product_id: string | null
          subtitle: string
          updated_at: string
        }
        Insert: {
          action?: string
          button_label?: string
          category?: string
          custom_text?: string
          enabled?: boolean
          heading?: string
          id?: number
          image_path?: string | null
          image_scale?: number
          motion?: boolean
          offer_kind?: string
          offer_value?: number
          product_id?: string | null
          subtitle?: string
          updated_at?: string
        }
        Update: {
          action?: string
          button_label?: string
          category?: string
          custom_text?: string
          enabled?: boolean
          heading?: string
          id?: number
          image_path?: string | null
          image_scale?: number
          motion?: boolean
          offer_kind?: string
          offer_value?: number
          product_id?: string | null
          subtitle?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_hero_settings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_presentation_settings: {
        Row: {
          category_accents: boolean
          gallery_enabled: boolean
          id: number
          motion_enabled: boolean
          theme: string
        }
        Insert: {
          category_accents?: boolean
          gallery_enabled?: boolean
          id?: number
          motion_enabled?: boolean
          theme?: string
        }
        Update: {
          category_accents?: boolean
          gallery_enabled?: boolean
          id?: number
          motion_enabled?: boolean
          theme?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          amount: number
          coupon_id: string
          created_at: string
          customer_id: string | null
          id: string
          sale_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number
          coupon_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          sale_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          coupon_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          sale_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          expires_at: string | null
          id: string
          kind: string
          max_discount: number | null
          min_bill: number
          starts_at: string | null
          title: string
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          max_discount?: number | null
          min_bill?: number
          starts_at?: string | null
          title?: string
          usage_limit?: number | null
          used_count?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          max_discount?: number | null
          min_bill?: number
          starts_at?: string | null
          title?: string
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_payments: {
        Row: {
          entry_kind: string | null
          booking_id: string | null
          operation_id: string | null
          request_hash: string | null

          amount: number
          collected_by: string | null
          customer_id: string | null
          id: string
          note: string | null
          paid_at: string
          payment_mode: string
          sale_id: string | null
        }
        Insert: {
          entry_kind?: string | null
          booking_id?: string | null
          operation_id?: string | null
          request_hash?: string | null

          amount: number
          collected_by?: string | null
          customer_id?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          payment_mode?: string
          sale_id: string | null
        }
        Update: {
          entry_kind?: string | null
          booking_id?: string | null
          operation_id?: string | null
          request_hash?: string | null

          amount?: number
          collected_by?: string | null
          customer_id?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          payment_mode?: string
          sale_id?: string | null
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
          opening_initial: number | null

          brand_preference: string | null
          created_at: string
          id: string
          is_premium: boolean
          last_stamp_date: string | null
          legacy_id: string | null
          mobile: string
          name: string
          opening_balance: number
          premium_stamps: number
          premium_visits: number
          regular_stamps: number
          regular_visits: number
          shoe_size: string | null
        }
        Insert: {
          opening_initial?: number | null

          brand_preference?: string | null
          created_at?: string
          id?: string
          is_premium?: boolean
          last_stamp_date?: string | null
          legacy_id?: string | null
          mobile: string
          name?: string
          opening_balance?: number
          premium_stamps?: number
          premium_visits?: number
          regular_stamps?: number
          regular_visits?: number
          shoe_size?: string | null
        }
        Update: {
          opening_initial?: number | null

          brand_preference?: string | null
          created_at?: string
          id?: string
          is_premium?: boolean
          last_stamp_date?: string | null
          legacy_id?: string | null
          mobile?: string
          name?: string
          opening_balance?: number
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
          earned_sale_id: string | null
          earned_visit_number: number | null
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
          earned_sale_id?: string | null
          earned_visit_number?: number | null
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
          earned_sale_id?: string | null
          earned_visit_number?: number | null
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
          label_code: string | null

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
          label_code?: string | null

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
          label_code?: string | null

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
          catalog_description: string | null
          catalog_visible: boolean
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
          catalog_description?: string | null
          catalog_visible?: boolean
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
          catalog_description?: string | null
          catalog_visible?: boolean
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
          operation_id: string | null
          request_hash: string | null

          free_sample: boolean
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
          operation_id?: string | null
          request_hash?: string | null

          free_sample?: boolean
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
          operation_id?: string | null
          request_hash?: string | null

          free_sample?: boolean
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
      sale_item_costs: {
        Row: {
          sale_item_id: string
          unit_cost: number
        }
        Insert: {
          sale_item_id: string
          unit_cost: number
        }
        Update: {
          sale_item_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_item_costs_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: true
            referencedRelation: "sale_items"
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
          unit_cost: number | null
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
          unit_cost?: number | null
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
          unit_cost?: number | null
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
          replacement_variant_id: string | null
          replacement_size: string | null
          refund_mode: string | null
          operation_id: string | null
          cash_refund: number
          cost_reversal: number
          created_at: string
          damaged: boolean
          gst_reversal: number
          id: string
          kind: string
          note: string | null
          product_name: string
          qty: number
          refund: number
          sale_id: string | null
          sale_item_id: string | null
          size: string
          taxable_reversal: number
          user_id: string | null
          variant_id: string | null
        }
        Insert: {
          replacement_variant_id?: string | null
          replacement_size?: string | null
          refund_mode?: string | null
          operation_id?: string | null
          cash_refund?: number
          cost_reversal?: number
          created_at?: string
          damaged?: boolean
          gst_reversal?: number
          id?: string
          kind?: string
          note?: string | null
          product_name?: string
          qty: number
          refund?: number
          sale_id?: string | null
          sale_item_id?: string | null
          size?: string
          taxable_reversal?: number
          user_id?: string | null
          variant_id?: string | null
        }
        Update: {
          replacement_variant_id?: string | null
          replacement_size?: string | null
          refund_mode?: string | null
          operation_id?: string | null
          cash_refund?: number
          cost_reversal?: number
          created_at?: string
          damaged?: boolean
          gst_reversal?: number
          id?: string
          kind?: string
          note?: string | null
          product_name?: string
          qty?: number
          refund?: number
          sale_id?: string | null
          sale_item_id?: string | null
          size?: string
          taxable_reversal?: number
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
          delivery_charge: number | null
          voided_at: string | null
          voided_by: string | null
          void_reason: string | null
          void_refund_mode: string | null
          void_metadata: Json | null
          client_request_id: string | null
          request_hash: string | null
          request_result: Json | null
          stamp_regular_reversed: boolean | null
          stamp_premium_reversed: boolean | null
          bill_no: string
          bill_type: string
          coupon_amount: number
          coupon_code: string | null
          coupon_id: string | null
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
          delivery_charge?: number | null
          voided_at?: string | null
          voided_by?: string | null
          void_reason?: string | null
          void_refund_mode?: string | null
          void_metadata?: Json | null
          client_request_id?: string | null
          request_hash?: string | null
          request_result?: Json | null
          stamp_regular_reversed?: boolean | null
          stamp_premium_reversed?: boolean | null
          bill_no: string
          bill_type?: string
          coupon_amount?: number
          coupon_code?: string | null
          coupon_id?: string | null
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
          delivery_charge?: number | null
          voided_at?: string | null
          voided_by?: string | null
          void_reason?: string | null
          void_refund_mode?: string | null
          void_metadata?: Json | null
          client_request_id?: string | null
          request_hash?: string | null
          request_result?: Json | null
          stamp_regular_reversed?: boolean | null
          stamp_premium_reversed?: boolean | null
          bill_no?: string
          bill_type?: string
          coupon_amount?: number
          coupon_code?: string | null
          coupon_id?: string | null
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
            foreignKeyName: "sales_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
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
          operation_id: string | null
          operation_hash: string | null
          operation_result: Json | null
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
          operation_id?: string | null
          operation_hash?: string | null
          operation_result?: Json | null
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
          operation_id?: string | null
          operation_hash?: string | null
          operation_result?: Json | null
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
      store_file_cleanup: {
        Row: {
          bucket: string
          created_at: string
          path: string
          reason: string
        }
        Insert: {
          bucket: string
          created_at?: string
          path: string
          reason: string
        }
        Update: {
          bucket?: string
          created_at?: string
          path?: string
          reason?: string
        }
        Relationships: []
      }
      store_reset_state: {
        Row: {
          generation: string
          id: number
          installation_id: string
          reset_at: string | null
        }
        Insert: {
          generation?: string
          id?: number
          installation_id?: string
          reset_at?: string | null
        }
        Update: {
          generation?: string
          id?: number
          installation_id?: string
          reset_at?: string | null
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          default_bill_type: string | null
          default_tax_mode: string | null
          default_gst_rate: number | null
          advance_percent: number
          bill_design: string
          bill_footer: string | null
          booking_enabled: boolean
          business_address: string | null
          business_name: string
          business_phone: string | null
          catalog_enabled: boolean
          daily_target: number | null
          delivery_enabled: boolean
          delivery_note: string | null
          free_delivery_above: number | null
          gstin: string | null
          hold_hours: number
          id: number
          local_charge: number
          offer_card: boolean
          offer_coupon: string | null
          offer_enabled: boolean
          offer_subtitle: string | null
          offer_title: string | null
          outside_charge: number
          outside_enabled: boolean
          pickup_enabled: boolean
          show_few_left: boolean
          thermal_width: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          default_bill_type?: string | null
          default_tax_mode?: string | null
          default_gst_rate?: number | null
          advance_percent?: number
          bill_design?: string
          bill_footer?: string | null
          booking_enabled?: boolean
          business_address?: string | null
          business_name?: string
          business_phone?: string | null
          catalog_enabled?: boolean
          daily_target?: number | null
          delivery_enabled?: boolean
          delivery_note?: string | null
          free_delivery_above?: number | null
          gstin?: string | null
          hold_hours?: number
          id?: number
          local_charge?: number
          offer_card?: boolean
          offer_coupon?: string | null
          offer_enabled?: boolean
          offer_subtitle?: string | null
          offer_title?: string | null
          outside_charge?: number
          outside_enabled?: boolean
          pickup_enabled?: boolean
          show_few_left?: boolean
          thermal_width?: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          default_bill_type?: string | null
          default_tax_mode?: string | null
          default_gst_rate?: number | null
          advance_percent?: number
          bill_design?: string
          bill_footer?: string | null
          booking_enabled?: boolean
          business_address?: string | null
          business_name?: string
          business_phone?: string | null
          catalog_enabled?: boolean
          daily_target?: number | null
          delivery_enabled?: boolean
          delivery_note?: string | null
          free_delivery_above?: number | null
          gstin?: string | null
          hold_hours?: number
          id?: number
          local_charge?: number
          offer_card?: boolean
          offer_coupon?: string | null
          offer_enabled?: boolean
          offer_subtitle?: string | null
          offer_title?: string | null
          outside_charge?: number
          outside_enabled?: boolean
          pickup_enabled?: boolean
          show_few_left?: boolean
          thermal_width?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          operation_id: string | null
          request_hash: string | null
          opening_amount: number | null

          amount: number
          id: string
          note: string
          paid_at: string
          payment_mode: string
          purchase_id: string | null
          recorded_by: string | null
          supplier_id: string
        }
        Insert: {
          operation_id?: string | null
          request_hash?: string | null
          opening_amount?: number | null

          amount: number
          id?: string
          note?: string
          paid_at?: string
          payment_mode: string
          purchase_id?: string | null
          recorded_by?: string | null
          supplier_id: string
        }
        Update: {
          operation_id?: string | null
          request_hash?: string | null
          opening_amount?: number | null

          amount?: number
          id?: string
          note?: string
          paid_at?: string
          payment_mode?: string
          purchase_id?: string | null
          recorded_by?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          opening_initial: number | null

          address: string | null
          created_at: string
          gstin: string | null
          id: string
          legacy_id: string | null
          name: string
          opening_balance: number
          phone: string | null
        }
        Insert: {
          opening_initial?: number | null

          address?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          legacy_id?: string | null
          name: string
          opening_balance?: number
          phone?: string | null
        }
        Update: {
          opening_initial?: number | null

          address?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          opening_balance?: number
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
      ensure_variant_label_code: { Args: { _variant_id: string }; Returns: string }
      adjust_inventory: { Args: { _variant_id: string; _expected_stock: number; _expected_damaged: number; _stock?: number | null; _min?: number | null; _rack?: string | null; _disposition?: string | null; _reason?: string }; Returns: Json }
      set_party_opening: { Args: { _kind: string; _id: string; _amount: number }; Returns: undefined }
      receive_customer_payment: { Args: { _customer_id: string; _amount: number; _mode: string; _note: string; _request_id: string }; Returns: Json }
      collect_credit_payment_v2: { Args: { _sale_id: string; _amount: number; _mode: string; _note: string; _request_id: string }; Returns: Json }
      record_supplier_payment_v2: { Args: { _supplier_id: string; _amount: number; _mode: string; _note: string; _request_id: string; _purchase_id?: string | null }; Returns: number }
      receive_stock_v2: { Args: { _supplier_id: string | null; _supplier_name: string; _invoice: string; _items: Json; _request_id: string }; Returns: number }
      record_catalog_refund: { Args: { _id: string; _mode: string; _reference: string; _request_id: string }; Returns: Json }

      stored_bill_line_count:{Args:never;Returns:number}
      void_sale:{Args:{_sale_id:string;_confirmation:string;_reason:string;_payment_settled:boolean;_refund_mode?:string|null};Returns:Json}
      list_void_sales:{Args:{_offset?:number;_limit?:number};Returns:Json}
      edit_product_variant: {Args:{_product_id:string;_variant_id:string|null;_size:string;_stock:number;_expected_stock?:number|null;_remove?:boolean;_reason?:string};Returns:Json}
      retail_integrity_version: { Args: never; Returns: number }
      return_cost_reversals: { Args: { _ids: string[] }; Returns: { id: string; cost_reversal: number }[] }
      sale_return_positions: { Args: { _item: string }; Returns: { variant_id: string | null; size: string; qty: number }[] }
      process_sale_return: { Args: { _sale_item_id: string; _variant_id: string | null; _qty: number; _damaged: boolean; _kind: string; _note?: string; _refund_mode?: string | null; _replacement_variant_id?: string | null; _operation_id?: string }; Returns: Json }
      import_stock_csv: { Args: { _rows: Json; _mode: string; _preview?: boolean; _operation_id?: string; _expected?: Json }; Returns: Json }
      ack_store_file_cleanup: {
        Args: { _bucket: string; _paths: string[] }
        Returns: undefined
      }
      backup_sale_items: {
        Args: { _limit?: number; _offset?: number }
        Returns: Json[]
      }
      cancel_catalog_booking: {
        Args: { _id: string; _note: string }
        Returns: undefined
      }
      catalog_coupon_amount: {
        Args: {
          _code: string
          _lock?: boolean
          _mobile: string
          _subtotal: number
        }
        Returns: Json
      }
      catalog_hero_storage_usage: { Args: never; Returns: Json }
      check_catalog_coupon: {
        Args: { _code: string; _mobile: string; _variant_id: string }
        Returns: Json
      }
      collect_credit_payment: {
        Args: {
          _amount: number
          _mode?: string
          _note?: string
          _sale_id: string
        }
        Returns: Json
      }
      complete_catalog_booking: {
        Args: { _id: string; _items: Json; _sale: Json }
        Returns: Json
      }
      confirm_catalog_booking: { Args: { _id: string }; Returns: undefined }
      coupon_discount: {
        Args: { _code: string; _customer: string; _subtotal: number }
        Returns: Json
      }
      create_catalog_booking: {
        Args: { _mobile: string; _name: string; _variant_id: string }
        Returns: Json
      }
      create_catalog_order: { Args: { _address: string; _area: string; _coupon: string; _fulfillment: string; _mobile: string; _name: string; _variant_id: string; _request_id: string; _quote: Json }; Returns: Json }
      resolve_pending_operation: { Args: { _request_id: string; _abandon?: boolean; _confirmation?: string }; Returns: Json }
      import_legacy_store: { Args: { _payload: Json; _request_id: string }; Returns: Json }
      owner_cash_today: { Args: never; Returns: Json }
      operational_safety_version: { Args: never; Returns: number }
      create_sale: { Args: { _items: Json; _sale: Json }; Returns: Json }
      ensure_variant_code: { Args: { _variant_id: string }; Returns: string }
      expire_catalog_bookings: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_catalog_hero_image: { Args: { _name: string }; Returns: boolean }
      is_catalog_image: { Args: { _name: string }; Returns: boolean }
      is_member: { Args: { _user_id: string }; Returns: boolean }
      is_saved_hero_image: { Args: { _name: string }; Returns: boolean }
      maintenance_business_tables: { Args: never; Returns: string[] }
      maintenance_file_in_use: {
        Args: { _bucket: string; _path: string }
        Returns: boolean
      }
      maintenance_lock_store: { Args: never; Returns: undefined }
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
      public_catalog: { Args: never; Returns: Json }
      public_catalog_hero: { Args: never; Returns: Json }
      public_catalog_offer: { Args: never; Returns: Json }
      quick_add_product: {
        Args: { _cost?: number; _product: Json; _sizes: Json }
        Returns: Json
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
      record_supplier_payment: {
        Args: {
          _amount: number
          _mode: string
          _note?: string
          _purchase_id?: string
          _supplier_id: string
        }
        Returns: number
      }
      remove_team_access: { Args: { _user_id: string }; Returns: undefined }
      reset_store_data: { Args: { _confirmation: string }; Returns: undefined }
      reset_store_data_v2: {
        Args: {
          _confirmation: string
          _fingerprint: string
          _preserve_design?: boolean
          _preserve_identity?: boolean
          _preserve_operations?: boolean
          _restart_numbers?: boolean
        }
        Returns: Json
      }
      restore_store_backup_v2: {
        Args: { _confirmation: string; _snapshot: Json }
        Returns: undefined
      }
      reward_amount: { Args: { _card: string; _m: number }; Returns: number }
      set_team_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      stage_store_restore_files: { Args: { _assets: Json }; Returns: undefined }
      store_backup_snapshot_v2: { Args: never; Returns: Json }
      store_usage: { Args: never; Returns: Json }
      track_catalog_order: {
        Args: { _booking_no: string; _mobile: string }
        Returns: Json
      }
      transfer_store_ownership: {
        Args: { _confirmation: string; _email: string }
        Returns: undefined
      }
      update_catalog_order_status: {
        Args: { _id: string; _status: string }
        Returns: undefined
      }
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
