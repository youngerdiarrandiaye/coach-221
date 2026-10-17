export const APP_NAME    = 'TerangaCoach'
export const APP_VERSION = '1.0.0'
export const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const ROUTES = {
  HOME:           '/',
  LOGIN:          '/login',
  REGISTER:       '/register',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD:      '/dashboard',
  CLIENTS:        '/clients',
  SESSIONS:       '/sessions',
  PAYMENTS:       '/payments',
  PROGRESS:       '/progress',
  PROFILE:        '/profile',
} as const

export const OBJECTIF_LABELS: Record<string, string> = {
  PERTE_DE_POIDS: 'Perte de poids',
  PRISE_DE_MASSE: 'Prise de masse',
  CARDIO:         'Cardio',
  TONIFICATION:   'Tonification',
  REMISE_EN_FORME:'Remise en forme',
  REEDUCATION:    'Rééducation légère',
  AUTRE:          'Autre',
}

export const METHODE_LABELS: Record<string, string> = {
  ESPECES:      'Espèces',
  WAVE:         'Wave',
  ORANGE_MONEY: 'Orange Money',
}

export const STATUT_SESSION_LABELS: Record<string, string> = {
  PLANIFIEE:  'À venir',
  EFFECTUEE:  'Effectuée',
  ANNULEE:    'Annulée',
}

export const STATUT_PAYMENT_LABELS: Record<string, string> = {
  PAYE:       'Payé',
  EN_ATTENTE: 'En attente',
  ANNULE:     'Annulé',
}

export const IMC_LABELS = [
  { max: 18.5, label: 'Insuffisance pondérale' },
  { max: 25,   label: 'Poids normal' },
  { max: 30,   label: 'Surpoids' },
  { max: 35,   label: 'Obésité modérée' },
  { max: 40,   label: 'Obésité sévère' },
  { max: Infinity, label: 'Obésité morbide' },
]

export const PAGINATION_LIMIT = 10
