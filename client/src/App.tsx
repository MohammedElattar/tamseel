import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import CommitteeList from './pages/admin/CommitteeList';
import CommitteeCreate from './pages/admin/CommitteeCreate';
import CommitteeDetail from './pages/admin/CommitteeDetail';
import OfficerBrowser from './pages/admin/OfficerBrowser';
import MembersBrowser from './pages/admin/MembersBrowser';
import OfficerDetail from './pages/admin/OfficerDetail';
import OfficerEdit from './pages/admin/OfficerEdit';
import OfficersRequirements from './pages/admin/OfficersRequirements';
import DataImport from './pages/admin/DataImport';
import ScoringBasis from './pages/admin/ScoringBasis';
import ServiceScoreEntry from './pages/admin/ServiceScoreEntry';
import LiveVotingMonitor from './pages/admin/LiveVotingMonitor';
import MemberScoresMatrix from './pages/admin/MemberScoresMatrix';
import DecisionReview from './pages/admin/DecisionReview';
import MemberDashboard from './pages/member/MemberDashboard';
import OfficerCvScreen from './pages/member/OfficerCvScreen';
import OfficerServiceScreen from './pages/member/OfficerServiceScreen';
import VotingDisplayScreen from './pages/member/VotingDisplayScreen';
import AdminLayout from './components/layout/AdminLayout';
import MemberLayout from './components/layout/MemberLayout';
import CommitteeMembersReport from './pages/admin/reports/CommitteeMembersReport';
import VotingSummaryReport from './pages/admin/reports/VotingSummaryReport';
import NotMstawfyReport from './pages/admin/reports/NotMstawfyReport';
import DecisionsCardReport from './pages/admin/reports/DecisionsCardReport';
import StatisticsReport from './pages/admin/reports/StatisticsReport';
import FinalDecisionsReport from './pages/admin/reports/FinalDecisionsReport';
import MemberScoresCardReport from './pages/admin/reports/MemberScoresCardReport';
import { ReactNode } from 'react';

function ProtectedRoute({ children, role }: { children: ReactNode; role?: string }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-xl">جاري التحميل...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="committees" element={<CommitteeList />} />
        <Route path="committees/new" element={<CommitteeCreate />} />
        <Route path="committees/:id/edit" element={<CommitteeCreate />} />
        <Route path="officers" element={<OfficerBrowser />} />
        <Route path="members" element={<MembersBrowser />} />
        <Route path="requirements" element={<OfficersRequirements />} />
        <Route path="import" element={<DataImport />} />
        <Route path="scoring" element={<ScoringBasis />} />
        <Route path="officers/:id" element={<OfficerDetail />} />
        <Route path="officers/:id/edit" element={<OfficerEdit />} />
        <Route path="officers/:id/service-score" element={<ServiceScoreEntry />} />
        <Route path="committees/:id" element={<CommitteeDetail />} />
        <Route path="committees/:id/monitor" element={<LiveVotingMonitor />} />
        <Route path="committees/:id/member-scores" element={<MemberScoresMatrix />} />
        <Route path="committees/:id/decisions" element={<DecisionReview />} />
      </Route>

      <Route path="/print/committee/:id/members" element={<ProtectedRoute role="admin"><CommitteeMembersReport /></ProtectedRoute>} />
      <Route path="/print/committee/:id/voting-summary" element={<ProtectedRoute role="admin"><VotingSummaryReport /></ProtectedRoute>} />
      <Route path="/print/committee/:id/not-mstawfy" element={<ProtectedRoute role="admin"><NotMstawfyReport /></ProtectedRoute>} />
      <Route path="/print/committee/:id/decisions-card" element={<ProtectedRoute role="admin"><DecisionsCardReport /></ProtectedRoute>} />
      <Route path="/print/committee/:id/statistics" element={<ProtectedRoute role="admin"><StatisticsReport /></ProtectedRoute>} />
      <Route path="/print/committee/:id/final-decisions" element={<ProtectedRoute role="admin"><FinalDecisionsReport /></ProtectedRoute>} />
      <Route path="/print/committee/:id/member-scores-card" element={<ProtectedRoute role="admin"><MemberScoresCardReport /></ProtectedRoute>} />

      <Route path="/member" element={<ProtectedRoute role="member"><MemberLayout /></ProtectedRoute>}>
        <Route index element={<MemberDashboard />} />
        <Route path="voting-screen" element={<VotingDisplayScreen />} />
        <Route path="officer/:officerId" element={<OfficerCvScreen />} />
        <Route path="officer/:officerId/service" element={<OfficerServiceScreen />} />
      </Route>

      <Route path="/" element={
        user ? <Navigate to={user.role === 'admin' ? '/admin' : '/member'} replace /> : <Navigate to="/login" replace />
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
