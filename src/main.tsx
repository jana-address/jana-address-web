import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import './styles/index.css'
import App from './App'
import I18nProvider from './i18n/I18nProvider'
import { applyTheme, storedTheme } from './theme'

applyTheme(storedTheme()) // before the first paint, so a saved theme does not flash

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
