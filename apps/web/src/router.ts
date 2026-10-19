import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import DashboardPage from './pages/DashboardPage.vue'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: DashboardPage },
      { path: '/d/:id', name: 'dashboard', component: DashboardPage },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
}
