import { createApp } from 'vue'
import MarketingApp from './MarketingApp.vue'
import { createMarketingRouter } from './router'
import '@/assets/css/base/variables.css'
import '@/assets/css/base/reset.css'
import '@/assets/css/base/typography.css'
import './site.css'

// The public site has no credentials, application stores, API probes or Runner.
createApp(MarketingApp).use(createMarketingRouter()).mount('#app')
