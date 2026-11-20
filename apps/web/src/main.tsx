import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminLayout, PublicLayout } from './components/layout';
import { TooltipProvider } from './components/ui/overlay';
import { LoadingRows } from './components/ui/states';
import { toast, Toaster } from './components/ui/toast';
import { useSession } from './hooks/use-session';
import { ApiRequestError } from './lib/api';
import './styles/index.css';

const Home = lazy(() => import('./pages/home'));
const Insights = lazy(() => import('./pages/insights'));
const Jobs = lazy(() => import('./pages/jobs'));
const JobDetail = lazy(() => import('./pages/job-detail'));
const Companies = lazy(() => import('./pages/companies'));
const Analytics = lazy(() => import('./pages/analytics'));
const About = lazy(() => import('./pages/about'));
const NotFound = lazy(() => import('./pages/not-found'));
const Login = lazy(() => import('./pages/admin/login'));
const AdminOverview = lazy(() => import('./pages/admin/overview'));
const AdminPipeline = lazy(() => import('./pages/admin/pipeline'));
const AdminSources = lazy(() => import('./pages/admin/sources'));
const AdminAI = lazy(() => import('./pages/admin/ai'));
const AdminEvaluation = lazy(() => import('./pages/admin/evaluation'));
const AdminCosts = lazy(() => import('./pages/admin/costs'));
const AdminLogs = lazy(() => import('./pages/admin/logs'));

const queryClient = new QueryClient({
  queryCache: new QueryCache(),
  mutationCache: new MutationCache({
    onError: (e) => toast.error('Action failed', e instanceof ApiRequestError ? e.message : 'Unexpected error'),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, e) => !(e instanceof ApiRequestError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
});

function RequireAdmin({ children }: { children: ReactNode }) {
  const session = useSession();
  const loc = useLocation();
  if (session.isPending) return <LoadingRows rows={4} />;
  if (!session.data) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

const page = (el: ReactNode) => <Suspense fallback={<LoadingRows rows={6} />}>{el}</Suspense>;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={page(<Home />)} />
              <Route path="insights" element={page(<Insights />)} />
              <Route path="jobs" element={page(<Jobs />)} />
              <Route path="jobs/:id" element={page(<JobDetail />)} />
              <Route path="companies" element={page(<Companies />)} />
              <Route path="analytics" element={page(<Analytics />)} />
              <Route path="about" element={page(<About />)} />
              <Route path="*" element={page(<NotFound />)} />
            </Route>
            <Route path="admin/login" element={page(<Login />)} />
            <Route
              path="admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route index element={page(<AdminOverview />)} />
              <Route path="pipeline" element={page(<AdminPipeline />)} />
              <Route path="sources" element={page(<AdminSources />)} />
              <Route path="ai" element={page(<AdminAI />)} />
              <Route path="evaluation" element={page(<AdminEvaluation />)} />
              <Route path="costs" element={page(<AdminCosts />)} />
              <Route path="logs" element={page(<AdminLogs />)} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
