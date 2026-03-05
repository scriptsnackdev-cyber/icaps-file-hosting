'use client'

import { useState } from 'react'
import { sendOTP, verifyOTP } from './actions'
import styles from './login.module.css'
import { Cloud, ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [step, setStep] = useState<'email' | 'otp'>('email')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        const formData = new FormData()
        formData.append('email', email)

        const res = await sendOTP(formData)

        if (res?.error) {
            setError(res.error)
        } else if (res?.success) {
            setStep('otp')
        }

        setLoading(false)
    }

    const handleVerifyOTP = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        const formData = new FormData(e.currentTarget)
        formData.append('email', email)

        const res = await verifyOTP(formData)
        if (res?.error) {
            setError(res.error)
            setLoading(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.logoRing}>
                        <Cloud size={32} color="var(--brand-end)" />
                    </div>
                    <h1 className={styles.title}>
                        ICAPS <span>Cloud</span>
                    </h1>
                    <p className={styles.subtitle}>
                        {step === 'email'
                            ? 'Secure enterprise file hosting. Enter your registered email to continue.'
                            : 'Check your inbox for the login code.'}
                    </p>
                </div>

                {/* Step badge */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                    <div className={styles.stepBadge}>
                        {step === 'email' ? (
                            <><Mail size={12} /> STEP 1 — IDENTIFY</>
                        ) : (
                            <><ShieldCheck size={12} /> STEP 2 — VERIFY</>
                        )}
                    </div>
                </div>

                {/* Email target (shown on OTP step) */}
                {step === 'otp' && (
                    <div className={styles.emailTarget}>
                        <Mail size={16} color="var(--brand-end)" />
                        <div>
                            <div>{email}</div>
                            <span>Code sent to this address</span>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && <div className={styles.errorBanner} style={{ marginBottom: '20px' }}>{error}</div>}

                {/* Forms */}
                {step === 'email' ? (
                    <form onSubmit={handleSendOTP} className={styles.form}>
                        <div className={styles.inputWrapper}>
                            <span className={styles.inputIcon}><Mail size={16} /></span>
                            <input
                                type="email"
                                name="email"
                                value={email || ''}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                className={styles.input}
                                required
                                autoFocus
                            />
                        </div>
                        <button type="submit" className={styles.primaryBtn} disabled={loading}>
                            {loading ? (
                                <><div className={styles.spinner} /> Verifying access...</>
                            ) : (
                                <>Send Login Code <ArrowRight size={18} /></>
                            )}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOTP} className={styles.form}>
                        <div className={styles.inputWrapper}>
                            <span className={styles.inputIcon}><KeyRound size={16} /></span>
                            <input
                                type="text"
                                name="token"
                                placeholder="· · · · · · · ·"
                                className={`${styles.input} ${styles.inputOtp}`}
                                required
                                autoFocus
                                maxLength={8}
                            />
                        </div>
                        <button type="submit" className={styles.primaryBtn} disabled={loading}>
                            {loading ? (
                                <><div className={styles.spinner} /> Authenticating...</>
                            ) : (
                                <><KeyRound size={18} /> Verify &amp; Login</>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setStep('email'); setError(''); }}
                            className={styles.textBtn}
                        >
                            ← Use a different email
                        </button>
                    </form>
                )}

                {/* Footer */}
                <div className={styles.footer}>
                    <strong>ICAPS CLOUDS</strong> — Powered by Script Snack Dev
                </div>
            </div>
        </div>
    )
}
