# 🏥 AI Health Monitor — IoT & Healthcare Web Application

A full-stack Real-Time Health Monitoring system integrating ESP32 IoT sensors (MAX30102 / AD8232 via ThingSpeak), automated clinical reports, multi-role dashboards (Patient, Doctor, Pathology Lab), and an inbuilt OTP email delivery service.

---

## 🚀 Live Deployment on Render (render.com)

### Quick Settings on Render:
1. **Service Type:** Web Service
2. **Environment:** Node
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm start`
5. **Environment Variables:**
   - `SMTP_EMAIL`: Your Gmail address (for sending OTPs)
   - `SMTP_APP_PASSWORD`: Your 16-character Gmail App Password
   - `NODE_VERSION`: `20`

---

## 💻 Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Create a `.env` file from `.env.example`:
   ```env
   PORT=5000
   SMTP_EMAIL=your_email@gmail.com
   SMTP_APP_PASSWORD=your_gmail_app_password
   ```

3. **Run local servers:**
   - **Backend Server (Email OTP):** `npm run server`
   - **Frontend Vite Dev Server:** `npm run dev`
   - **Production preview locally:** `npm run build && npm start`
