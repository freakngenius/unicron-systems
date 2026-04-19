export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      candidates: {
        Row: {
          alive: boolean
          context: Json
          created_at: string
          current_score: number | null
          eliminated_at_cycle: number | null
          hypothesis: string
          id: string
          resource_share: number
          run_id: string
        }
        Insert: {
          alive?: boolean
          context: Json
          created_at?: string
          current_score?: number | null
          eliminated_at_cycle?: number | null
          hypothesis: string
          id?: string
          resource_share?: number
          run_id: string
        }
        Update: {
          alive?: boolean
          context?: Json
          created_at?: string
          current_score?: number | null
          eliminated_at_cycle?: number | null
          hypothesis?: string
          id?: string
          resource_share?: number
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "selection_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_signups: {
        Row: { created_at: string; email: string; id: string; name: string }
        Insert: { created_at?: string; email: string; id?: string; name: string }
        Update: { created_at?: string; email?: string; id?: string; name?: string }
        Relationships: []
      }
      flock_outputs: {
        Row: {
          agent_idx: number
          content: string
          created_at: string
          cycle: number
          id: string
          peer_refs: Json
          run_id: string
        }
        Insert: {
          agent_idx: number
          content: string
          created_at?: string
          cycle: number
          id?: string
          peer_refs: Json
          run_id: string
        }
        Update: {
          agent_idx?: number
          content?: string
          created_at?: string
          cycle?: number
          id?: string
          peer_refs?: Json
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flock_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "flock_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      flock_runs: {
        Row: {
          agent_count: number
          completed_at: string | null
          created_at: string
          cycles: number
          id: string
          peer_n: number
          prompt: string
          status: string
        }
        Insert: {
          agent_count?: number
          completed_at?: string | null
          created_at?: string
          cycles?: number
          id?: string
          peer_n?: number
          prompt: string
          status: string
        }
        Update: {
          agent_count?: number
          completed_at?: string | null
          created_at?: string
          cycles?: number
          id?: string
          peer_n?: number
          prompt?: string
          status?: string
        }
        Relationships: []
      }
      notion_meta: {
        Row: { created_at: string; database_id: string; key: string }
        Insert: { created_at?: string; database_id: string; key: string }
        Update: { created_at?: string; database_id?: string; key?: string }
        Relationships: []
      }
      pipeline_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          final_output: Json | null
          id: string
          input_url: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          final_output?: Json | null
          id?: string
          input_url: string
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          final_output?: Json | null
          id?: string
          input_url?: string
          status?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          completed_at: string | null
          id: string
          input_json: Json | null
          output_json: Json | null
          retry_count: number
          run_id: string
          stage_name: string
          started_at: string
          validation_status: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          input_json?: Json | null
          output_json?: Json | null
          retry_count?: number
          run_id: string
          stage_name: string
          started_at?: string
          validation_status?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          input_json?: Json | null
          output_json?: Json | null
          retry_count?: number
          run_id?: string
          stage_name?: string
          started_at?: string
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      score_events: {
        Row: {
          candidate_id: string
          created_at: string
          criteria_breakdown: Json
          cycle: number
          id: string
          reasoning: string
          score: number
        }
        Insert: {
          candidate_id: string
          created_at?: string
          criteria_breakdown: Json
          cycle: number
          id?: string
          reasoning: string
          score: number
        }
        Update: {
          candidate_id?: string
          created_at?: string
          criteria_breakdown?: Json
          cycle?: number
          id?: string
          reasoning?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          criteria: Json
          current_cycle: number
          cycles_planned: number
          id: string
          notion_page_id: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          criteria: Json
          current_cycle?: number
          cycles_planned?: number
          id?: string
          notion_page_id?: string | null
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          criteria?: Json
          current_cycle?: number
          cycles_planned?: number
          id?: string
          notion_page_id?: string | null
          status?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          archived: boolean
          body: string
          created_at: string
          id: string
          last_touched: string
          promoted_at: string | null
          source_agent: string
          strength: number
          topic: string
          ttl_days: number
          type: string
        }
        Insert: {
          archived?: boolean
          body: string
          created_at?: string
          id?: string
          last_touched?: string
          promoted_at?: string | null
          source_agent: string
          strength?: number
          topic: string
          ttl_days?: number
          type: string
        }
        Update: {
          archived?: boolean
          body?: string
          created_at?: string
          id?: string
          last_touched?: string
          promoted_at?: string | null
          source_agent?: string
          strength?: number
          topic?: string
          ttl_days?: number
          type?: string
        }
        Relationships: []
      }
      swarm_clusters: {
        Row: { examples: Json; id: string; job_id: string; size: number; theme: string }
        Insert: { examples: Json; id?: string; job_id: string; size: number; theme: string }
        Update: { examples?: Json; id?: string; job_id?: string; size?: number; theme?: string }
        Relationships: [
          {
            foreignKeyName: "swarm_clusters_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "swarm_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_jobs: {
        Row: {
          completed_at: string | null
          completed_count: number
          created_at: string
          id: string
          market_query: string
          status: string
          target_count: number
        }
        Insert: {
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          id?: string
          market_query: string
          status: string
          target_count: number
        }
        Update: {
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          id?: string
          market_query?: string
          status?: string
          target_count?: number
        }
        Relationships: []
      }
      swarm_workers: {
        Row: {
          created_at: string
          id: string
          job_id: string
          output_json: Json | null
          runtime_ms: number | null
          status: string
          target_ref: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          output_json?: Json | null
          runtime_ms?: number | null
          status: string
          target_ref: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          output_json?: Json | null
          runtime_ms?: number | null
          status?: string
          target_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_workers_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "swarm_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
