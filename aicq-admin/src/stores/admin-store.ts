import { create } from 'zustand'

export type AdminView = 'dashboard' | 'nodes' | 'accounts' | 'config' | 'blacklist'

interface AdminState {
  token: string | null
  isInitialized: boolean
  isLoading: boolean
  currentView: AdminView
  username: string | null

  setToken: (token: string | null) => void
  setIsInitialized: (initialized: boolean) => void
  setIsLoading: (loading: boolean) => void
  setCurrentView: (view: AdminView) => void
  setUsername: (username: string | null) => void
  logout: () => void
}

export const useAdminStore = create<AdminState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null,
  isInitialized: true, // default to true, will be checked on mount
  isLoading: true,
  currentView: 'dashboard',
  username: typeof window !== 'undefined' ? localStorage.getItem('admin_username') : null,

  setToken: (token) => {
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('admin_token', token)
      } else {
        localStorage.removeItem('admin_token')
      }
    }
    set({ token })
  },

  setIsInitialized: (initialized) => set({ isInitialized: initialized }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setCurrentView: (view) => set({ currentView: view }),

  setUsername: (username) => {
    if (typeof window !== 'undefined') {
      if (username) {
        localStorage.setItem('admin_username', username)
      } else {
        localStorage.removeItem('admin_username')
      }
    }
    set({ username })
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_username')
    }
    set({ token: null, username: null, currentView: 'dashboard' })
  },
}))
