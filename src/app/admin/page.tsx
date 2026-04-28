import { createClient, createServiceClient } from '@/utils/supabase/server'
import { getWhitelist, addWhitelistUser, removeWhitelistUser } from './actions'
import { redirect } from 'next/navigation'
import styles from './admin.module.css'
import { Trash2, UserPlus, ShieldCheck } from 'lucide-react'

export default async function AdminPage() {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user || !user.email) {
        redirect('/login')
    }

    // Double check if user is admin using service client to bypass RLS
    const serviceClient = createServiceClient();
    const { data: roleData } = await serviceClient
        .from('share_whitelist')
        .select('role')
        .ilike('email', user.email)
        .maybeSingle()

    if (roleData?.role !== 'admin') {
        return (
            <div className={styles.container}>
                <div className={styles.warning}>
                    <ShieldCheck size={48} color="#ef4444" />
                    <h2>Access Denied</h2>
                    <p>You must be an administrator to view this page.</p>
                </div>
            </div>
        )
    }

    const whitelist = await getWhitelist()

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Access Control (Whitelist)</h1>
                <p className={styles.subtitle}>Only users in this list can log into ICAPS-CLOUD.</p>
            </header>

            <div className={styles.content}>
                <div className={styles.formCard}>
                    <h3>Add New User</h3>
                    <form action={async (formData) => {
                        'use server';
                        await addWhitelistUser(formData);
                    }} className={styles.form}>
                        <input
                            type="email"
                            name="email"
                            placeholder="user@company.com"
                            required
                            className={styles.input}
                        />
                        <select name="role" className={styles.select}>
                            <option value="user">Standard User</option>
                            <option value="admin">Administrator</option>
                        </select>
                        <button type="submit" className={styles.primaryBtn}>
                            <UserPlus size={18} />
                            Add User
                        </button>
                    </form>
                </div>

                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>
                        <div>Email</div>
                        <div>Role</div>
                        <div>Added</div>
                        <div style={{ textAlign: 'right' }}>Actions</div>
                    </div>
                    <div className={styles.tableBody}>
                        {whitelist.map((item: { email: string; role: string; created_at: string }) => (
                            <div key={item.email} className={styles.tableRow}>
                                <div className={styles.emailCol}>{item.email}</div>
                                <div>
                                    <span className={`${styles.badge} ${item.role === 'admin' ? styles.badgeAdmin : styles.badgeUser}`}>
                                        {item.role}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--text-light)' }}>
                                    {new Date(item.created_at).toLocaleDateString()}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    {user.email !== item.email && (
                                        <form action={async () => {
                                            'use server'
                                            await removeWhitelistUser(item.email)
                                        }}>
                                            <button type="submit" className={styles.deleteBtn}>
                                                <Trash2 size={18} />
                                            </button>
                                        </form>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
