// ============================================================
// AI Health Monitor — Inbuilt OTP Backend Server
// Uses Express + Nodemailer for Direct Email Delivery
// ============================================================

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Gmail SMTP Configuration for direct, fast cloud delivery
const SMTP_USER = process.env.SMTP_EMAIL || 'vedant27sangrame@gmail.com';
const SMTP_PASS = (process.env.SMTP_APP_PASSWORD || 'euefnbmuzxclkuwi').replace(/\s+/g, '');

// Reusable persistent transporter with connection pooling and IPv4
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // SSL direct connection (vastly faster and bypasses cloud firewall blocks)
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  family: 4, // CRITICAL FOR CLOUD: Force IPv4 DNS resolution to prevent 60-second IPv6 timeout hang!
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

/**
 * Sends an email using the fastest and most reliable provider available:
 * 1. Brevo REST API (HTTPS Port 443 — Recommended for Render Free Tier, sends to ANY recipient)
 * 2. Resend REST API (HTTPS Port 443)
 * 3. SendGrid REST API (HTTPS Port 443)
 * 4. Nodemailer SMTP (Port 465 SSL — Perfect for localhost & unblocked servers)
 */
async function deliverOtpEmail({ email, otp, purposeTitle, emailSubject, htmlContent }) {
  const textContent = `Your AI Health Monitor verification code is: ${otp}. Valid for 5 minutes.`;

  // 1. Try Brevo REST API (HTTPS Port 443 — 100% works on Render Free Tier!)
  if (process.env.BREVO_API_KEY) {
    try {
      console.log(`[Email] Attempting delivery via Brevo REST API (Port 443)...`);
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY.trim(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'AI Health Monitor',
            email: SMTP_USER,
          },
          to: [{ email: email }],
          subject: emailSubject,
          htmlContent: htmlContent,
          textContent: textContent,
        }),
      });

      const data = await brevoRes.json().catch(() => ({}));
      if (brevoRes.ok) {
        console.log(`[Brevo API] Successfully delivered OTP to ${email}. MessageId: ${data.messageId || 'OK'}`);
        return { success: true, provider: 'Brevo', messageId: data.messageId };
      } else {
        console.error('[Brevo API Error]:', brevoRes.status, data);
      }
    } catch (err) {
      console.error('[Brevo Network Error]:', err.message);
    }
  }

  // 2. Try Resend REST API (HTTPS Port 443)
  if (process.env.RESEND_API_KEY) {
    try {
      console.log(`[Email] Attempting delivery via Resend REST API (Port 443)...`);
      const resendFrom = process.env.RESEND_FROM || 'AI Health Monitor <onboarding@resend.dev>';
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [email],
          subject: emailSubject,
          html: htmlContent,
          text: textContent,
        }),
      });

      const data = await resendRes.json().catch(() => ({}));
      if (resendRes.ok) {
        console.log(`[Resend API] Successfully delivered OTP to ${email}. MessageId: ${data.id || 'OK'}`);
        return { success: true, provider: 'Resend', messageId: data.id };
      } else {
        console.error('[Resend API Error]:', resendRes.status, data);
      }
    } catch (err) {
      console.error('[Resend Network Error]:', err.message);
    }
  }

  // 3. Try SendGrid REST API (HTTPS Port 443)
  if (process.env.SENDGRID_API_KEY) {
    try {
      console.log(`[Email] Attempting delivery via SendGrid REST API (Port 443)...`);
      const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: SMTP_USER, name: 'AI Health Monitor' },
          subject: emailSubject,
          content: [
            { type: 'text/plain', value: textContent },
            { type: 'text/html', value: htmlContent },
          ],
        }),
      });

      if (sgRes.ok) {
        console.log(`[SendGrid API] Successfully delivered OTP to ${email}.`);
        return { success: true, provider: 'SendGrid' };
      } else {
        const sgData = await sgRes.json().catch(() => ({}));
        console.error('[SendGrid API Error]:', sgRes.status, sgData);
      }
    } catch (err) {
      console.error('[SendGrid Network Error]:', err.message);
    }
  }

  // 4. Default Fallback: Nodemailer Direct SMTP (Port 465 SSL)
  console.log(`[Email] Attempting delivery via Nodemailer SMTP (${SMTP_USER} -> smtp.gmail.com:465)...`);
  const info = await transporter.sendMail({
    from: `"AI Health Monitor" <${SMTP_USER}>`,
    to: email, // Dynamic recipient
    subject: emailSubject,
    text: textContent,
    html: htmlContent,
  });

  console.log(`[SMTP] Successfully delivered OTP to ${email}. MessageId: ${info.messageId}`);
  return { success: true, provider: 'Nodemailer SMTP', messageId: info.messageId };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  const activeProvider = process.env.BREVO_API_KEY
    ? 'Brevo REST API (HTTPS Port 443 - Recommended for Render Free Tier)'
    : process.env.RESEND_API_KEY
    ? 'Resend REST API (HTTPS Port 443)'
    : process.env.SENDGRID_API_KEY
    ? 'SendGrid REST API (HTTPS Port 443)'
    : 'Gmail Nodemailer SMTP (Port 465)';

  res.json({
    status: 'ok',
    service: 'AI Health Monitor Mailer Service',
    activeProvider,
    senderEmail: SMTP_USER,
    cloudReady: Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY),
    notice: !process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY
      ? 'Render Free Tier blocks outbound SMTP ports 465 & 587. Configure BREVO_API_KEY in Render Environment Variables for 100% reliable cloud delivery.'
      : 'HTTP Email API configured and ready for Render Free Tier.',
  });
});

