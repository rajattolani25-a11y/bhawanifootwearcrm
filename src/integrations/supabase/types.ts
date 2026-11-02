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
          opening_balance: number
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
          opening_balance?: number
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
      create_catalog_order:
        | {
            Args: {
              _address: string
              _area: string
              _fulfillment: string
              _mobile: string
              _name: string
              _variant_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              _address: string
              _area: string
              _coupon: string
              _fulfillment: string
              _mobile: string
              _name: string
              _variant_id: string
            }
            Returns: Json
          }
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
      reward_amount: { Args: { _card: string; _m: number }; Returns: number }
      set_team_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      store_usage: { Args: never; Returns: Json }
      track_catalog_order: {
        Args: { _booking_no: string; _mobile: string }
        Returns: Json
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
