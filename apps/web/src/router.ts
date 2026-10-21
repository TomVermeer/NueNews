import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import DashboardPage from './pages/DashboardPage.vue'
import LoginPage from './pages/LoginPage.vue'
import { useAuthStore } from './stores/auth'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      { path: '/login', name: 'login', component: LoginPage },
      { path: '/', name: 'home', component: DashboardPage },
      { path: '/d/:id', name: 'dashboard', component: DashboardPage },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })

  // Without a configured login (local development) there is nothing to guard.
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    await auth.init()

    if (!auth.configured) return to.name === 'login' ? { name: 'home' } : true
    if (to.name === 'login') return auth.signedIn ? { name: 'home' } : true
    if (auth.signedIn) return true
    return to.fullPath === '/'
      ? { name: 'login' }
      : { name: 'login', query: { redirect: to.fullPath } }
  })

  return router
}
