'use client'

import { useState } from 'react'
import { sendOTP, verifyOTP } from './actions'
import styles from './login.module.css'
import { Cloud, ArrowRight, KeyRound } from 'lucide-react'

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
            <div className={`${styles.card} glass`}>
                <div className={styles.header}>
                    <Cloud color="var(--primary-color)" size={48} />
                    <h1 className={styles.title}>ICAPS-CLOUD Secure</h1>
                    <p className={styles.subtitle}>
                        {step === 'email'
                            ? 'Enter your whitelisted email to receive a login code.'
                            : `A connection code was sent to ${email}`}
                    </p>
                </div>

                {error && <div className={styles.errorBanner}>{error}</div>}

                {step === 'email' ? (
                    <form onSubmit={handleSendOTP} className={styles.form}>
                        <input
                            type="email"
                            name="email"
                            value={email || ''}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@company.com"
                            className={styles.input}
                            required
                        />
                        <button type="submit" className={styles.primaryBtn} disabled={loading}>
                            {loading ? 'Verifying...' : 'Send Login Code'}
                            <ArrowRight size={18} />
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOTP} className={styles.form}>
                        <input
                            type="text"
                            name="token"
                            placeholder="00000000"
                            className={styles.input}
                            required
                            autoFocus
                            maxLength={8}
                        />
                        <button type="submit" className={styles.primaryBtn} disabled={loading}>
                            <KeyRound size={18} />
                            {loading ? 'Authenticating...' : 'Verify & Login'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep('email')}
                            className={styles.textBtn}
                        >
                            Use a different email
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
