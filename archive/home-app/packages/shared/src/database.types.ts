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
    PostgrestVersion: "14.18"
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
        }
        Relationships: []
      }
      charger_events: {
        Row: {
          actor_user_id: string | null
          charger_id: string
          created_at: string
          data: Json | null
          id: number
          message: string | null
          severity: string
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          charger_id: string
          created_at?: string
          data?: Json | null
          id?: never
          message?: string | null
          severity?: string
          type: string
        }
        Update: {
          actor_user_id?: string | null
          charger_id?: string
          created_at?: string
          data?: Json | null
          id?: never
          message?: string | null
          severity?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "charger_events_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charger_events_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "vw_chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      charger_members: {
        Row: {
          charger_id: string
          created_at: string
          invited_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          charger_id: string
          created_at?: string
          invited_by?: string | null
          role?: string
          user_id: string
        }
        Update: {
          charger_id?: string
          created_at?: string
          invited_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charger_members_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charger_members_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "vw_chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      charger_models: {
        Row: {
          ble_name_prefix: string | null
          brand: string
          connector_type: string
          created_at: string
          id: string
          is_active: boolean
          model: string
          name: string
          phases: number
          protocol: string
          rated_amps: number
          rated_kw: number
        }
        Insert: {
          ble_name_prefix?: string | null
          brand: string
          connector_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model: string
          name: string
          phases: number
          protocol?: string
          rated_amps: number
          rated_kw: number
        }
        Update: {
          ble_name_prefix?: string | null
          brand?: string
          connector_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model?: string
          name?: string
          phases?: number
          protocol?: string
          rated_amps?: number
          rated_kw?: number
        }
        Relationships: []
      }
      charger_readings: {
        Row: {
          charger_id: string
          current_l1_a: number | null
          current_l2_a: number | null
          current_l3_a: number | null
          energy_total_kwh: number | null
          power_kw: number | null
          recorded_at: string
          reported_by: string | null
          session_kwh: number | null
          source: string
          state: string
          temperature_c: number | null
          voltage_l1_v: number | null
          voltage_l2_v: number | null
          voltage_l3_v: number | null
        }
        Insert: {
          charger_id: string
          current_l1_a?: number | null
          current_l2_a?: number | null
          current_l3_a?: number | null
          energy_total_kwh?: number | null
          power_kw?: number | null
          recorded_at: string
          reported_by?: string | null
          session_kwh?: number | null
          source?: string
          state: string
          temperature_c?: number | null
          voltage_l1_v?: number | null
          voltage_l2_v?: number | null
          voltage_l3_v?: number | null
        }
        Update: {
          charger_id?: string
          current_l1_a?: number | null
          current_l2_a?: number | null
          current_l3_a?: number | null
          energy_total_kwh?: number | null
          power_kw?: number | null
          recorded_at?: string
          reported_by?: string | null
          session_kwh?: number | null
          source?: string
          state?: string
          temperature_c?: number | null
          voltage_l1_v?: number | null
          voltage_l2_v?: number | null
          voltage_l3_v?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "charger_readings_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charger_readings_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "vw_chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      charger_settings: {
        Row: {
          applied_at: string | null
          applied_version: number | null
          cable_locked: boolean
          charger_id: string
          led_brightness: number
          max_current_a: number
          schedule: Json | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          applied_at?: string | null
          applied_version?: number | null
          cable_locked?: boolean
          charger_id: string
          led_brightness?: number
          max_current_a?: number
          schedule?: Json | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          applied_at?: string | null
          applied_version?: number | null
          cable_locked?: boolean
          charger_id?: string
          led_brightness?: number
          max_current_a?: number
          schedule?: Json | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "charger_settings_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: true
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charger_settings_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: true
            referencedRelation: "vw_chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      chargers: {
        Row: {
          ble_name: string | null
          city: string | null
          claim_code_hash: string | null
          claimed_at: string | null
          commissioned_at: string | null
          created_at: string
          dealer_id: string | null
          firmware_version: string | null
          id: string
          installed_by: string | null
          last_seen_at: string | null
          last_status: Json | null
          lifecycle: string
          model_id: string
          name: string
          notes: string | null
          owner_user_id: string | null
          phase_mode: string
          postcode: string | null
          rated_current_a: number
          serial: string
          site_label: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          ble_name?: string | null
          city?: string | null
          claim_code_hash?: string | null
          claimed_at?: string | null
          commissioned_at?: string | null
          created_at?: string
          dealer_id?: string | null
          firmware_version?: string | null
          id?: string
          installed_by?: string | null
          last_seen_at?: string | null
          last_status?: Json | null
          lifecycle?: string
          model_id: string
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          phase_mode?: string
          postcode?: string | null
          rated_current_a?: number
          serial: string
          site_label?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          ble_name?: string | null
          city?: string | null
          claim_code_hash?: string | null
          claimed_at?: string | null
          commissioned_at?: string | null
          created_at?: string
          dealer_id?: string | null
          firmware_version?: string | null
          id?: string
          installed_by?: string | null
          last_seen_at?: string | null
          last_status?: Json | null
          lifecycle?: string
          model_id?: string
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          phase_mode?: string
          postcode?: string | null
          rated_current_a?: number
          serial?: string
          site_label?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chargers_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargers_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "charger_models"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_sessions: {
        Row: {
          charger_id: string
          cost_sen: number | null
          created_at: string
          end_energy_kwh: number | null
          ended_at: string | null
          id: string
          kwh: number | null
          max_power_kw: number | null
          source: string
          start_energy_kwh: number | null
          started_at: string
          started_by: string | null
          stop_reason: string | null
          tariff_snapshot: Json | null
        }
        Insert: {
          charger_id: string
          cost_sen?: number | null
          created_at?: string
          end_energy_kwh?: number | null
          ended_at?: string | null
          id?: string
          kwh?: number | null
          max_power_kw?: number | null
          source?: string
          start_energy_kwh?: number | null
          started_at: string
          started_by?: string | null
          stop_reason?: string | null
          tariff_snapshot?: Json | null
        }
        Update: {
          charger_id?: string
          cost_sen?: number | null
          created_at?: string
          end_energy_kwh?: number | null
          ended_at?: string | null
          id?: string
          kwh?: number | null
          max_power_kw?: number | null
          source?: string
          start_energy_kwh?: number | null
          started_at?: string
          started_by?: string | null
          stop_reason?: string | null
          tariff_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "vw_chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_members: {
        Row: {
          created_at: string
          dealer_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_members_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealers: {
        Row: {
          code: string
          created_at: string
          email: string | null
          id: string
          is_first_party: boolean
          name: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          email?: string | null
          id?: string
          is_first_party?: boolean
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_first_party?: boolean
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      firmware_releases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_rollout: boolean
          model_id: string
          notes: string | null
          storage_path: string | null
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_rollout?: boolean
          model_id: string
          notes?: string | null
          storage_path?: string | null
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_rollout?: boolean
          model_id?: string
          notes?: string | null
          storage_path?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "firmware_releases_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "charger_models"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          body: string | null
          charger_id: string | null
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          body?: string | null
          charger_id?: string | null
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          body?: string | null
          charger_id?: string | null
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "vw_chargers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_chargers: {
        Row: {
          cable_locked: boolean | null
          city: string | null
          claimed_at: string | null
          commissioned_at: string | null
          created_at: string | null
          dealer_id: string | null
          dealer_name: string | null
          firmware_version: string | null
          id: string | null
          installed_by: string | null
          installer_name: string | null
          last_power_kw: number | null
          last_seen_at: string | null
          last_state: string | null
          last_status: Json | null
          lifecycle: string | null
          max_current_a: number | null
          model_brand: string | null
          model_code: string | null
          model_id: string | null
          model_name: string | null
          model_rated_amps: number | null
          name: string | null
          notes: string | null
          owner_email: string | null
          owner_name: string | null
          owner_user_id: string | null
          phase_mode: string | null
          phases: number | null
          postcode: string | null
          protocol: string | null
          rated_current_a: number | null
          rated_kw: number | null
          seen_recently: boolean | null
          serial: string | null
          settings_applied_version: number | null
          settings_version: number | null
          site_label: string | null
          state: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargers_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargers_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "charger_models"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_daily_energy: {
        Row: {
          charger_id: string | null
          day: string | null
          kwh: number | null
          minutes: number | null
          sessions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "vw_chargers"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_people: {
        Row: {
          created_at: string | null
          dealer_id: string | null
          dealer_name: string | null
          dealer_role: string | null
          email: string | null
          full_name: string | null
          phone: string | null
          staff_role: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealer_members_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      charger_role: { Args: { p_charger_id: string }; Returns: string }
      claim_charger: {
        Args: { p_claim_code: string; p_name?: string; p_serial: string }
        Returns: string
      }
      close_session: {
        Args: {
          p_end_energy_kwh: number
          p_ended_at: string
          p_max_power_kw?: number
          p_session_id: string
          p_stop_reason?: string
        }
        Returns: undefined
      }
      commission_charger: {
        Args: {
          p_charger_id: string
          p_firmware_version?: string
          p_notes?: string
          p_phase_mode?: string
          p_rated_current_a: number
          p_site?: Json
        }
        Returns: undefined
      }
      create_monthly_partition: {
        Args: { p_month: string; p_table: string }
        Returns: undefined
      }
      dealer_role: { Args: never; Returns: string }
      decommission_charger: {
        Args: { p_charger_id: string; p_reason?: string }
        Returns: undefined
      }
      fleet_overview: { Args: never; Returns: Json }
      generate_claim_code: { Args: never; Returns: string }
      in_rpc: { Args: never; Returns: boolean }
      ingest_readings: {
        Args: { p_charger_id: string; p_readings: Json }
        Returns: number
      }
      invite_charger_member: {
        Args: { p_charger_id: string; p_email: string; p_role?: string }
        Returns: undefined
      }
      is_dealer_admin: { Args: never; Returns: boolean }
      is_dealer_member: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_staff_admin: { Args: never; Returns: boolean }
      is_staff_support: { Args: never; Returns: boolean }
      maintain_partitions: {
        Args: { p_months_ahead?: number; p_readings_retention_days?: number }
        Returns: undefined
      }
      my_actor: { Args: never; Returns: Json }
      my_dealer_id: { Args: never; Returns: string }
      open_session: {
        Args: {
          p_charger_id: string
          p_source?: string
          p_start_energy_kwh: number
          p_started_at: string
        }
        Returns: string
      }
      register_charger: {
        Args: {
          p_claim_code?: string
          p_dealer_id?: string
          p_model_id: string
          p_name?: string
          p_serial: string
        }
        Returns: Json
      }
      release_charger: { Args: { p_charger_id: string }; Returns: undefined }
      report_settings_applied: {
        Args: { p_charger_id: string; p_version: number }
        Returns: undefined
      }
      staff_role: { Args: never; Returns: string }
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
    Enums: {},
  },
} as const
