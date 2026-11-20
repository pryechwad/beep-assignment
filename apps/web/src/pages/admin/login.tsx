import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Wordmark } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { FieldError, Label } from '@/components/ui/form';
import { Card, Input } from '@/components/ui/primitives';
import { useLogin, useSession } from '@/hooks/use-session';
import { ApiRequestError } from '@/lib/api';

const schema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });
type Form = z.infer<typeof schema>;

export default function Login() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/admin';
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  if (session.data) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate(from, { replace: true });
    } catch {
      /* rendered below */
    }
  });
  const serverError = login.error instanceof ApiRequestError ? login.error.message : login.error ? 'Sign-in failed' : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-6"><Wordmark /></div>
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted" />
          <h1 className="text-sm font-semibold text-ink">Operations sign-in</h1>
        </div>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" autoFocus aria-invalid={!!formState.errors.email} {...register('email')} />
            <FieldError>{formState.errors.email?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register('password')} />
            <FieldError>{formState.errors.password?.message}</FieldError>
          </div>
          {serverError && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{serverError}</p>}
          <Button type="submit" variant="primary" className="w-full" size="lg" loading={login.isPending}>Sign in</Button>
        </form>
      </Card>
      <p className="mt-4 text-xs text-muted">Admin accounts are created by the operator via <code className="font-mono">npm run db:seed</code>.</p>
    </div>
  );
}
