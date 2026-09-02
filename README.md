# MediConnect 🏥

**MediConnect** is an AI-powered full-stack healthcare management platform that brings symptom assessment, doctor appointments, pharmacy orders, healthcare facility search, and health record tracking into one system.

## ✨ Features

- 🩺 **AI Symptom Checker** — ML model that predicts the disease
- 📅 **Appointment Booking** — doctor availability and double-booking prevention.
- 💊 **Pharmacy** — Medicine catalog, cart, stock-aware ordering, and live order tracking.
- 🔎 **Find Care** — Search for clinics, diagnostic labs, and hospital bed availability.
- 📈 **Health Tracking** — Track patient vitals, lab reports, and prescriptions.
- 🔐 **Secure Authentication** — Role-based accounts with session authentication and bcrypt password hashing.

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Frontend | EJS, HTML, CSS, JavaScript |
| Backend | Node.js, Express.js, Socket.IO |
| Database | MySQL |
| ML Service | Python, Flask, Scikit-learn, Pandas |
| Authentication | Express Session, bcrypt |


## 🏗️ Architecture

MediConnect uses two independent services:

**Node.js + Express** → Main web application, database, authentication and APIs

**Python + Flask** → Machine learning service for symptom prediction

The two services communicate through HTTP, making them independently testable and deployable.

## 🚀 Setup - 

### 1. Clone the repository

```bash
git clone https://github.com/nupurthakkar17/Mediconnect-A-healthcare-website.git
cd Mediconnect-A-healthcare-website
