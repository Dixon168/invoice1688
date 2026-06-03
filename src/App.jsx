import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { subState } from './lib/format'
import { Spinner } from './components/ui'
import Layout from './components/Layout'
import { Login, CreateCompany } from './pages/Auth'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import Blocked from './pages/Blocked'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Products from './pages/Products'
import TaxRates from './pages/TaxRates'
import Invoices from './pages/Invoices'
import InvoiceForm from './pages/InvoiceForm'
import InvoiceDetail from './pages/InvoiceDetail'
import Payments from './pages/Payments'
import Settings from './pages/Settings'

function Protected({ children }) {
  const { session, loading, needsCompany, isSuperAdmin, company } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-screen place-items-center bg-sand"><Spinner /></div>
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  if (isSuperAdmin) return <Navigate to="/admin" replace />
  if (needsCompany) return <CreateCompany />
  if (!subState(company).active) return <Blocked />
  return <Layout>{children}</Layout>
}

function AdminRoute({ children }) {
  const { session, loading, isSuperAdmin } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center bg-ink"><Spinner /></div>
  if (!session || !isSuperAdmin) return <Navigate to="/admin/login" replace />
  return children
}

function Shell() {
  const { session, loading } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={session && !loading ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/invoices" element={<Protected><Invoices /></Protected>} />
      <Route path="/invoices/new" element={<Protected><InvoiceForm /></Protected>} />
      <Route path="/invoices/:id" element={<Protected><InvoiceDetail /></Protected>} />
      <Route path="/invoices/:id/edit" element={<Protected><InvoiceForm /></Protected>} />
      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/products" element={<Protected><Products /></Protected>} />
      <Route path="/payments" element={<Protected><Payments /></Protected>} />
      <Route path="/tax-rates" element={<Protected><TaxRates /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>
}
