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
  action: 'UPLOADED' | 'DELETED' | 'VERSION_UPDATED';
  fileName: string;
  timestamp: string;
}) {
  const actionLabel = {
    'UPLOADED': 'อัปโหลดไฟล์ใหม่',
    'DELETED': 'ลบไฟล์',
    'VERSION_UPDATED': 'อัปเดตเวอร์ชันไฟล์'
  }[action] || action;

  const actionColor = {
    'UPLOADED': '#10b981', // green
    'DELETED': '#ef4444', // red
    'VERSION_UPDATED': '#3b82f6' // blue
  }[action] || '#6b7280';

  try {
    const { data, error } = await resend.emails.send({
      from: 'ICAPS Cloud <ICAPS-Cloud@icaps.cloud>',
      to: [to],
      subject: `[${projectName}] แจ้งเตือนกิจกรรม: ${actionLabel}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .email-wrapper {
      padding: 40px 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
      background: #ffffff;
      padding: 48px 40px;
      border-radius: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
    }
    .header {
      margin-bottom: 32px;
    }
    .logo {
      margin-bottom: 8px;
    }
    .logo img {
      height: 72px;
      width: auto;
      display: inline-block;
    }
    .tagline {
      font-size: 13px;
      color: #9ca3af;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }
    .greeting {
      color: #111827;
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .text {
      color: #6b7280;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .activity-container {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 100%);
      border: 2px dashed #667eea;
      border-radius: 16px;
      padding: 32px 24px;
      margin: 32px 0;
      position: relative;
      overflow: hidden;
      text-align: left;
    }
    .activity-container::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(102, 126, 234, 0.1) 0%, transparent 70%);
      animation: pulse 3s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }
    .detail-row {
        margin-bottom: 12px;
        position: relative;
        z-index: 1;
        display: flex;
        align-items: flex-start;
    }
    .detail-label {
        font-size: 13px;
        font-weight: 700;
        color: #667eea;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        min-width: 80px;
        flex-shrink: 0;
    }
    .detail-value {
        font-size: 14px;
        color: #374151;
        font-weight: 500;
        word-break: break-word;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #f3f4f6;
      color: #4b5563;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: 100px;
      margin-top: 24px;
      border: 1px solid #e5e7eb;
    }
    .status-badge::before {
      content: '🔔';
      font-size: 16px;
    }
    .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, #e5e7eb, transparent);
      margin: 32px 0;
    }
    .footer {
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.8;
    }
    .footer-warning {
      color: #6b7280;
      font-weight: 500;
      margin-bottom: 16px;
    }
    .copyright {
      color: #d1d5db;
      font-size: 11px;
      margin-top: 16px;
    }
    @media only screen and (max-width: 600px) {
      .container {
        padding: 32px 24px;
        border-radius: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">
          <img src="https://hxzobmgohwrmgjcylufh.supabase.co/storage/v1/object/public/assets/ICAPS.png" alt="icaps.cloud logo">
        </div>
        <div class="tagline">Cloud Infrastructure</div>
      </div>
      
      <div class="greeting">สวัสดีครับ 👋</div>
      <p class="text">
        มีการอัปเดตกิจกรรมในโปรเจกต์ <strong>${projectName}</strong><br>
        รายละเอียดด้านล่าง
      </p>
      
      <div class="activity-container">
        <div class="detail-row">
            <div class="detail-label">ผู้ใช้งาน</div>
            <div class="detail-value">${userName}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">กิจกรรม</div>
            <div class="detail-value" style="color: ${actionColor}">${actionLabel}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">ไฟล์</div>
            <div class="detail-value">${fileName}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">เวลา</div>
            <div class="detail-value">${timestamp}</div>
        </div>
      </div>
      
      <div class="status-badge">
        แจ้งเตือนอัตโนมัติจากระบบ
      </div>
      
      <div class="divider"></div>
      
      <div class="footer">
        <div class="footer-warning">
          อีเมลนี้ถูกส่งอัตโนมัติเนื่องจากการตั้งค่าการแจ้งเตือนในโปรเจกต์ของคุณ<br>
          หากมีข้อสงสัยสามารถตรวจสอบได้ที่ Dashboard
        </div>
        <div class="copyright">
          &copy; 2026 ICAPS Clouds Power by Script Snack Dev
        </div>
      </div>
    </div>
  </div>
</body>
</html>
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
