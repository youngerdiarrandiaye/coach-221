import { authDao } from '@/dao/authDao'
import { AppError } from '@/exception/AppError'

const AUTH_ERRORS: Record<string, string> = {
  'Invalid login credentials':       'Email ou mot de passe incorrect',
  'Email not confirmed':             'Veuillez confirmer votre email',
  'User already registered':         'Un compte existe déjà avec cet email',
  'Password should be at least':     'Le mot de passe est trop court : utilisez au moins 10 caractères',
  'For security purposes':           'Patientez quelques secondes avant de demander un nouvel e-mail',
  'Error sending':                   'L’e-mail n’a pas pu être envoyé. Réessayez dans un instant',
  'password is known to be weak':    'Ce mot de passe est trop courant : choisissez-en un autre',
  'rate limit':                      'Trop de tentatives. Réessayez dans quelques minutes',
}

function mapAuthError(message: string): string {
  for (const [key, label] of Object.entries(AUTH_ERRORS)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return label
  }
  return message
}

function authError(error: { message: string; status?: number; name?: string }): AppError {
  if (error.status === 0 || (error.status !== undefined && error.status >= 500)
    || error.name === 'AuthRetryableFetchError') {
    return new AppError(
      'Le service de connexion est temporairement indisponible. Réessayez dans quelques instants.',
      'AUTH_SERVICE_UNAVAILABLE',
      503,
    )
  }
  return new AppError(mapAuthError(error.message), error.status?.toString())
}

export const authService = {
  async login(email: string, password: string) {
    const { data, error } = await authDao.signIn(email, password)
    if (error) throw authError(error)
    return data
  },

  async register(email: string, password: string, profile: { nom: string; prenom: string }) {
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback?next=/dashboard`
    const { data, error } = await authDao.signUp(email, password, redirectTo, profile)
    if (error) throw authError(error)
    return data
  },

  async resendConfirmation(email: string) {
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback?next=/dashboard`
    const { error } = await authDao.resendConfirmation(email, redirectTo)
    if (error) throw authError(error)
  },

  async logout() {
    const { error } = await authDao.signOut()
    if (error) throw authError(error)
  },

  async sendResetEmail(email: string) {
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback?next=/update-password`
    const { error } = await authDao.resetPasswordForEmail(email, redirectTo)
    if (error) throw authError(error)
  },

  async getCurrentUser() {
    const { data: { user }, error } = await authDao.getUser()
    if (error) return null
    return user
  },
}
