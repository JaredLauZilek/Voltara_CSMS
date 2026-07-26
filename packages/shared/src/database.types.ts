export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          after: Json | null
          at: string
          before: Json | null
          id: number
          resource_id: string | null
          resource_type: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_type?: string
          actor_user_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_models: {
        Row: {
          connector_count: number
          connector_types: string[]
          created_at: string
          id: string
          name: string
          ocpp_versions: string[]
          power_kw: number | null
          vendor_id: string
        }
        Insert: {
          connector_count?: number
          connector_types?: string[]
          created_at?: string
          id?: string
          name: string
          ocpp_versions?: string[]
          power_kw?: number | null
          vendor_id: string
        }
        Update: {
          connector_count?: number
          connector_types?: string[]
          created_at?: string
          id?: string
          name?: string
          ocpp_versions?: string[]
          power_kw?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_models_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "charge_point_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_vendors: {
        Row: {
          created_at: string
          id: string
          name: string
          quirks: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          quirks?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          quirks?: Json
        }
        Relationships: []
      }
      charge_points: {
        Row: {
          auth_key_hash: string | null
          config: Json
          connection_state: string
          created_at: string
          firmware_version: string | null
          heartbeat_interval_s: number
          id: string
          last_boot_at: string | null
          last_seen_at: string | null
          lifecycle: string
          location_id: string | null
          model_id: string | null
          model_reported: string | null
          name: string
          ocpp_identity: string
          ocpp_version: string
          quirks_override: Json
          security_profile: number
          serial_number: string | null
          tenant_id: string
          updated_at: string
          vendor_reported: string | null
        }
        Insert: {
          auth_key_hash?: string | null
          config?: Json
          connection_state?: string
          created_at?: string
          firmware_version?: string | null
          heartbeat_interval_s?: number
          id?: string
          last_boot_at?: string | null
          last_seen_at?: string | null
          lifecycle?: string
          location_id?: string | null
          model_id?: string | null
          model_reported?: string | null
          name: string
          ocpp_identity: string
          ocpp_version?: string
          quirks_override?: Json
          security_profile?: number
          serial_number?: string | null
          tenant_id: string
          updated_at?: string
          vendor_reported?: string | null
        }
        Update: {
          auth_key_hash?: string | null
          config?: Json
          connection_state?: string
          created_at?: string
          firmware_version?: string | null
          heartbeat_interval_s?: number
          id?: string
          last_boot_at?: string | null
          last_seen_at?: string | null
          lifecycle?: string
          location_id?: string | null
          model_id?: string | null
          model_reported?: string | null
          name?: string
          ocpp_identity?: string
          ocpp_version?: string
          quirks_override?: Json
          security_profile?: number
          serial_number?: string | null
          tenant_id?: string
          updated_at?: string
          vendor_reported?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_points_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_points_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "charge_point_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_points_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      connectors: {
        Row: {
          charge_point_id: string
          connector_type: string
          created_at: string
          evse_id: string
          id: string
          last_error_code: string | null
          max_kw: number | null
          ocpp_connector_id: number
          status: string
          status_updated_at: string | null
          tenant_id: string
        }
        Insert: {
          charge_point_id: string
          connector_type?: string
          created_at?: string
          evse_id: string
          id?: string
          last_error_code?: string | null
          max_kw?: number | null
          ocpp_connector_id: number
          status?: string
          status_updated_at?: string | null
          tenant_id: string
        }
        Update: {
          charge_point_id?: string
          connector_type?: string
          created_at?: string
          evse_id?: string
          id?: string
          last_error_code?: string | null
          max_kw?: number | null
          ocpp_connector_id?: number
          status?: string
          status_updated_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectors_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connectors_evse_id_fkey"
            columns: ["evse_id"]
            isOneToOne: false
            referencedRelation: "evses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connectors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      evses: {
        Row: {
          charge_point_id: string
          created_at: string
          evse_number: number
          id: string
          tenant_id: string
        }
        Insert: {
          charge_point_id: string
          created_at?: string
          evse_number?: number
          id?: string
          tenant_id: string
        }
        Update: {
          charge_point_id?: string
          created_at?: string
          evse_number?: number
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evses_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      id_tags: {
        Row: {
          created_at: string
          driver_user_id: string | null
          expires_at: string | null
          id: string
          kind: string
          label: string | null
          parent_tag: string | null
          status: string
          tag: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          driver_user_id?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          label?: string | null
          parent_tag?: string | null
          status?: string
          tag: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          driver_user_id?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          label?: string | null
          parent_tag?: string | null
          status?: string
          tag?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "id_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          country: string
          created_at: string
          id: string
          jmb_name: string | null
          lat: number | null
          lng: number | null
          name: string
          postcode: string | null
          site_type: string
          state: string | null
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          id?: string
          jmb_name?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          postcode?: string | null
          site_type?: string
          state?: string | null
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          id?: string
          jmb_name?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          postcode?: string | null
          site_type?: string
          state?: string | null
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          resource_id: string
          resource_type: string
          tenant_id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          resource_id: string
          resource_type: string
          tenant_id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          resource_id?: string
          resource_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tenant_settings: {
        Row: {
          app_name: string | null
          default_currency: string
          logo_path: string | null
          sst_registration_no: string | null
          support_email: string | null
          support_phone: string | null
          tenant_id: string
          theme: Json
          updated_at: string
        }
        Insert: {
          app_name?: string | null
          default_currency?: string
          logo_path?: string | null
          sst_registration_no?: string | null
          support_email?: string | null
          support_phone?: string | null
          tenant_id: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          app_name?: string | null
          default_currency?: string
          logo_path?: string | null
          sst_registration_no?: string | null
          support_email?: string | null
          support_phone?: string | null
          tenant_id?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          is_first_party: boolean
          name: string
          plan: string
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_first_party?: boolean
          name: string
          plan?: string
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_first_party?: boolean
          name?: string
          plan?: string
          slug?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
      is_tenant_operator: { Args: never; Returns: boolean }
      jwt_tenant_id: { Args: never; Returns: string }
      jwt_tenant_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

