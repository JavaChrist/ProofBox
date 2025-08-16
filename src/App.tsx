
import './lib/firebase'
import { AuthProvider, useAuth } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import ProofBoxMock from './components/ProofBoxMock'
import AuthScreen from './components/AuthScreen'

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <AuthScreen />;
  return (
    <ProofBoxMock />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  )
}
