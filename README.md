# 👻⚡ Phantom Energy Cost Calculator

**Phantom Energy Cost Calculator** is a full-stack web application designed to uncover the hidden cost of "phantom" (standby) energy consumed by idle devices. It calculates the precise financial cost and environmental impact (CO₂ emissions) of devices that are plugged in but not actively in use.

---

## ✨ Features

- **Secure Authentication**: Email/password login protected by Supabase Auth (supports advanced ES256 asymmetric keys).
- **Room Management**: Create customized rooms (Living Room, Kitchen, Office, etc.) tied to your state's specific electricity rates.
- **Pre-loaded Appliance Data**: Over 26 common household reference appliances across multiple categories with built-in standby wattage metrics.
- **Precision Energy Engine**: Server-side computations that accurately calculate idle power (kWh), financial cost (₹), and CO₂ emissions (kg).
- **Age Degradation Logic**: Automatically applies multipliers to older appliances, which tend to draw more phantom power.
- **Leakage Score Evaluation**: Instantly rates your whole-house standby footprint (Low, Medium, or High).
- **Interactive Visualizations**: Beautiful, dynamic Chart.js dashboards (Bar charts for timeframes, Doughnut charts for appliance breakdowns).
- **Historical Tracking**: Every calculation is logged to the database, allowing you to monitor improvements over time.
- **Premium UI/UX**: Built with a custom dark-mode glassmorphism design system for a modern, native-app feel.

---

## 🏗️ Technology Stack

| Component     | Technology                                    |
|---------------|-----------------------------------------------|
| **Frontend**  | HTML5, Vanilla JavaScript, CSS3 (Glassmorphism)|
| **Backend**   | Python 3.12, FastAPI, Pydantic                |
| **Database**  | Supabase (PostgreSQL) + Row Level Security  |
| **Auth**      | Supabase Auth (JWT ES256 handled by Gotrue)   |
| **Charts**    | Chart.js 4.0                                  |
| **Deployment**| Render (Infrastructure as Code via `render.yaml`) |

---

## 🚀 Getting Started (Local Development)

### 1. Supabase Setup
1. Create a free project at [supabase.com](https://supabase.com).
2. Run your provided `schema.sql` (if you have one) in the **SQL Editor** to create the required tables and security policies.
3. Grab your **Project URL**, **Anon Key**, and **Service Role Key** from `Project Settings -> API`.

### 2. Backend Setup
Navigate to the backend directory and set up your Python environment:
```bash
cd backend
python -m venv venv

# Activate Virtual Environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```
Create a `.env` file in the `backend/` directory by copying `.env.template`:
```bash
cp ../.env.template .env
```
Fill in your Supabase credentials inside the new `.env` file. Then start the FastAPI server:
```bash
python main.py
```
*The API will run at `http://127.0.0.1:8000`*

### 3. Frontend Setup
1. Open `frontend/js/supabase-config.js` and insert your Supabase URL and Anon Key.
2. In a new terminal, serve the frontend folder using Python's built-in HTTP server:
```bash
cd frontend
python -m http.server 5500
```
3. Open `http://127.0.0.1:5500` in your browser.

---

## ☁️ Deployment

This repository includes a `render.yaml` Blueprint for easy deployment to [Render](https://render.com).
1. Push this repository to GitHub.
2. Log into Render, click **New+ -> Blueprint**.
3. Connect your repository. Render will automatically detect the backend structure and provision the web service.
4. Don't forget to add your Supabase Environment Variables to the Render Dashboard once deployed!

---

## 📐 Calculation Formulas

All heavy lifting is done securely on the backend using the following methodology:

```text
Effective Standby (W)  = Base Standby (W) × Age Multiplier
Idle Energy (kWh/day)  = (Effective Standby × Idle Hours) / 1000
Financial Cost (₹/day) = Idle Energy × Energy Rate (₹/kWh)
CO₂ (kg/day)           = Idle Energy × 0.71 (Indian grid emission factor)
```
*Age Multipliers:* `<1yr: 1.0`, `<3yr: 1.05`, `<5yr: 1.10`, `<10yr: 1.20`, `10+yr: 1.35`

---

## 📜 License
MIT License
