import { Resend } from 'resend';

// NOTE: Please add your RESEND_API_KEY to your .env.local file
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendActivityNotification({
    to,
    projectName,
    userName,
    action,
    fileName,
    timestamp
}: {
    to: string;
    projectName: string;
    userName: string;
    action: 'UPLOADED' | 'DELETED' | 'VERSION_UPDATEDs';
    fileName: string;
    timestamp: string;
}) {
    try {
        const { data, error } = await resend.emails.send({
            from: 'ICAPS Cloud <ICAPS-Cloud@icaps.cloud>',
            to: [to],
            subject: `[${projectName}] Project Activity: ${action}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #334155;">
                    <h2 style="color: #2563eb;">Project Activity Notification</h2>
                    <p>Hello Project Owner,</p>
                    <p>This is an automated notification regarding recent activity in your project <strong>${projectName}</strong>.</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <div style="background-color: #f8fafc; padding: 15px; rounded: 8px;">
                        <p style="margin: 0; font-size: 14px;"><strong>User:</strong> ${userName}</p>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Action:</strong> ${action}</p>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>File/Item:</strong> ${fileName}</p>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Time:</strong> ${timestamp}</p>
                    </div>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #94a3b8;">You received this because email notifications are enabled in your project settings.</p>
                </div>
            `,
        });

        if (error) {
            console.error('Resend Email Error:', error);
            return { success: false, error };
        }

        return { success: true, data };
    } catch (err) {
        console.error('Unexpected Email Error:', err);
        return { success: false, error: err };
    }
}
