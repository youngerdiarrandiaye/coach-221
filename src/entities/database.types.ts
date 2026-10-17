export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: {
          id: string
          email: string
          nom?: string
          prenom?: string
          telephone?: string | null
          specialite?: string | null
          zone?: string | null
          description?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          nom?: string
          prenom?: string
          telephone?: string | null
          specialite?: string | null
          zone?: string | null
          description?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: ClientRow
        Insert: {
          id?: string
          coach_id: string
          nom: string
          prenom: string
          telephone: string
          email?: string | null
          date_naissance?: string | null
          sexe?: ClientSexe | null
          taille_cm?: number | null
          poids_initial_kg?: number | null
          objectif?: ClientObjectif | null
          avatar_url?: string | null
          actif?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          nom?: string
          prenom?: string
          telephone?: string
          email?: string | null
          date_naissance?: string | null
          sexe?: ClientSexe | null
          taille_cm?: number | null
          poids_initial_kg?: number | null
          objectif?: ClientObjectif | null
          avatar_url?: string | null
          actif?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      sessions: {
        Row: SessionRow
        Insert: {
          id?: string
          coach_id: string
          client_id: string
          titre: string
          description?: string | null
          date_heure: string
          duree_minutes?: number
          statut?: SessionStatus
          notes?: string | null
          recurrence_id?: string | null
          occurrence_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          titre?: string
          description?: string | null
          date_heure?: string
          duree_minutes?: number
          statut?: SessionStatus
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      progress_entries: {
        Row: ProgressEntryRow
        Insert: {
          id?: string
          client_id: string
          coach_id: string
          poids_kg?: number | null
          notes?: string | null
          mesure_date?: string
          created_at?: string
        }
        Update: {
          poids_kg?: number | null
          notes?: string | null
          mesure_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      payments: {
        Row: PaymentRow
        Insert: {
          id?: string
          coach_id: string
          client_id: string
          montant: number
          methode: PaymentMethod
          statut?: PaymentStatus
          description?: string | null
          date_paiement?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          montant?: number
          methode?: PaymentMethod
          statut?: PaymentStatus
          description?: string | null
          date_paiement?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      coach_notes: {
        Row: CoachNoteRow
        Insert: {
          id?: string
          coach_id: string
          client_id: string
          contenu: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          contenu?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      exercises: {
        Row: ExerciseRow
        Insert: {
          id?: string
          coach_id: string
          nom: string
          groupe_musculaire?: string | null
          created_at?: string
        }
        Update: {
          nom?: string
          groupe_musculaire?: string | null
        }
        Relationships: []
      }
      workout_logs: {
        Row: WorkoutLogRow
        Insert: {
          id?: string
          coach_id: string
          client_id: string
          session_id?: string | null
          exercice_id: string
          log_date: string
          serie_numero: number
          reps: number
          charge_kg: number
          rpe?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          reps?: number
          charge_kg?: number
          rpe?: number | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          }
        ]
      }
      rum_events: {
        Row: RumEventRow
        Insert: {
          id?: string
          coach_id: string
          name: string
          task?: string | null
          path?: string | null
          clicks?: number | null
          duration_ms?: number | null
          value?: number | null
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      reminder_prefs: {
        Row: ReminderPrefsRow
        Insert: { coach_id: string; enabled?: boolean; offsets?: number[]; system?: boolean; updated_at?: string }
        Update: { enabled?: boolean; offsets?: number[]; system?: boolean; updated_at?: string }
        Relationships: []
      }
      push_subscriptions: {
        Row: PushSubscriptionRow
        Insert: {
          id?: string
          coach_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
          last_success_at?: string | null
          failures?: number
        }
        Update: { last_success_at?: string | null; failures?: number }
        Relationships: []
      }
      push_sent: {
        Row: PushSentRow
        Insert: { session_id: string; offset_min: number; coach_id: string; sent_at?: string }
        Update: Record<string, never>
        Relationships: []
      }
      rate_limits: {
        Row: RateLimitRow
        Insert: { key: string; window_start: string; count?: number }
        Update: Record<string, never>
        Relationships: []
      }
      cron_runs: {
        Row: CronRunRow
        Insert: { id?: string; job: string; started_at?: string; finished_at?: string | null; ok?: boolean; checked?: number; sent?: number; failed?: number; error?: string | null }
        Update: Record<string, never>
        Relationships: []
      }
      idempotency_keys: {
        Row: IdempotencyKeyRow
        Insert: { coach_id: string; key: string; route: string; request_hash: string; response?: Json | null; status?: number | null; created_at?: string }
        Update: Record<string, never>
        Relationships: []
      }
      audit_log: {
        Row: AuditLogRow
        Insert: { id?: string; coach_id: string; action: string; entity: string; entity_id?: string | null; created_at?: string; counts?: Json | null }
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views:          { [_ in never]: never }
    Functions:      { [_ in never]: never }
    Enums: {
      session_status:  SessionStatus
      payment_status:  PaymentStatus
      payment_method:  PaymentMethod
      client_objectif: ClientObjectif
      client_sexe:     ClientSexe
    }
    CompositeTypes: { [_ in never]: never }
  }
}

// ── Enums ────────────────────────────────────────
export type SessionStatus  = 'PLANIFIEE' | 'EFFECTUEE' | 'ANNULEE'
export type PaymentStatus  = 'PAYE' | 'EN_ATTENTE' | 'ANNULE'
export type PaymentMethod  = 'ESPECES' | 'WAVE' | 'ORANGE_MONEY'
export type ClientObjectif = 'PERTE_DE_POIDS' | 'PRISE_DE_MASSE' | 'CARDIO' | 'TONIFICATION' | 'REMISE_EN_FORME' | 'REEDUCATION' | 'AUTRE'
export type ClientSexe     = 'HOMME' | 'FEMME'

// ── Row types ────────────────────────────────────
export interface ProfileRow {
  id:           string
  email:        string
  nom:          string
  prenom:       string
  telephone:    string | null
  specialite:   string | null
  zone:         string | null
  description:  string | null
  avatar_url:   string | null
  created_at:   string
  updated_at:   string
}

export interface ClientRow {
  id:               string
  coach_id:         string
  nom:              string
  prenom:           string
  telephone:        string
  email:            string | null
  date_naissance:   string | null
  sexe:             ClientSexe | null
  taille_cm:        number | null
  poids_initial_kg: number | null
  objectif:         ClientObjectif | null
  avatar_url:       string | null
  actif:            boolean
  created_at:       string
  updated_at:       string
}

export interface SessionRow {
  id:             string
  coach_id:       string
  client_id:      string
  titre:          string
  description:    string | null
  date_heure:     string
  duree_minutes:  number
  statut:         SessionStatus
  notes:          string | null
  recurrence_id:  string | null
  /** Jour Dakar (AAAA-MM-JJ) de l'occurrence d'origine dans la série ; null hors série. */
  occurrence_date: string | null
  created_at:     string
  updated_at:     string
}

export type RecurrenceFrequency = 'QUOTIDIENNE' | 'HEBDOMADAIRE' | 'MENSUELLE'
export type RecurrenceExceptionKind = 'MODIFIEE' | 'ANNULEE' | 'SUPPRIMEE' | 'IGNOREE'

export interface RecurrenceExceptionRow {
  id:              string
  recurrence_id:   string
  coach_id:        string
  occurrence_date: string
  kind:            RecurrenceExceptionKind
  created_at:      string
}

export interface RecurrenceRow {
  id:            string
  coach_id:      string
  client_id:     string
  titre:         string
  description:   string | null
  duree_minutes: number
  heure:         string
  jours:         number[]
  date_debut:    string
  date_fin:      string | null
  actif:         boolean
  frequence:     RecurrenceFrequency
  intervalle:    number
  nb_occurrences: number | null
  created_at:    string
  updated_at:    string
}

export interface ProgressEntryRow {
  id:          string
  client_id:   string
  coach_id:    string
  poids_kg:    number | null
  imc:         number | null
  notes:       string | null
  mesure_date: string
  created_at:  string
  frequence_cardiaque_repos_bpm?:  number | null
  frequence_cardiaque_effort_bpm?: number | null
  tour_taille_cm?:                 number | null
  hanches_cm?:                     number | null
  bras_cm?:                        number | null
  cuisse_cm?:                      number | null
  masse_grasse_pct?:               number | null
}

export interface PaymentRow {
  id:            string
  coach_id:      string
  client_id:     string
  montant:       number
  methode:       PaymentMethod
  statut:        PaymentStatus
  description:   string | null
  date_paiement: string
  created_at:    string
  updated_at:    string
}

export interface CoachNoteRow {
  id:         string
  coach_id:   string
  client_id:  string
  contenu:    string
  created_at: string
  updated_at: string
}

export interface ExerciseRow {
  id:                string
  coach_id:          string
  nom:               string
  groupe_musculaire: string | null
  created_at:        string
}

export interface WorkoutLogRow {
  id:           string
  coach_id:     string
  client_id:    string
  session_id:   string | null
  exercice_id:  string
  log_date:     string
  serie_numero: number
  reps:         number
  charge_kg:    number
  rpe:          number | null
  notes:        string | null
  created_at:   string
}

export interface RumEventRow {
  id:          string
  coach_id:    string
  name:        string
  task:        string | null
  path:         string | null
  clicks:      number | null
  duration_ms: number | null
  value:       number | null
  created_at:  string
}

export interface ReminderPrefsRow {
  coach_id:   string
  enabled:    boolean
  offsets:    number[]
  system:     boolean
  updated_at: string
}

export interface PushSubscriptionRow {
  id:              string
  coach_id:        string
  endpoint:        string
  p256dh:          string
  auth:            string
  user_agent:      string | null
  created_at:      string
  last_success_at: string | null
  failures:        number
}

export interface PushSentRow {
  session_id: string
  offset_min: number
  coach_id:   string
  sent_at:    string
}

/** Tables de service : réservées au serveur (clé de service), jamais lisibles par un navigateur. */
export interface RateLimitRow {
  key:          string
  window_start: string
  count:        number
}

export interface CronRunRow {
  id:          string
  job:         string
  started_at:  string
  finished_at: string | null
  ok:          boolean
  checked:     number
  sent:        number
  failed:      number
  error:       string | null
}

export interface IdempotencyKeyRow {
  coach_id:     string
  key:          string
  route:        string
  request_hash: string
  response:     Json | null
  /** Code HTTP de la réponse mémorisée ; null tant que le traitement est en cours. */
  status:       number | null
  created_at:   string
}

export interface AuditLogRow {
  id:         string
  coach_id:   string
  action:     string
  entity:     string
  entity_id:  string | null
  created_at: string
  counts:     Json | null
}
