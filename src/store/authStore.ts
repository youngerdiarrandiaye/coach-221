import { create } from 'zustand'
import type { ProfileRow } from '@/entities'

interface AuthState {
  profile: ProfileRow | null
  setProfile: (profile: ProfileRow | null) => void
  clearProfile: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  profile:      null,
  setProfile:   (profile) => set({ profile }),
  clearProfile: ()        => set({ profile: null }),
}))
