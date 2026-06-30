import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Eye, EyeOff, User as UserIcon, Mail, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { notify } from '../lib/notify';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  // Forgot password state removed for enterprise security model

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onTouched',
  });

  const isLoginSubmitting = loginForm.formState.isSubmitting;
  const isRegisterSubmitting = registerForm.formState.isSubmitting;

  async function onLoginSubmit(values: LoginFormValues) {
    try {
      await login(values.email.trim(), values.password);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const serverMessage = e?.response?.data?.error ?? e?.message ?? 'Sign in failed.';
      notify.error(serverMessage);
    }
  }

  async function onRegisterSubmit(values: RegisterFormValues) {
    try {
      await register(values.name.trim(), values.email.trim(), values.password);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const serverMessage = e?.response?.data?.error ?? e?.message ?? 'Registration failed.';
      notify.error(serverMessage);
    }
  }


  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#161318] p-4 sm:p-8">
      {/* Mobile Top Header (only visible on small screens) */}
      <div className="absolute top-8 left-8 md:hidden flex items-center gap-3 text-white font-black text-2xl tracking-[0.2em] z-50">
        <img src="/logo-rami.png" alt="Logo" className="h-10 w-auto object-contain" />
        <span className="mt-1">THRAX</span>
      </div>

      <div className="relative w-full max-w-[1280px] h-[720px] bg-[#1e1a20] rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex">
        
        {/* ==================== LEFT SIDE: REGISTER FORM ==================== */}
        <div className="absolute top-0 left-0 w-full md:w-1/2 h-full flex flex-col justify-center p-10 xl:p-16 z-10 bg-[#1e1a20]">
          <h2 className="text-white text-3xl font-bold mb-8 text-center">Registration</h2>
          
          <Form {...registerForm}>
            <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} noValidate autoComplete="off" className="space-y-5">
              {/* Dummy inputs to defeat browser autofill */}
              <input type="text" name="fakeusernameremembered" className="hidden" aria-hidden="true" />
              <input type="password" name="fakepasswordremembered" className="hidden" aria-hidden="true" />
              
              <FormField
                control={registerForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <FormControl>
                          <Input
                          {...field}
                          type="text"
                          autoComplete="new-password"
                          disabled={isRegisterSubmitting}
                          placeholder="Name"
                          className="bg-[#2a2432] border-transparent text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#f97316] h-14 rounded-2xl pl-12 pr-5 text-[15px] shadow-inner"
                        />
                      </FormControl>
                    </div>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={registerForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <FormControl>
                          <Input
                          {...field}
                          type="email"
                          autoComplete="new-password"
                          disabled={isRegisterSubmitting}
                          placeholder="Email"
                          className="bg-[#2a2432] border-transparent text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#f97316] h-14 rounded-2xl pl-12 pr-5 text-[15px] shadow-inner"
                        />
                      </FormControl>
                    </div>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={registerForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <FormControl>
                        <Input
                          {...field}
                          type={showRegisterPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          disabled={isRegisterSubmitting}
                          placeholder="Password"
                          className="bg-[#2a2432] border-transparent text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#f97316] h-14 rounded-2xl pl-12 pr-12 text-[15px] shadow-inner"
                        />
                      </FormControl>
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white transition-colors"
                        onClick={() => setShowRegisterPassword((v) => !v)}
                      >
                        {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              
              <p className="text-xs text-gray-500 text-center px-2">
                Your password will be reviewed and may be updated by the security team to meet organizational policy.
              </p>

              <div className="pt-2">
                <Button 
                  type="submit" 
                  disabled={isRegisterSubmitting} 
                  className="w-full h-14 bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white rounded-full font-bold text-[16px] transition-all shadow-lg hover:shadow-[#f97316]/25"
                >
                  {isRegisterSubmitting ? <><Loader2 size={20} className="animate-spin mr-2" /> Registering…</> : 'Register'}
                </Button>
              </div>

              {/* Mobile-only toggle */}
              <div className="md:hidden text-center mt-6">
                <p className="text-gray-400 text-sm">
                  Already have an account?{' '}
                  <button type="button" onClick={() => setIsLogin(true)} className="text-[#f97316] font-semibold hover:underline">
                    Login
                  </button>
                </p>
              </div>
            </form>
          </Form>
        </div>

        {/* ==================== RIGHT SIDE: LOGIN FORM ==================== */}
        <div className="absolute top-0 right-0 w-full md:w-1/2 h-full flex flex-col justify-center p-10 xl:p-16 z-10 bg-[#1e1a20]">
          <h2 className="text-white text-3xl font-bold mb-8 text-center">Login</h2>

          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} noValidate autoComplete="off" className="space-y-5">
              {/* Dummy inputs to defeat browser autofill */}
              <input type="text" name="fakeusernameremembered" className="hidden" aria-hidden="true" />
              <input type="password" name="fakepasswordremembered" className="hidden" aria-hidden="true" />
              
              <FormField
                control={loginForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <FormControl>
                          <Input
                          {...field}
                          type="email"
                          autoComplete="new-password"
                          disabled={isLoginSubmitting}
                          placeholder="Email"
                          className="bg-[#2a2432] border-transparent text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#f97316] h-14 rounded-2xl pl-12 pr-5 text-[15px] shadow-inner"
                        />
                      </FormControl>
                    </div>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <FormControl>
                        <Input
                          {...field}
                          type={showLoginPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          disabled={isLoginSubmitting}
                          placeholder="Password"
                          className="bg-[#2a2432] border-transparent text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#f97316] h-14 rounded-2xl pl-12 pr-12 text-[15px] shadow-inner"
                        />
                      </FormControl>
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white transition-colors"
                        onClick={() => setShowLoginPassword((v) => !v)}
                      >
                        {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />


              <div className="pt-2">
                <Button 
                  type="submit" 
                  disabled={isLoginSubmitting} 
                  className="w-full h-14 bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white rounded-full font-bold text-[16px] transition-all shadow-lg hover:shadow-[#f97316]/25"
                >
                  {isLoginSubmitting ? <><Loader2 size={20} className="animate-spin mr-2" /> Logging in…</> : 'Login'}
                </Button>
              </div>

              {/* Mobile-only toggle */}
              <div className="md:hidden text-center mt-6">
                <p className="text-gray-400 text-sm">
                  Don't have an account?{' '}
                  <button type="button" onClick={() => setIsLogin(false)} className="text-[#f97316] font-semibold hover:underline">
                    Register
                  </button>
                </p>
              </div>
            </form>
          </Form>
        </div>

        {/* ==================== SLIDING OVERLAY (Desktop Only) ==================== */}
        <motion.div
          className="hidden md:flex absolute top-0 left-0 w-1/2 h-full z-20 flex-col items-center justify-center text-center overflow-hidden"
          initial={false}
          animate={{ 
            x: isLogin ? '0%' : '100%',
            borderTopRightRadius: isLogin ? '140px' : '0px',
            borderBottomRightRadius: isLogin ? '140px' : '0px',
            borderTopLeftRadius: isLogin ? '0px' : '140px',
            borderBottomLeftRadius: isLogin ? '0px' : '140px',
          }}
          transition={{ type: 'tween', duration: 0.6, ease: 'easeInOut' }}
        >
          {/* Overlay Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#2a2432] to-[#161318] w-full h-full"></div>
          
          {/* Abstract Orange Glow */}
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-[#f97316] rounded-full mix-blend-screen filter blur-[100px] opacity-40"></div>
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#ea580c] rounded-full mix-blend-screen filter blur-[100px] opacity-40"></div>

          <div className="relative z-10 w-full h-full flex">
            {/* Content when Login is active (Shape is on the LEFT) */}
            <div className={`absolute inset-0 flex flex-col items-center justify-center px-12 transition-all duration-500 delay-100 ${isLogin ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
              <div className="flex items-center gap-3 text-white font-black text-3xl tracking-[0.2em] mb-8">
                <img src="/logo-rami.png" alt="Logo" className="h-12 w-auto object-contain" />
                <span className="mt-1">THRAX</span>
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Hello, Welcome!</h2>
              <p className="text-gray-300 text-[15px] mb-8 leading-relaxed">
                Enter your personal details and start your journey with us
              </p>
              <button
                onClick={() => setIsLogin(false)}
                className="px-12 py-3 rounded-full border-2 border-white/20 text-white font-semibold tracking-wide hover:bg-white/5 transition-colors"
              >
                Register
              </button>
            </div>

            {/* Content when Register is active (Shape is on the RIGHT) */}
            <div className={`absolute inset-0 flex flex-col items-center justify-center px-12 transition-all duration-500 delay-100 ${!isLogin ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8 pointer-events-none'}`}>
              <div className="flex items-center gap-3 text-white font-black text-3xl tracking-[0.2em] mb-8">
                <img src="/logo-rami.png" alt="Logo" className="h-12 w-auto object-contain" />
                <span className="mt-1">THRAX</span>
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Welcome Back!</h2>
              <p className="text-gray-300 text-[15px] mb-8 leading-relaxed">
                To keep connected with us please login with your personal info
              </p>
              <button
                onClick={() => setIsLogin(true)}
                className="px-12 py-3 rounded-full border-2 border-white/20 text-white font-semibold tracking-wide hover:bg-white/5 transition-colors"
              >
                Login
              </button>
            </div>
          </div>
        </motion.div>

        {/* Mobile View Mask (hides inactive form on mobile) */}
        <div 
          className={`md:hidden absolute inset-0 z-50 bg-[#1e1a20] transition-opacity duration-300 pointer-events-none ${!isLogin ? 'opacity-100' : 'opacity-0'}`} 
          style={{ mixBlendMode: 'normal' }}
        />
        {/* On mobile, if we are in Register mode, we render the Register Form OVER the login form */}
        <div className={`md:hidden absolute top-0 left-0 w-full h-full bg-[#1e1a20] z-[60] transition-transform duration-500 ${!isLogin ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="w-full h-full flex flex-col justify-center p-6 sm:p-10">
            <h2 className="text-white text-3xl font-bold mb-8 text-center mt-10">Registration</h2>
            
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} noValidate autoComplete="off" className="space-y-5">
                {/* Dummy inputs to defeat browser autofill */}
                <input type="text" name="fakeusernameremembered" className="hidden" aria-hidden="true" />
                <input type="password" name="fakepasswordremembered" className="hidden" aria-hidden="true" />
                
                <FormField control={registerForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <FormControl>
                        <Input {...field} autoComplete="new-password" disabled={isRegisterSubmitting} placeholder="Name" className="bg-[#2a2432] border-transparent text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#f97316] h-14 rounded-2xl pl-12 pr-5 text-[15px]" />
                      </FormControl>
                    </div>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <FormControl>
                          <Input {...field} type="email" autoComplete="new-password" disabled={isRegisterSubmitting} placeholder="Email" className="bg-[#2a2432] border-transparent text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#f97316] h-14 rounded-2xl pl-12 pr-5 text-[15px]" />
                      </FormControl>
                    </div>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <FormControl>
                        <Input {...field} type={showRegisterPassword ? 'text' : 'password'} autoComplete="new-password" disabled={isRegisterSubmitting} placeholder="Password" className="bg-[#2a2432] border-transparent text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#f97316] h-14 rounded-2xl pl-12 pr-12 text-[15px]" />
                      </FormControl>
                      <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-500" onClick={() => setShowRegisterPassword((v) => !v)}>
                        {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )} />

                <p className="text-xs text-gray-500 text-center px-2 mt-2">
                  Your password will be reviewed and may be updated by the security team to meet organizational policy.
                </p>

                <Button type="submit" disabled={isRegisterSubmitting} className="w-full h-14 bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white rounded-full font-bold text-[16px] mt-4">
                  {isRegisterSubmitting ? <><Loader2 size={20} className="animate-spin mr-2" /> Registering…</> : 'Register'}
                </Button>
                <div className="text-center mt-6">
                  <p className="text-gray-400 text-sm">
                    Already have an account? <button type="button" onClick={() => setIsLogin(true)} className="text-[#f97316] font-semibold">Login</button>
                  </p>
                </div>
              </form>
            </Form>
          </div>
        </div>

      </div>

    </div>
  );
}
