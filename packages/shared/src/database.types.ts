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
      billing_accounts: {
        Row: {
          address: string | null
          billing_model: string
          business_registration_no: string | null
          created_at: string
          email: string | null
          id: string
          kind: string
          legal_name: string | null
          location_id: string | null
          name: string
          notes: string | null
          per_driver_cap_sen: number | null
          phone: string | null
          pool_cap_sen: number | null
          provider_customer_id: string | null
          sst_registration_no: string | null
          status: string
          tax_identification_no: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_model?: string
          business_registration_no?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kind?: string
          legal_name?: string | null
          location_id?: string | null
          name: string
          notes?: string | null
          per_driver_cap_sen?: number | null
          phone?: string | null
          pool_cap_sen?: number | null
          provider_customer_id?: string | null
          sst_registration_no?: string | null
          status?: string
          tax_identification_no?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_model?: string
          business_registration_no?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kind?: string
          legal_name?: string | null
          location_id?: string | null
          name?: string
          notes?: string | null
          per_driver_cap_sen?: number | null
          phone?: string | null
          pool_cap_sen?: number | null
          provider_customer_id?: string | null
          sst_registration_no?: string | null
          status?: string
          tax_identification_no?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cdrs: {
        Row: {
          auth_method: string
          billable: boolean
          billing_account_id: string | null
          charge_point_id: string | null
          charging_periods: Json
          charging_session_id: string | null
          created_at: string
          credit: boolean
          credit_reference_id: string | null
          currency: string
          driver_group_id: string | null
          end_at: string
          id: string
          id_tag: string | null
          invoice_document_id: string | null
          lines: Json
          location_id: string | null
          ocpp_connector_id: number | null
          ocpp_identity: string | null
          remark: string | null
          start_at: string
          subtotal_sen: number
          tariff_id: string | null
          tariff_snapshot: Json | null
          tariff_version_id: string | null
          tax_rate_bps: number
          tax_sen: number
          tenant_id: string
          total_energy_cost_sen: number
          total_energy_wh: number
          total_fixed_cost_sen: number
          total_parking_cost_sen: number
          total_parking_time_s: number
          total_sen: number
          total_time_cost_sen: number
          total_time_s: number
          unbillable_reason: string | null
        }
        Insert: {
          auth_method?: string
          billable?: boolean
          billing_account_id?: string | null
          charge_point_id?: string | null
          charging_periods?: Json
          charging_session_id?: string | null
          created_at?: string
          credit?: boolean
          credit_reference_id?: string | null
          currency?: string
          driver_group_id?: string | null
          end_at: string
          id?: string
          id_tag?: string | null
          invoice_document_id?: string | null
          lines?: Json
          location_id?: string | null
          ocpp_connector_id?: number | null
          ocpp_identity?: string | null
          remark?: string | null
          start_at: string
          subtotal_sen?: number
          tariff_id?: string | null
          tariff_snapshot?: Json | null
          tariff_version_id?: string | null
          tax_rate_bps?: number
          tax_sen?: number
          tenant_id: string
          total_energy_cost_sen?: number
          total_energy_wh?: number
          total_fixed_cost_sen?: number
          total_parking_cost_sen?: number
          total_parking_time_s?: number
          total_sen?: number
          total_time_cost_sen?: number
          total_time_s?: number
          unbillable_reason?: string | null
        }
        Update: {
          auth_method?: string
          billable?: boolean
          billing_account_id?: string | null
          charge_point_id?: string | null
          charging_periods?: Json
          charging_session_id?: string | null
          created_at?: string
          credit?: boolean
          credit_reference_id?: string | null
          currency?: string
          driver_group_id?: string | null
          end_at?: string
          id?: string
          id_tag?: string | null
          invoice_document_id?: string | null
          lines?: Json
          location_id?: string | null
          ocpp_connector_id?: number | null
          ocpp_identity?: string | null
          remark?: string | null
          start_at?: string
          subtotal_sen?: number
          tariff_id?: string | null
          tariff_snapshot?: Json | null
          tariff_version_id?: string | null
          tax_rate_bps?: number
          tax_sen?: number
          tenant_id?: string
          total_energy_cost_sen?: number
          total_energy_wh?: number
          total_fixed_cost_sen?: number
          total_parking_cost_sen?: number
          total_parking_time_s?: number
          total_sen?: number
          total_time_cost_sen?: number
          total_time_s?: number
          unbillable_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cdrs_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_charging_session_id_fkey"
            columns: ["charging_session_id"]
            isOneToOne: false
            referencedRelation: "charging_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_credit_reference_id_fkey"
            columns: ["credit_reference_id"]
            isOneToOne: false
            referencedRelation: "cdrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_driver_group_id_fkey"
            columns: ["driver_group_id"]
            isOneToOne: false
            referencedRelation: "driver_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_invoice_document_fk"
            columns: ["invoice_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_tariff_version_id_fkey"
            columns: ["tariff_version_id"]
            isOneToOne: false
            referencedRelation: "tariff_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdrs_tenant_id_fkey"
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
          billing_account_id: string | null
          charge_point_id: string
          charging_ended_at: string | null
          connector_id: string | null
          created_at: string
          currency: string | null
          driver_group_id: string | null
          ended_at: string | null
          energy_wh: number | null
          evse_id: string | null
          id: string
          id_tag: string | null
          id_tag_id: string | null
          idle_seconds: number | null
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
          tariff_version_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_gross?: number | null
          amount_tax?: number | null
          billing_account_id?: string | null
          charge_point_id: string
          charging_ended_at?: string | null
          connector_id?: string | null
          created_at?: string
          currency?: string | null
          driver_group_id?: string | null
          ended_at?: string | null
          energy_wh?: number | null
          evse_id?: string | null
          id?: string
          id_tag?: string | null
          id_tag_id?: string | null
          idle_seconds?: number | null
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
          tariff_version_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_gross?: number | null
          amount_tax?: number | null
          billing_account_id?: string | null
          charge_point_id?: string
          charging_ended_at?: string | null
          connector_id?: string | null
          created_at?: string
          currency?: string | null
          driver_group_id?: string | null
          ended_at?: string | null
          energy_wh?: number | null
          evse_id?: string | null
          id?: string
          id_tag?: string | null
          id_tag_id?: string | null
          idle_seconds?: number | null
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
          tariff_version_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "charging_sessions_driver_group_id_fkey"
            columns: ["driver_group_id"]
            isOneToOne: false
            referencedRelation: "driver_groups"
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
            foreignKeyName: "charging_sessions_tariff_version_id_fkey"
            columns: ["tariff_version_id"]
            isOneToOne: false
            referencedRelation: "tariff_versions"
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
      document_sequences: {
        Row: {
          kind: string
          next: number
          period: string
          tenant_id: string
        }
        Insert: {
          kind: string
          next?: number
          period: string
          tenant_id: string
        }
        Update: {
          kind?: string
          next?: number
          period?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          billing_account_id: string | null
          buyer: Json
          cdr_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_at: string | null
          einvoice_status: string
          einvoice_uuid: string | null
          id: string
          issued_at: string | null
          kind: string
          lines: Json
          location_id: string | null
          number: string
          pdf_path: string | null
          period_end: string | null
          period_start: string | null
          references_document_id: string | null
          seller: Json
          status: string
          subtotal_sen: number
          tax_sen: number
          tax_summary: Json
          tenant_id: string
          total_sen: number
          updated_at: string
        }
        Insert: {
          billing_account_id?: string | null
          buyer?: Json
          cdr_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          einvoice_status?: string
          einvoice_uuid?: string | null
          id?: string
          issued_at?: string | null
          kind: string
          lines?: Json
          location_id?: string | null
          number: string
          pdf_path?: string | null
          period_end?: string | null
          period_start?: string | null
          references_document_id?: string | null
          seller?: Json
          status?: string
          subtotal_sen?: number
          tax_sen?: number
          tax_summary?: Json
          tenant_id: string
          total_sen?: number
          updated_at?: string
        }
        Update: {
          billing_account_id?: string | null
          buyer?: Json
          cdr_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          einvoice_status?: string
          einvoice_uuid?: string | null
          id?: string
          issued_at?: string | null
          kind?: string
          lines?: Json
          location_id?: string | null
          number?: string
          pdf_path?: string | null
          period_end?: string | null
          period_start?: string | null
          references_document_id?: string | null
          seller?: Json
          status?: string
          subtotal_sen?: number
          tax_sen?: number
          tax_summary?: Json
          tenant_id?: string
          total_sen?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_cdr_id_fkey"
            columns: ["cdr_id"]
            isOneToOne: false
            referencedRelation: "cdrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_references_document_id_fkey"
            columns: ["references_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_group_members: {
        Row: {
          billing_account_id: string | null
          created_at: string
          driver_group_id: string
          driver_user_id: string | null
          id: string
          id_tag_id: string | null
          tenant_id: string
        }
        Insert: {
          billing_account_id?: string | null
          created_at?: string
          driver_group_id: string
          driver_user_id?: string | null
          id?: string
          id_tag_id?: string | null
          tenant_id: string
        }
        Update: {
          billing_account_id?: string | null
          created_at?: string
          driver_group_id?: string
          driver_user_id?: string | null
          id?: string
          id_tag_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_group_members_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_group_members_driver_group_id_fkey"
            columns: ["driver_group_id"]
            isOneToOne: false
            referencedRelation: "driver_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_group_members_id_tag_id_fkey"
            columns: ["id_tag_id"]
            isOneToOne: false
            referencedRelation: "id_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_group_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_groups_tenant_id_fkey"
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
          billing_account_id: string | null
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
          billing_account_id?: string | null
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
          billing_account_id?: string | null
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
            foreignKeyName: "id_tags_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "id_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          assigned_to: string | null
          charge_point_id: string | null
          created_at: string
          description: string | null
          id: string
          ocpp_connector_id: number | null
          opened_by: string | null
          resolved_at: string | null
          severity: string
          source: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          charge_point_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ocpp_connector_id?: number | null
          opened_by?: string | null
          resolved_at?: string | null
          severity?: string
          source?: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          charge_point_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ocpp_connector_id?: number | null
          opened_by?: string | null
          resolved_at?: string | null
          severity?: string
          source?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_tenant_id_fkey"
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
      site_host_agreements: {
        Row: {
          created_at: string
          electricity_basis: string
          electricity_sen_per_kwh: number
          fixed_monthly_fee_sen: number
          host_account_id: string
          id: string
          location_id: string
          notes: string | null
          revenue_share_bps_ac: number
          revenue_share_bps_dc: number
          tenant_id: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          electricity_basis?: string
          electricity_sen_per_kwh?: number
          fixed_monthly_fee_sen?: number
          host_account_id: string
          id?: string
          location_id: string
          notes?: string | null
          revenue_share_bps_ac?: number
          revenue_share_bps_dc?: number
          tenant_id: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          electricity_basis?: string
          electricity_sen_per_kwh?: number
          fixed_monthly_fee_sen?: number
          host_account_id?: string
          id?: string
          location_id?: string
          notes?: string | null
          revenue_share_bps_ac?: number
          revenue_share_bps_dc?: number
          tenant_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_host_agreements_host_account_id_fkey"
            columns: ["host_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_host_agreements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_host_agreements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tariff_assignments: {
        Row: {
          audience: string
          charge_point_id: string | null
          connector_id: string | null
          created_at: string
          driver_group_id: string | null
          id: string
          location_id: string | null
          priority: number
          scope_type: string
          tariff_id: string
          tenant_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          audience?: string
          charge_point_id?: string | null
          connector_id?: string | null
          created_at?: string
          driver_group_id?: string | null
          id?: string
          location_id?: string | null
          priority?: number
          scope_type: string
          tariff_id: string
          tenant_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          audience?: string
          charge_point_id?: string | null
          connector_id?: string | null
          created_at?: string
          driver_group_id?: string | null
          id?: string
          location_id?: string | null
          priority?: number
          scope_type?: string
          tariff_id?: string
          tenant_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tariff_assignments_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_assignments_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_assignments_driver_group_id_fkey"
            columns: ["driver_group_id"]
            isOneToOne: false
            referencedRelation: "driver_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_assignments_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tariff_versions: {
        Row: {
          created_at: string
          created_by: string | null
          display_text: string | null
          elements: Json
          id: string
          max_price_sen: number | null
          min_price_sen: number | null
          tariff_id: string
          tax_included: boolean
          tax_profile_id: string | null
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_text?: string | null
          elements: Json
          id?: string
          max_price_sen?: number | null
          min_price_sen?: number | null
          tariff_id: string
          tax_included?: boolean
          tax_profile_id?: string | null
          tenant_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_text?: string | null
          elements?: Json
          id?: string
          max_price_sen?: number | null
          min_price_sen?: number | null
          tariff_id?: string
          tax_included?: boolean
          tax_profile_id?: string | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tariff_versions_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_versions_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "tax_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tariffs: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tariffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_profiles: {
        Row: {
          code: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          rate_bps: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          rate_bps?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          rate_bps?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          address: string | null
          app_name: string | null
          business_registration_no: string | null
          default_currency: string
          legal_name: string | null
          logo_path: string | null
          payment_provider: string | null
          sst_registration_no: string | null
          support_email: string | null
          support_phone: string | null
          tax_identification_no: string | null
          tenant_id: string
          theme: Json
          updated_at: string
        }
        Insert: {
          address?: string | null
          app_name?: string | null
          business_registration_no?: string | null
          default_currency?: string
          legal_name?: string | null
          logo_path?: string | null
          payment_provider?: string | null
          sst_registration_no?: string | null
          support_email?: string | null
          support_phone?: string | null
          tax_identification_no?: string | null
          tenant_id: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          address?: string | null
          app_name?: string | null
          business_registration_no?: string | null
          default_currency?: string
          legal_name?: string | null
          logo_path?: string | null
          payment_provider?: string | null
          sst_registration_no?: string | null
          support_email?: string | null
          support_phone?: string | null
          tax_identification_no?: string | null
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
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          event: string
          id: string
          last_error: string | null
          last_status_code: number | null
          next_attempt_at: string
          payload: Json
          status: string
          tenant_id: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event: string
          id?: string
          last_error?: string | null
          last_status_code?: number | null
          next_attempt_at?: string
          payload: Json
          status?: string
          tenant_id: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event?: string
          id?: string
          last_error?: string | null
          last_status_code?: number | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          tenant_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          events: string[]
          id: string
          secret: string
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          secret: string
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          secret?: string
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buyer_snapshot: { Args: { p_account: string }; Returns: Json }
      charge_point_uptime: {
        Args: { p_window?: string }
        Returns: {
          charge_point_id: string
          online_seconds: number
          uptime_pct: number
          window_seconds: number
        }[]
      }
      create_monthly_partition: {
        Args: { p_month: string; p_table: string }
        Returns: undefined
      }
      create_receipt: { Args: { p_cdr_id: string }; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
      is_tenant_operator: { Args: never; Returns: boolean }
      issue_document: { Args: { p_document_id: string }; Returns: undefined }
      jwt_tenant_id: { Args: never; Returns: string }
      jwt_tenant_role: { Args: never; Returns: string }
      list_team_members: {
        Args: never
        Returns: {
          email: string
          joined_at: string
          last_sign_in_at: string
          role: string
          user_id: string
        }[]
      }
      maintain_partitions: {
        Args: {
          p_message_retention_days?: number
          p_meter_retention_days?: number
          p_months_ahead?: number
        }
        Returns: undefined
      }
      next_document_number: {
        Args: { p_at?: string; p_kind: string }
        Returns: string
      }
      next_tariff_version: { Args: { p_tariff_id: string }; Returns: number }
      register_charge_point: {
        Args: {
          p_connector_count?: number
          p_connector_type?: string
          p_location_id?: string
          p_max_kw?: number
          p_name: string
          p_ocpp_identity?: string
        }
        Returns: {
          auth_key: string
          charge_point_id: string
          ocpp_identity: string
        }[]
      }
      remove_team_member: { Args: { p_user_id: string }; Returns: undefined }
      revenue_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          charge_point_id: string
          charge_point_name: string
          driver_group_id: string
          driver_group_name: string
          energy_wh: number
          idle_s: number
          location_id: string
          location_name: string
          sessions: number
          subtotal_sen: number
          tax_sen: number
          total_sen: number
          unbillable_sessions: number
        }[]
      }
      rollup_meter_values: { Args: { p_since?: string }; Returns: undefined }
      run_invoice: {
        Args: {
          p_billing_account_id: string
          p_due_days?: number
          p_period_end: string
          p_period_start: string
        }
        Returns: string
      }
      run_settlement: {
        Args: {
          p_location_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: string
      }
      seller_snapshot: { Args: { p_tenant: string }; Returns: Json }
      set_team_member_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      sweep_orphaned_sessions: {
        Args: { p_stale_after?: string }
        Returns: number
      }
      void_document: { Args: { p_document_id: string }; Returns: undefined }
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

