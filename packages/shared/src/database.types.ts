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
      charge_point_connection_log: {
        Row: {
          charge_point_id: string
          close_code: number | null
          close_reason: string | null
          event: string
          gateway_instance: string | null
          id: number
          recorded_at: string
          remote_address: string | null
          tenant_id: string
        }
        Insert: {
          charge_point_id: string
          close_code?: number | null
          close_reason?: string | null
          event: string
          gateway_instance?: string | null
          id?: never
          recorded_at?: string
          remote_address?: string | null
          tenant_id: string
        }
        Update: {
          charge_point_id?: string
          close_code?: number | null
          close_reason?: string | null
          event?: string
          gateway_instance?: string | null
          id?: never
          recorded_at?: string
          remote_address?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_connection_log_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_point_connection_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_connections: {
        Row: {
          charge_point_id: string
          connected_at: string
          gateway_instance: string
          last_message_at: string | null
          ocpp_identity: string
          tenant_id: string
        }
        Insert: {
          charge_point_id: string
          connected_at?: string
          gateway_instance: string
          last_message_at?: string | null
          ocpp_identity: string
          tenant_id: string
        }
        Update: {
          charge_point_id?: string
          connected_at?: string
          gateway_instance?: string
          last_message_at?: string | null
          ocpp_identity?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_connections_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_point_connections_tenant_id_fkey"
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
      charge_point_status_log: {
        Row: {
          charge_point_id: string
          error_code: string | null
          id: number
          info: string | null
          ocpp_connector_id: number
          recorded_at: string
          status: string
          tenant_id: string
          vendor_error_code: string | null
          vendor_id: string | null
        }
        Insert: {
          charge_point_id: string
          error_code?: string | null
          id?: never
          info?: string | null
          ocpp_connector_id: number
          recorded_at?: string
          status: string
          tenant_id: string
          vendor_error_code?: string | null
          vendor_id?: string | null
        }
        Update: {
          charge_point_id?: string
          error_code?: string | null
          id?: never
          info?: string | null
          ocpp_connector_id?: number
          recorded_at?: string
          status?: string
          tenant_id?: string
          vendor_error_code?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_status_log_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_point_status_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      charging_sessions: {
        Row: {
          amount_gross: number | null
          amount_tax: number | null
          charge_point_id: string
          connector_id: string | null
          created_at: string
          currency: string | null
          ended_at: string | null
          energy_wh: number | null
          evse_id: string | null
          id: string
          id_tag: string | null
          id_tag_id: string | null
          meter_start_wh: number | null
          meter_stop_wh: number | null
          ocpp_connector_id: number
          ocpp_transaction_id: number
          offline: boolean
          reservation_id: number | null
          start_source: string
          started_at: string
          status: string
          stop_id_tag: string | null
          stop_reason: string | null
          tariff_snapshot: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_gross?: number | null
          amount_tax?: number | null
          charge_point_id: string
          connector_id?: string | null
          created_at?: string
          currency?: string | null
          ended_at?: string | null
          energy_wh?: number | null
          evse_id?: string | null
          id?: string
          id_tag?: string | null
          id_tag_id?: string | null
          meter_start_wh?: number | null
          meter_stop_wh?: number | null
          ocpp_connector_id: number
          ocpp_transaction_id: number
          offline?: boolean
          reservation_id?: number | null
          start_source?: string
          started_at: string
          status?: string
          stop_id_tag?: string | null
          stop_reason?: string | null
          tariff_snapshot?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_gross?: number | null
          amount_tax?: number | null
          charge_point_id?: string
          connector_id?: string | null
          created_at?: string
          currency?: string | null
          ended_at?: string | null
          energy_wh?: number | null
          evse_id?: string | null
          id?: string
          id_tag?: string | null
          id_tag_id?: string | null
          meter_start_wh?: number | null
          meter_stop_wh?: number | null
          ocpp_connector_id?: number
          ocpp_transaction_id?: number
          offline?: boolean
          reservation_id?: number | null
          start_source?: string
          started_at?: string
          status?: string
          stop_id_tag?: string | null
          stop_reason?: string | null
          tariff_snapshot?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_evse_id_fkey"
            columns: ["evse_id"]
            isOneToOne: false
            referencedRelation: "evses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_id_tag_id_fkey"
            columns: ["id_tag_id"]
            isOneToOne: false
            referencedRelation: "id_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_tenant_id_fkey"
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
      meter_values: {
        Row: {
          charge_point_id: string
          charging_session_id: string | null
          context: string | null
          format: string | null
          id: number
          location: string | null
          measurand: string
          ocpp_connector_id: number
          phase: string | null
          sampled_at: string
          tenant_id: string
          unit: string | null
          value: number
        }
        Insert: {
          charge_point_id: string
          charging_session_id?: string | null
          context?: string | null
          format?: string | null
          id?: never
          location?: string | null
          measurand?: string
          ocpp_connector_id: number
          phase?: string | null
          sampled_at: string
          tenant_id: string
          unit?: string | null
          value: number
        }
        Update: {
          charge_point_id?: string
          charging_session_id?: string | null
          context?: string | null
          format?: string | null
          id?: never
          location?: string | null
          measurand?: string
          ocpp_connector_id?: number
          phase?: string | null
          sampled_at?: string
          tenant_id?: string
          unit?: string | null
          value?: number
        }
        Relationships: []
      }
      meter_values_agg_1m: {
        Row: {
          avg_power_w: number | null
          charge_point_id: string
          charging_session_id: string
          energy_wh: number | null
          max_power_w: number | null
          minute: string
          ocpp_connector_id: number
          soc_percent: number | null
          tenant_id: string
        }
        Insert: {
          avg_power_w?: number | null
          charge_point_id: string
          charging_session_id: string
          energy_wh?: number | null
          max_power_w?: number | null
          minute: string
          ocpp_connector_id: number
          soc_percent?: number | null
          tenant_id: string
        }
        Update: {
          avg_power_w?: number | null
          charge_point_id?: string
          charging_session_id?: string
          energy_wh?: number | null
          max_power_w?: number | null
          minute?: string
          ocpp_connector_id?: number
          soc_percent?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_values_agg_1m_charging_session_id_fkey"
            columns: ["charging_session_id"]
            isOneToOne: false
            referencedRelation: "charging_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_values_agg_1m_tenant_id_fkey"
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
      ocpp_messages: {
        Row: {
          action: string | null
          charge_point_id: string
          direction: string
          error_code: string | null
          error_description: string | null
          id: number
          message_type: number
          ocpp_message_id: string | null
          payload: Json | null
          recorded_at: string
          tenant_id: string
        }
        Insert: {
          action?: string | null
          charge_point_id: string
          direction: string
          error_code?: string | null
          error_description?: string | null
          id?: never
          message_type: number
          ocpp_message_id?: string | null
          payload?: Json | null
          recorded_at?: string
          tenant_id: string
        }
        Update: {
          action?: string | null
          charge_point_id?: string
          direction?: string
          error_code?: string | null
          error_description?: string | null
          id?: never
          message_type?: number
          ocpp_message_id?: string | null
          payload?: Json | null
          recorded_at?: string
          tenant_id?: string
        }
        Relationships: []
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
      remote_commands: {
        Row: {
          action: string
          charge_point_id: string
          created_at: string
          error: string | null
          id: string
          payload: Json
          requested_by: string | null
          responded_at: string | null
          response: Json | null
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          action: string
          charge_point_id: string
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          requested_by?: string | null
          responded_at?: string | null
          response?: Json | null
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          action?: string
          charge_point_id?: string
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          requested_by?: string | null
          responded_at?: string | null
          response?: Json | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remote_commands_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remote_commands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      create_monthly_partition: {
        Args: { p_month: string; p_table: string }
        Returns: undefined
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
      is_tenant_operator: { Args: never; Returns: boolean }
      jwt_tenant_id: { Args: never; Returns: string }
      jwt_tenant_role: { Args: never; Returns: string }
      maintain_partitions: {
        Args: {
          p_message_retention_days?: number
          p_meter_retention_days?: number
          p_months_ahead?: number
        }
        Returns: undefined
      }
      rollup_meter_values: { Args: { p_since?: string }; Returns: undefined }
      sweep_orphaned_sessions: {
        Args: { p_stale_after?: string }
        Returns: number
      }
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

