/**
 * Aides de saisie rédigées pour un coach de personal training.
 * `hint` : une phrase toujours visible sous le champ (aucun clic nécessaire).
 * `more` : explication facultative, dans un bloc « En savoir plus » replié.
 */
export interface FieldHelp { hint: string; more?: string }

type Catalogue = Record<string, Record<string, FieldHelp>>

export const fieldHelp: Catalogue = {
  clients: {
    telephone: { hint: 'Si possible un numéro WhatsApp : il sert aux rappels. Le format local est accepté, par exemple 77 123 45 67.' },
    email: { hint: 'Facultatif. Utile pour envoyer les reçus et les rapports.' },
    date_naissance: { hint: 'Sert à calculer l’âge, nécessaire pour interpréter la fréquence cardiaque à l’effort.' },
    sexe: { hint: 'Les repères de masse grasse, de tour de taille et de fréquence cardiaque au repos diffèrent entre hommes et femmes.' },
    taille_cm: { hint: 'Mesurée pieds nus. Avec le poids, elle permet de calculer l’IMC.' },
    poids_initial_kg: { hint: 'Le poids de départ : c’est la référence de tous les progrès. Idéalement pesé le matin, à jeun.' },
    objectif: { hint: 'L’objectif principal du client. Il oriente le suivi et peut être modifié à tout moment.' },
  },
  sessions: {
    client_id: { hint: 'Le client d’une séance ne peut plus être changé après l’enregistrement.' },
    titre: { hint: 'Nommez la séance par son contenu : haut du corps, HIIT, mobilité. Vos titres habituels sont proposés.' },
    date_heure: { hint: 'Heure de Dakar. Vos rappels partent avant cette heure, selon vos réglages du profil.' },
    duree_minutes: { hint: 'Durée totale, échauffement compris. Une séance de force dure en général de 45 à 75 minutes.' },
    description: { hint: 'Ce qui est prévu : exercices, séries, intensité visée.' },
    notes: { hint: 'Notes privées : ressenti du client, douleurs, ajustements à prévoir à la prochaine séance.' },
  },
  payments: {
    client_id: { hint: 'Le client qui a payé. Le montant et le mode de son dernier paiement sont proposés.' },
    montant: { hint: 'En FCFA, nombre entier, sans espace ni virgule. Exemple : 25000.' },
    methode: { hint: 'Comment le client a payé : espèces, Wave ou Orange Money.' },
    statut: {
      hint: 'Payé : l’argent est reçu. En attente : promis mais pas encore reçu. Annulé : ne compte pas dans vos revenus.',
      more: 'Seuls les paiements « Payé » sont additionnés dans vos encaissements du mois et dans le total perçu des fiches clients. Un paiement « En attente » apparaît dans le montant à recevoir.',
    },
    date_paiement: { hint: 'La date à laquelle l’argent a été reçu, pas celle de la séance.' },
    description: { hint: 'Facultatif : ce que le paiement couvre, par exemple « forfait de 8 séances ».' },
  },
  recurrences: {
    client_id: { hint: 'Le client concerné par ces rendez-vous réguliers.' },
    titre: { hint: 'Le nom donné à chaque séance créée, par exemple « Haut du corps ».' },
    duree_minutes: { hint: 'Durée de chaque séance, échauffement compris.' },
    heure: { hint: 'Heure de Dakar, la même pour tous les jours choisis.' },
    jours: { hint: 'Les jours fixes de la semaine où le client s’entraîne.' },
    date_debut: { hint: 'Premier jour de la période.' },
    date_fin: { hint: 'Facultatif : laissez vide si la période n’a pas de fin prévue.' },
    description: { hint: 'Ce qui est prévu pour ces séances.' },
  },
  progress: {
    client_id: { hint: 'Le client mesuré. Ses dernières valeurs sont reprises pour que vous ne changiez que ce qui a bougé.' },
    mesure_date: { hint: 'Mesurez toujours dans les mêmes conditions (même heure, à jeun) pour que les écarts soient fiables.' },
    poids_kg: { hint: 'Pesée du matin, à jeun, avec le même pèse-personne à chaque fois.' },
    frequence_cardiaque_repos_bpm: {
      hint: 'Battements par minute au réveil, allongé et calme. Plus elle baisse avec l’entraînement, plus le cœur est efficace.',
      more: 'Comptez les battements du pouls pendant 60 secondes avant de vous lever. Chez un adulte actif, la valeur se situe souvent entre 50 et 70 bpm. Une hausse durable de plus de 5 à 10 bpm peut signaler de la fatigue ou un début de surentraînement.',
    },
    frequence_cardiaque_effort_bpm: {
      hint: 'Le pic atteint pendant l’effort. Repère théorique : environ 220 moins l’âge.',
      more: 'C’est un repère, pas une limite : la fréquence maximale réelle varie d’une personne à l’autre. Notez la valeur la plus haute lue sur la montre pendant la séance.',
    },
    tour_taille_cm: {
      hint: 'Ruban horizontal à hauteur du nombril, en fin d’expiration normale, sans serrer.',
      more: 'Le tour de taille est un bon indicateur de la graisse abdominale. Repère de santé : au-delà de 94 cm chez l’homme et de 80 cm chez la femme, le risque cardio-métabolique augmente.',
    },
    hanches_cm: { hint: 'À l’endroit le plus large des fesses, pieds joints, ruban à plat.' },
    bras_cm: { hint: 'Au milieu du bras, toujours le même côté et la même position (détendu ou contracté).' },
    cuisse_cm: { hint: 'À mi-cuisse, debout, poids réparti sur les deux jambes.' },
    masse_grasse_pct: {
      hint: 'La part de graisse dans le poids total, donnée par une balance à impédancemètre ou un pli cutané.',
      more: 'Les valeurs changent selon l’appareil et le niveau d’hydratation : gardez le même appareil et les mêmes conditions. L’important est la tendance au fil des mois, pas un chiffre isolé.',
    },
    notes: { hint: 'Le contexte utile : sommeil, stress, changement d’alimentation, blessure.' },
  },
  profile: {
    prenom: { hint: 'Il figure sur les reçus et les rapports remis à vos clients.' },
    nom: { hint: 'Il figure sur les reçus et les rapports remis à vos clients.' },
    telephone: { hint: 'Apparaît sur les reçus que vous remettez à vos clients.' },
    specialite: { hint: 'Ce que vous enseignez, par exemple musculation ou perte de poids. Apparaît sur les reçus.' },
    zone: { hint: 'Le quartier ou la ville où vous intervenez.' },
    description: { hint: 'Quelques phrases pour vous présenter.' },
  },
}

/** Notions d'entraînement expliquées dans la saisie d'un entraînement et dans la page de performance. */
export const trainingGlossary = {
  exercice: 'Le nom de l’exercice tel que vous le suivez, par exemple Squat. Les records sont calculés exercice par exercice.',
  reps: 'Les répétitions réalisées dans la série, de 1 à 100.',
  charge: 'Le poids soulevé en kilos, barre et disques compris. Laissez vide pour un exercice au poids du corps.',
  rpe: 'L’effort ressenti de 1 à 10 (RPE). 10 : impossible de faire une répétition de plus. 8 : il en restait 2. 6 : il en restait 4.',
  volume: 'Le volume est la somme répétitions × charge. Il mesure la quantité de travail réalisée.',
  rm: 'Le 1RM estimé est la charge maximale que le client pourrait soulever une seule fois, calculée sans la tester : charge × (1 + répétitions ÷ 30).',
} as const

export const helpFor = (kind: string, key: string): FieldHelp | null => fieldHelp[kind]?.[key] ?? null
