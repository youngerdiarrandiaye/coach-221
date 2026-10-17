export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode: number = 400,
    /** Champs additionnels exposés dans la réponse d'erreur (ex. liste des conflits). Jamais de détail SQL. */
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Error) return new AppError(error.message)
  return new AppError('Une erreur inattendue est survenue')
}

export function getErrorMessage(error: unknown): string {
  return toAppError(error).message
}