// Send OTP endpoint
app.post('/api/send-otp', async (req, res) => {
  const { email, otp, purpose } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ success: false, message: 'Email and verification code are required.' });
  }

  let purposeTitle = 'Account Verification';
  let emailSubject = `🏥 Your Verification Code: ${otp} - AI Health Monitor`;

  if (purpose === 'registration') {
    purposeTitle = 'Account Registration';
  } else if (purpose === 'reset') {
    purposeTitle = 'Password Reset';
  } else if (purpose === 'deletion' || purpose === 'account_deletion') {
    purposeTitle = 'Account Deletion Request';
    emailSubject = `⚠️ Security Alert: OTP for Account Deletion (${otp}) - AI Health Monitor`;
  }

  // HTML Email Template
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a1a; margin: 0; padding: 24px; color: #f0f0f5; }
          .container { max-width: 500px; margin: 0 auto; background: #12122b; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #6C63FF, #a78bfa); padding: 32px 24px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
          .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
          .content { padding: 32px 28px; text-align: center; }
          .purpose-badge { display: inline-block; background: rgba(108, 99, 255, 0.15); border: 1px solid rgba(108, 99, 255, 0.3); color: #a78bfa; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 20px; }
          .otp-box { background: rgba(255, 255, 255, 0.04); border: 2px dashed #6C63FF; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00E676; margin: 0; font-family: 'Courier New', Courier, monospace; }
          .instructions { color: #a0a0b5; font-size: 14px; line-height: 1.6; margin: 20px 0; }
          .warning { color: #FFB300; font-size: 12px; margin-top: 16px; background: rgba(255,179,0,0.1); padding: 10px; border-radius: 8px; }
          .footer { background: #0c0c1e; padding: 20px; text-align: center; color: #6a6a80; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.06); }
        </style>
      </head>
      <body>
        <div className="container">
          <div className="header">
            <h1>🏥 AI Health Monitor</h1>
            <p>Real-Time IoT Health Monitoring System</p>
          </div>
          <div className="content">
            <div className="purpose-badge">${purposeTitle}</div>
            <p style="color: #f0f0f5; font-size: 16px; margin: 0 0 8px;">Hello,</p>
            <p className="instructions">
              Please use the verification code below to complete your ${purposeTitle.toLowerCase()} process:
            </p>
            <div className="otp-box">
              <div className="otp-code">${otp}</div>
            </div>
            <p className="instructions">
              This verification code is valid for <strong>5 minutes</strong>.
            </p>
            <div className="warning">
              ⚠️ If you did not request this OTP, please ignore this email. Never share this code with anyone.
            </div>
          </div>
          <div className="footer">
            &copy; ${new Date().getFullYear()} AI Health Monitor. Automated IoT Healthcare System.
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const delivery = await deliverOtpEmail({
      email,
      otp,
      purposeTitle,
      emailSubject,
      htmlContent,
    });

    return res.json({
      success: true,
      message: `Verification code sent to ${email}. Please check your inbox.`,
      provider: delivery.provider,
    });
  } catch (error) {
    console.error('[OTP Delivery Error]:', error);

    const isTimeoutOrBlocked =
      error.code === 'ETIMEDOUT' ||
      error.code === 'ESOCKETTIMEDOUT' ||
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('timeout') ||
      error.message?.includes('Connection closed');

    let clientMessage = 'Failed to deliver verification code to your email. Please verify the email address and try again.';
    if (isTimeoutOrBlocked) {
      clientMessage = 'Email delivery timed out. Cloud hosting platforms (like Render Free Tier) block standard SMTP ports 465/587. Please add BREVO_API_KEY in Render Environment Variables for instant HTTP delivery.';
    }

    return res.status(500).json({
      success: false,
      message: clientMessage,
    });
  }
});

// Serve static frontend files from 'dist' in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback to index.html for client-side React Router navigation (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 AI Health Monitor server running on port ${PORT}`);
});
