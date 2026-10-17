import { createServerSupabaseClient } from '@/config/supabase.server'

export const authDao = {
  async signIn(email: string, password: string) {
    return createServerSupabaseClient().auth.signInWithPassword({ email, password })
  },

  async signUp(email: string, password: string, emailRedirectTo: string, profile: { nom: string; prenom: string }) {
    return createServerSupabaseClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo, data: profile },
    })
  },

  async resendConfirmation(email: string, emailRedirectTo: string) {
    return createServerSupabaseClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo },
    })
  },

  async signOut() {
    return createServerSupabaseClient().auth.signOut()
  },

  async resetPasswordForEmail(email: string, redirectTo: string) {
    return createServerSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo })
  },

  async getUser() {
    return createServerSupabaseClient().auth.getUser()
  },
}
