import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { auth as authApi } from './api'

export type UserRole = 'admin' | 'manager' | 'employee'

export interface User {
  id: number
  email: string
  role: UserRole
  created_at: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: true,

      login: async (email: string, password: string) => {
        const { access_token } = await authApi.login(email, password)
        localStorage.setItem('token', access_token)
        set({ token: access_token })

        const user = await authApi.me()
        set({ user, isLoading: false })
      },

      logout: () => {
        localStorage.removeItem('token')
        set({ user: null, token: null })
      },

      checkAuth: async () => {
        const token = localStorage.getItem('token')
        if (!token) {
          set({ isLoading: false })
          return
        }

        try {
          const user = await authApi.me()
          set({ user, token, isLoading: false })
        } catch {
          localStorage.removeItem('token')
          set({ user: null, token: null, isLoading: false })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
