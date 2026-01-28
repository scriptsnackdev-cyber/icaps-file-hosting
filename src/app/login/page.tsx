'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Mail, Loader2, ShieldCheck, Cloud, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState<'email' | 'otp'>('email');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get('redirect') || '/';

    const supabase = createClient();

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        // 1. Basic Email Validation
        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            setMessage({ type: 'error', text: 'Please enter a valid email address.' });
            setIsLoading(false);
            return;
        }

        try {
            // 2. Check Whitelist
            // Check if email exists in the 'whitelist' table
            const { data: whitelistData, error: whitelistError } = await supabase
                .from('whitelist')
                .select('email')
                .eq('email', email)
                .single();

            if (whitelistError || !whitelistData) {
                // Artificial delay to prevent enumeration timing attacks
                await new Promise(resolve => setTimeout(resolve, 500));
                throw new Error('Access Denied: Your email is not whitelisted.');
            }

            // 3. User is whitelisted, proceed to send OTP
            const { error } = await supabase.auth.signInWithOtp({
                email,
            });

            if (error) {
                throw error;
            }

            setStep('otp');
            setMessage({
                type: 'success',
                text: 'OTP sent! Check your email for the code.',
            });
        } catch (error: any) {
            if (error.code === 'PGRST116') { // Row not found
                setMessage({ type: 'error', text: 'Access Denied: Your email is not whitelisted.' });
            } else {
                let errorMessage = error.message || 'Failed to send OTP';
                if (errorMessage.includes('rate limit exceeded') || error.status === 429) {
                    errorMessage = 'Too many attempts. Please wait 60 seconds.';
                }
                setMessage({ type: 'error', text: errorMessage });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        if (!otp) {
            setMessage({ type: 'error', text: 'Please enter the OTP code.' });
            setIsLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.verifyOtp({
                email,
                token: otp,
                type: 'email',
            });

            if (error) {
                throw error;
            }

            // Success - Redirect
            router.push(redirectTo);
            router.refresh();

        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Invalid OTP code.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative">
                {/* Header Decoration */}
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-tr from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600 shadow-sm">
                            <Cloud className="w-8 h-8" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                            {step === 'email' ? 'Welcome Back' : 'Enter OTP'}
                        </h1>
                        <p className="text-slate-500 mt-2">
                            {step === 'email'
                                ? 'Sign in to manage your files securely'
                                : `Code sent to ${email}`
                            }
                        </p>
                    </div>

                    {step === 'email' ? (
                        <form onSubmit={handleSendOtp} className="space-y-4">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="name@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none bg-slate-50 focus:bg-white text-slate-800"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Sending...</span>
                                    </>
                                ) : (
                                    <span>Send Code</span>
                                )}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleVerifyOtp} className="space-y-4">
                            <div>
                                <label htmlFor="otp" className="block text-sm font-medium text-slate-700 mb-1.5">One-Time Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                        <KeyRound className="w-5 h-5" />
                                    </div>
                                    <input
                                        id="otp"
                                        type="text"
                                        placeholder="12345678"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.trim())}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none bg-slate-50 focus:bg-white text-slate-800 tracking-widest font-mono"
                                        required
                                        autoFocus
                                        maxLength={8}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Verifying...</span>
                                    </>
                                ) : (
                                    <span>Verify Code</span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setStep('email');
                                    setMessage(null);
                                    setOtp('');
                                }}
                                className="w-full bg-white hover:bg-slate-50 text-slate-600 font-medium py-2.5 rounded-xl transition-all border border-slate-200 flex items-center justify-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span>Back to Email</span>
                            </button>
                        </form>
                    )}

                    <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Secure access restricted to whitelisted users only</span>
                    </div>
                </div>

                {/* Status Message */}
                {message && (
                    <div className={`p-4 text-sm font-medium text-center flex items-center justify-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                        {message.type === 'error' && <AlertCircle className="w-4 h-4" />}
                        {message.text}
                    </div>
                )}
            </div>

            <div className="mt-8 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                    © 2026 ICAPS Clouds Software
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                    Power by <span className="text-blue-500 font-bold">Script Snack Dev</span>
                </p>
            </div>
        </div>
    );
}
