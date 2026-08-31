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
      badges: {
        Row: {
          badge_id: string
          eleve_id: string
          obtenu_le: string
        }
        Insert: {
          badge_id: string
          eleve_id: string
          obtenu_le?: string
        }
        Update: {
          badge_id?: string
          eleve_id?: string
          obtenu_le?: string
        }
        Relationships: [
          {
            foreignKeyName: "badges_eleve_id_fkey"
            columns: ["eleve_id"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
        ]
      }
      defis: {
        Row: {
          classe: string | null
          code: string
          cree_le: string
          cree_par_eleve: string | null
          cree_par_prof: string | null
          demarre_le: string | null
          duree_s: number | null
          expire_le: string
          id: string
          questions: Json
          statut: string
          tables: number[]
          type: string
        }
        Insert: {
          classe?: string | null
          code: string
          cree_le?: string
          cree_par_eleve?: string | null
          cree_par_prof?: string | null
          demarre_le?: string | null
          duree_s?: number | null
          expire_le?: string
          id?: string
          questions: Json
          statut?: string
          tables: number[]
          type: string
        }
        Update: {
          classe?: string | null
          code?: string
          cree_le?: string
          cree_par_eleve?: string | null
          cree_par_prof?: string | null
          demarre_le?: string | null
          duree_s?: number | null
          expire_le?: string
          id?: string
          questions?: Json
          statut?: string
          tables?: number[]
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "defis_cree_par_eleve_fkey"
            columns: ["cree_par_eleve"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defis_cree_par_prof_fkey"
            columns: ["cree_par_prof"]
            isOneToOne: false
            referencedRelation: "profs"
            referencedColumns: ["id"]
          },
        ]
      }
      defis_participants: {
        Row: {
          defi_id: string
          detail: Json
          eleve_id: string
          erreurs: number
          score: number
          temps_s: number
          termine_le: string
        }
        Insert: {
          defi_id: string
          detail?: Json
          eleve_id: string
          erreurs?: number
          score: number
          temps_s: number
          termine_le?: string
        }
        Update: {
          defi_id?: string
          detail?: Json
          eleve_id?: string
          erreurs?: number
          score?: number
          temps_s?: number
          termine_le?: string
        }
        Relationships: [
          {
            foreignKeyName: "defis_participants_defi_id_fkey"
            columns: ["defi_id"]
            isOneToOne: false
            referencedRelation: "defis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defis_participants_eleve_id_fkey"
            columns: ["eleve_id"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
        ]
      }
      difficulte_operande: {
        Row: {
          n: number
          poids: number
          raison: string
        }
        Insert: {
          n: number
          poids: number
          raison: string
        }
        Update: {
          n?: number
          poids?: number
          raison?: string
        }
        Relationships: []
      }
      eleves: {
        Row: {
          actif: boolean
          avatar_emoji: string
          classe: string
          cree_le: string
          derniere_connexion: string | null
          email: string
          id: string
          nom: string
          plafond_tables: number
          prenom: string
          tables_autorisees: number[]
          user_id: string | null
        }
        Insert: {
          actif?: boolean
          avatar_emoji?: string
          classe: string
          cree_le?: string
          derniere_connexion?: string | null
          email: string
          id?: string
          nom: string
          plafond_tables?: number
          prenom: string
          tables_autorisees?: number[]
          user_id?: string | null
        }
        Update: {
          actif?: boolean
          avatar_emoji?: string
          classe?: string
          cree_le?: string
          derniere_connexion?: string | null
          email?: string
          id?: string
          nom?: string
          plafond_tables?: number
          prenom?: string
          tables_autorisees?: number[]
          user_id?: string | null
        }
        Relationships: []
      }
      journal_admin: {
        Row: {
          acteur_email: string
          action: string
          cible: string | null
          detail: Json
          fait_le: string
          id: number
        }
        Insert: {
          acteur_email: string
          action: string
          cible?: string | null
          detail?: Json
          fait_le?: string
          id?: number
        }
        Update: {
          acteur_email?: string
          action?: string
          cible?: string | null
          detail?: Json
          fait_le?: string
          id?: number
        }
        Relationships: []
      }
      maitrise: {
        Row: {
          derniere_vue: string
          eleve_id: string
          fait: string
          nb_reussites: number
          nb_vues: number
          niveau: number
        }
        Insert: {
          derniere_vue?: string
          eleve_id: string
          fait: string
          nb_reussites?: number
          nb_vues?: number
          niveau?: number
        }
        Update: {
          derniere_vue?: string
          eleve_id?: string
          fait?: string
          nb_reussites?: number
          nb_vues?: number
          niveau?: number
        }
        Relationships: [
          {
            foreignKeyName: "maitrise_eleve_id_fkey"
            columns: ["eleve_id"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
        ]
      }
      profs: {
        Row: {
          actif: boolean
          classes: string[]
          cree_le: string
          email: string
          id: string
          nom: string
          role: string
          user_id: string | null
        }
        Insert: {
          actif?: boolean
          classes?: string[]
          cree_le?: string
          email: string
          id?: string
          nom: string
          role?: string
          user_id?: string | null
        }
        Update: {
          actif?: boolean
          classes?: string[]
          cree_le?: string
          email?: string
          id?: string
          nom?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sessions_jeu: {
        Row: {
          cree_le: string
          defi_id: string | null
          duree_s: number
          eleve_id: string
          erreurs: Json
          id: string
          mode: string
          nb_questions: number
          palier: string
          plus_haute_table: number | null
          points: number
          sans_faute_max: number
          score: number
          score_premier_essai: number
          serie_max: number
          tables: number[]
        }
        Insert: {
          cree_le?: string
          defi_id?: string | null
          duree_s?: number
          eleve_id: string
          erreurs?: Json
          id?: string
          mode: string
          nb_questions?: number
          palier?: string
          plus_haute_table?: number | null
          points?: number
          sans_faute_max?: number
          score?: number
          score_premier_essai?: number
          serie_max?: number
          tables?: number[]
        }
        Update: {
          cree_le?: string
          defi_id?: string | null
          duree_s?: number
          eleve_id?: string
          erreurs?: Json
          id?: string
          mode?: string
          nb_questions?: number
          palier?: string
          plus_haute_table?: number | null
          points?: number
          sans_faute_max?: number
          score?: number
          score_premier_essai?: number
          serie_max?: number
          tables?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "sessions_jeu_defi_id_fkey"
            columns: ["defi_id"]
            isOneToOne: false
            referencedRelation: "defis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_jeu_eleve_id_fkey"
            columns: ["eleve_id"]
            isOneToOne: false
            referencedRelation: "eleves"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions_profs: {
        Row: {
          cree_le: string
          duree_s: number
          id: string
          mode: string
          nb_questions: number
          plus_haute_table: number | null
          points: number
          prof_id: string
          sans_faute_max: number
          score: number
          score_premier_essai: number
          serie_max: number
          tables: number[]
        }
        Insert: {
          cree_le?: string
          duree_s?: number
          id?: string
          mode: string
          nb_questions?: number
          plus_haute_table?: number | null
          points?: number
          prof_id: string
          sans_faute_max?: number
          score?: number
          score_premier_essai?: number
          serie_max?: number
          tables?: number[]
        }
        Update: {
          cree_le?: string
          duree_s?: number
          id?: string
          mode?: string
          nb_questions?: number
          plus_haute_table?: number | null
          points?: number
          prof_id?: string
          sans_faute_max?: number
          score?: number
          score_premier_essai?: number
          serie_max?: number
          tables?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "sessions_profs_prof_id_fkey"
            columns: ["prof_id"]
            isOneToOne: false
            referencedRelation: "profs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ajouter_eleve: {
        Args: {
          p_classe: string
          p_email: string
          p_nom: string
          p_prenom: string
        }
        Returns: Json
      }
      auteur_defi: {
        Args: { p_defi_id: string }
        Returns: {
          auteur_nom: string
          origine: string
        }[]
      }
      avancement_defi: { Args: { p_defi_id: string }; Returns: Json }
      classement_classes: {
        Args: { p_niveau?: string; p_periode?: string }
        Returns: {
          classe: string
          eleves_actifs: number
          eleves_total: number
          est_ma_classe: boolean
          points_moyens: number
          rang: number
        }[]
      }
      classement_defi: {
        Args: { p_defi_id: string }
        Returns: {
          avatar: string
          classe: string
          est_moi: boolean
          nom_affiche: string
          rang: number
          score: number
          temps_s: number
        }[]
      }
      classement_profs: {
        Args: { p_categorie?: string; p_limite?: number; p_periode?: string }
        Returns: {
          avatar: string
          classe: string
          est_moi: boolean
          nom_affiche: string
          parties: number
          rang: number
          valeur: number
        }[]
      }
      classement_progression: {
        Args: {
          p_limite?: number
          p_palier?: string
          p_periode?: string
          p_portee?: string
        }
        Returns: {
          avatar: string
          classe: string
          est_moi: boolean
          nom_affiche: string
          points: number
          rang: number
        }[]
      }
      classement_records: {
        Args: {
          p_categorie?: string
          p_limite?: number
          p_palier?: string
          p_periode?: string
          p_portee?: string
        }
        Returns: {
          avatar: string
          classe: string
          est_moi: boolean
          nom_affiche: string
          rang: number
          valeur: number
        }[]
      }
      creer_defi: {
        Args: {
          p_classe?: string
          p_duree_s?: number
          p_expire_dans?: string
          p_nb_questions?: number
          p_tables: number[]
          p_type: string
        }
        Returns: Json
      }
      creer_prof: {
        Args: {
          p_classes?: string[]
          p_email: string
          p_nom: string
          p_role?: string
        }
        Returns: Json
      }
      debut_periode: { Args: { p_periode: string }; Returns: string }
      definir_mes_classes: { Args: { p_classes: string[] }; Returns: Json }
      definir_plafond_classe: {
        Args: { p_classe: string; p_plafond: number }
        Returns: Json
      }
      desactiver_eleve: {
        Args: { p_eleve_id: string; p_motif?: string }
        Returns: Json
      }
      desactiver_prof: { Args: { p_prof_id: string }; Returns: Json }
      eleve_courant: { Args: never; Returns: string }
      eleves_sans_connexion: {
        Args: { p_classe?: string }
        Returns: {
          classe: string
          cree_le: string
          eleve_id: string
          email: string
          nom: string
          prenom: string
        }[]
      }
      enregistrer_session: {
        Args: {
          p_defi_id?: string
          p_duree_s?: number
          p_erreurs?: Json
          p_maitrise?: Json
          p_mode: string
          p_nb_questions: number
          p_plus_haute_table?: number
          p_sans_faute_max?: number
          p_score: number
          p_score_premier_essai?: number
          p_serie_max?: number
          p_tables: number[]
        }
        Returns: Json
      }
      enregistrer_session_prof: {
        Args: {
          p_duree_s?: number
          p_mode: string
          p_nb_questions: number
          p_plus_haute_table?: number
          p_sans_faute_max?: number
          p_score: number
          p_score_premier_essai?: number
          p_serie_max?: number
          p_tables: number[]
        }
        Returns: Json
      }
      est_admin: { Args: never; Returns: boolean }
      est_prof: { Args: never; Returns: boolean }
      generer_code_defi: { Args: never; Returns: string }
      importer_eleves: { Args: { p_eleves: Json }; Returns: Json }
      journaliser: {
        Args: { p_action: string; p_cible: string; p_detail?: Json }
        Returns: undefined
      }
      liste_classes: {
        Args: never
        Returns: {
          classe: string
          eleves_actifs: number
          est_favorite: boolean
          niveau: string
        }[]
      }
      liste_eleves: {
        Args: { p_classe?: string }
        Returns: {
          actif: boolean
          avatar_emoji: string
          classe: string
          deja_connecte: boolean
          derniere_connexion: string
          eleve_id: string
          email: string
          nb_sessions: number
          nom: string
          palier: string
          plafond_tables: number
          points_semaine: number
          prenom: string
        }[]
      }
      liste_profs: {
        Args: never
        Returns: {
          actif: boolean
          classes: string[]
          connecte: boolean
          email: string
          nom: string
          prof_id: string
          role: string
        }[]
      }
      maitrise_classe: {
        Args: { p_classe: string }
        Returns: {
          eleves_jaunes: number
          eleves_rouges: number
          eleves_total: number
          eleves_verts: number
          table_n: number
          taux_maitrise: number
        }[]
      }
      mes_defis: {
        Args: { p_limite?: number }
        Returns: {
          attendus: number
          auteur_nom: string
          classe: string
          code: string
          cree_le: string
          defi_id: string
          encore_ouvert: boolean
          expire_le: string
          origine: string
          participants: number
          participants_classe: number
          tables: number[]
          type: string
        }[]
      }
      mes_tables_faibles: { Args: { p_combien?: number }; Returns: number[] }
      modifier_eleve: {
        Args: {
          p_classe?: string
          p_eleve_id: string
          p_email?: string
          p_nom?: string
          p_prenom?: string
        }
        Returns: Json
      }
      modifier_prof: {
        Args: {
          p_classes?: string[]
          p_nom?: string
          p_prof_id: string
          p_role?: string
        }
        Returns: Json
      }
      mon_profil: { Args: never; Returns: Json }
      mon_profil_prof: { Args: never; Returns: Json }
      nb_admins_actifs: { Args: never; Returns: number }
      niveau_scolaire: { Args: { p_classe: string }; Returns: string }
      nom_public: { Args: { p_nom: string; p_prenom: string }; Returns: string }
      palier_de_plafond: { Args: { p_plafond: number }; Returns: string }
      palier_tables: { Args: { p_tables: number[] }; Returns: string }
      peut_administrer_classe: { Args: { p_classe: string }; Returns: boolean }
      plafond_par_defaut: { Args: { p_classe: string }; Returns: number }
      poids_fait: { Args: { p_a: number; p_b: number }; Returns: number }
      poids_moyen: { Args: { p_tables: number[] }; Returns: number }
      points_session: {
        Args: { p_score: number; p_score_premier: number; p_tables: number[] }
        Returns: number
      }
      prof_courant: { Args: never; Returns: string }
      prof_voit_classe: { Args: { p_classe: string }; Returns: boolean }
      progression_detail: {
        Args: { p_depuis: string; p_eleve: string }
        Returns: {
          bonus_jours: number
          bonus_vertes: number
          cases_vertes: number
          jours_actifs: number
          points_jeu: number
          total: number
        }[]
      }
      qui_suis_je: { Args: never; Returns: Json }
      reactiver_eleve: { Args: { p_eleve_id: string }; Returns: Json }
      rejoindre_defi: { Args: { p_code: string }; Returns: Json }
      terminer_defi: {
        Args: {
          p_defi_id: string
          p_detail?: Json
          p_erreurs?: number
          p_maitrise?: Json
          p_score: number
          p_score_premier_essai?: number
          p_temps_s: number
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
  public: {
    Enums: {},
  },
} as const
