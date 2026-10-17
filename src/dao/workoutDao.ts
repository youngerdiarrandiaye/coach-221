import { fetchAll } from '@/server/pagination'
import { assertDatabaseSuccess, requireAffectedRow } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import { AppError } from '@/exception/AppError'
import type { ExerciseRow, WorkoutLogRow } from '@/entities'
import { addDays } from '@/lib/workoutMath'

export type WorkoutLogWithExercise = WorkoutLogRow & {
  exercice: { id: string; nom: string; groupe_musculaire: string | null }
}

const MAX_LOGS = 1000

export const workoutDao = {
  async listExercises(coachId: string): Promise<ExerciseRow[]> {
    const { data, error } = await createServerSupabaseClient()
      .from('exercises').select('*').eq('coach_id', coachId)
    assertDatabaseSuccess(error)
    // Tri insensible à la casse et aux accents, indépendant de la collation de la base.
    return ((data ?? []) as ExerciseRow[]).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
  },

  async findExerciseByName(coachId: string, nom: string): Promise<ExerciseRow | null> {
    const wanted = nom.trim().toLowerCase()
    return (await this.listExercises(coachId)).find(e => e.nom.toLowerCase() === wanted) ?? null
  },

  async requireExercise(id: string, coachId: string): Promise<ExerciseRow> {
    const { data, error } = await createServerSupabaseClient()
      .from('exercises').select('*').eq('id', id).eq('coach_id', coachId).maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as ExerciseRow
  },

  async createExercise(coachId: string, payload: { nom: string; groupe_musculaire: string | null }): Promise<ExerciseRow> {
    const { data, error } = await createServerSupabaseClient()
      .from('exercises').insert({ ...payload, coach_id: coachId }).select().maybeSingle()
    if (error?.code === '23505') throw new AppError('Cet exercice existe déjà.', 'EXERCISE_EXISTS', 409)
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as ExerciseRow
  },

  /** Trouve l'exercice par nom (insensible à la casse) ou le crée ; tolère une création concurrente. */
  async findOrCreateExercise(coachId: string, nom: string): Promise<ExerciseRow> {
    const existing = await this.findExerciseByName(coachId, nom)
    if (existing) return existing
    try { return await this.createExercise(coachId, { nom: nom.trim(), groupe_musculaire: null }) }
    catch (error) {
      if (error instanceof AppError && error.code === 'EXERCISE_EXISTS') {
        const again = await this.findExerciseByName(coachId, nom)
        if (again) return again
      }
      throw error
    }
  },

  async listLogs(coachId: string, f: { clientId?: string; from?: string; to?: string }): Promise<WorkoutLogWithExercise[]> {
    let query = createServerSupabaseClient().from('workout_logs')
      .select('*, exercises(id, nom, groupe_musculaire)').eq('coach_id', coachId)
    if (f.clientId) query = query.eq('client_id', f.clientId)
    if (f.from) query = query.gte('log_date', f.from)
    if (f.to) query = query.lte('log_date', f.to)
    const { data, error } = await query
      .order('log_date', { ascending: false }).order('serie_numero', { ascending: true }).limit(MAX_LOGS)
    assertDatabaseSuccess(error)
    return ((data ?? []) as (WorkoutLogRow & { exercises: WorkoutLogWithExercise['exercice'] })[])
      .map(({ exercises, ...log }) => ({ ...log, exercice: exercises }))
  },

  /** Séries brutes (colonnes minimales) pour records et analyses ; lecture exhaustive. */
  async listRawLogs(coachId: string, f: { clientId?: string; to?: string; exerciceId?: string }) {
    let query = createServerSupabaseClient().from('workout_logs')
      .select('client_id, exercice_id, log_date, reps, charge_kg').eq('coach_id', coachId)
    if (f.clientId) query = query.eq('client_id', f.clientId)
    if (f.exerciceId) query = query.eq('exercice_id', f.exerciceId)
    if (f.to) query = query.lte('log_date', f.to)
    const { data, error } = await fetchAll(query)
    assertDatabaseSuccess(error)
    return (data ?? []) as { client_id: string; exercice_id: string; log_date: string; reps: number; charge_kg: number }[]
  },

  async createLogs(p: {
    client_id: string; log_date: string; exercice_id: string; session_id: string | null; notes: string | null
    sets: { reps: number; charge_kg: number; rpe?: number | null }[]
  }): Promise<WorkoutLogRow[]> {
    const { data, error } = await createServerSupabaseClient().rpc('create_workout_logs', {
      p_client_id: p.client_id, p_log_date: p.log_date, p_exercice_id: p.exercice_id,
      p_session_id: p.session_id, p_notes: p.notes,
      p_sets: p.sets.map(s => ({ reps: s.reps, charge_kg: s.charge_kg, rpe: s.rpe ?? null })),
    })
    assertDatabaseSuccess(error)
    return (data ?? []) as WorkoutLogRow[]
  },

  async removeLog(id: string, coachId: string): Promise<void> {
    const { data, error } = await createServerSupabaseClient()
      .from('workout_logs').delete().eq('id', id).eq('coach_id', coachId).select('id').maybeSingle()
    assertDatabaseSuccess(error)
    requireAffectedRow(data)
  },

  async listExercisesByIds(coachId: string, ids: string[]) {
    if (!ids.length) return []
    const { data, error } = await createServerSupabaseClient()
      .from('exercises').select('id, nom, groupe_musculaire').eq('coach_id', coachId).in('id', ids)
    assertDatabaseSuccess(error)
    return (data ?? []) as { id: string; nom: string; groupe_musculaire: string | null }[]
  },

  async doneSessionDays(coachId: string, clientId: string | undefined, from: string, to: string): Promise<string[]> {
    let query = createServerSupabaseClient().from('sessions').select('date_heure')
      .eq('coach_id', coachId).eq('statut', 'EFFECTUEE')
      .gte('date_heure', `${from}T00:00:00.000Z`).lt('date_heure', `${addDays(to, 1)}T00:00:00.000Z`)
    if (clientId) query = query.eq('client_id', clientId)
    const { data, error } = await fetchAll(query)
    assertDatabaseSuccess(error)
    // Dakar = UTC : le jour métier est la partie date de l'horodatage UTC.
    return ((data ?? []) as { date_heure: string }[]).map(s => new Date(s.date_heure).toISOString().slice(0, 10))
  },

  async weights(coachId: string, clientId: string | undefined, from: string, to: string) {
    let query = createServerSupabaseClient().from('progress_entries').select('mesure_date, poids_kg')
      .eq('coach_id', coachId).gte('mesure_date', from).lte('mesure_date', to)
    if (clientId) query = query.eq('client_id', clientId)
    const { data, error } = await fetchAll(query)
    assertDatabaseSuccess(error)
    return (data ?? []) as { mesure_date: string; poids_kg: number | null }[]
  },
}
