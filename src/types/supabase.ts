export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      urls: {
        Row: {
          id: string
          url: string
          title: string
          body: string
          preprocessed_data: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          url: string
          title: string
          body: string
          preprocessed_data?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          url?: string
          title?: string
          body?: string
          preprocessed_data?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      similarity_results: {
        Row: {
          id: string
          source_url_id: string
          target_url_id: string
          similarity_score: number
          suggested_anchor: string | null
          created_at: string
        }
        Insert: {
          id?: string
          source_url_id: string
          target_url_id: string
          similarity_score: number
          suggested_anchor?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          source_url_id?: string
          target_url_id?: string
          similarity_score?: number
          suggested_anchor?: string | null
          created_at?: string
        }
      }
      target_url_lists: {
        Row: {
          id: string
          urls: string[]
          hash: string
          created_at: string
        }
        Insert: {
          id?: string
          urls: string[]
          hash: string
          created_at?: string
        }
        Update: {
          id?: string
          urls?: string[]
          hash?: string
          created_at?: string
        }
      }
      source_url_processing_status: {
        Row: {
          id: string
          source_url: string
          target_list_id: string
          processed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          source_url: string
          target_list_id: string
          processed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          source_url?: string
          target_list_id?: string
          processed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}