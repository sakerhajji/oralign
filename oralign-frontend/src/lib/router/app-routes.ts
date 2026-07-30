export type AppRoute = {
  title: string;
  path: string;
  requiresAuth?: boolean;
  requiredRole?: 'admin' | 'dentist' | 'designer';
  children?: AppRoute[];
};

export const PUBLIC_ROUTES: AppRoute[] = [
  { title: 'Home', path: '/decouvrir' },
  { title: 'Login', path: '/login' },
  { title: 'Signup', path: '/signup' },
  { title: 'Forgot Password', path: '/forgot-password' },
  { title: 'Reset Password', path: '/reset-password' },
  { title: 'Verify Email', path: '/verify-email' },
];

export const AUTH_ROUTES = ['/login', '/signup'];

export const DASHBOARD_ROUTES: AppRoute[] = [
  {
    title: 'Dashboard',
    path: '/dashboard',
    requiresAuth: true,
    children: [
      { title: 'Statistics', path: '/dashboard', requiresAuth: true },
      {
        title: 'Users',
        path: '/dashboard/users',
        requiresAuth: true,
        requiredRole: 'admin',
      },
      {
        title: 'Patients',
        path: '/dashboard/patients',
        requiresAuth: true,
      },
    ],
  },
];

export const PROTECTED_ROUTE_PREFIXES = ['/dashboard', '/account'];

export const DASHBOARD_NAV_ITEMS = [
  { title: 'Statistics', url: '/dashboard' },
  { title: 'Users', url: '/dashboard/users' },
  { title: 'Patients', url: '/dashboard/patients' },
];
