-- Healthcare Website - database schema and seed data.
-- This file didn't exist before; without it there was no way for anyone
-- other than you (with your local database already set up) to run this
-- project. Run this once against a fresh MySQL database, e.g.:
--   mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS health;
USE health;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL, -- bcrypt hash
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  review_text TEXT NOT NULL,
  user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS doctors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  specialization VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  doctor_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  symptoms TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_slot (doctor_id, appointment_date, appointment_time),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS HospitalBeds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_name VARCHAR(150) NOT NULL,
  location VARCHAR(120) NOT NULL,
  available_beds INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS health_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  report_name VARCHAR(150) NOT NULL,
  report_description TEXT,
  report_file VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS health_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  steps INT NOT NULL,
  water DECIMAL(5,2) NOT NULL,
  calories INT NOT NULL,
  heart_rate INT NOT NULL,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS medicines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  price DECIMAL(8,2) NOT NULL,
  stock INT NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  delivery_address VARCHAR(255) NOT NULL,
  status ENUM('placed', 'confirmed', 'out_for_delivery', 'delivered') NOT NULL DEFAULT 'placed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  medicine_id INT NOT NULL,
  price DECIMAL(8,2) NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id)
);

CREATE TABLE IF NOT EXISTS labs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(150) NOT NULL,
  city VARCHAR(80) NOT NULL,
  distance DECIMAL(4,1) NOT NULL DEFAULT 0,
  contact VARCHAR(30) NOT NULL,
  opening_time VARCHAR(20) NOT NULL,
  closing_time VARCHAR(20) NOT NULL,
  tests VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS clinics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  services VARCHAR(255) NOT NULL,
  free_checkup_date DATE NOT NULL,
  free_checkup_timings VARCHAR(60) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL
);

CREATE TABLE IF NOT EXISTS clinic_bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clinic_id INT NOT NULL,
  user_id INT NULL,
  name VARCHAR(120) NOT NULL,
  contact VARCHAR(30) NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO doctors (name, specialization) VALUES
  ('Dr. Ananya Rao', 'General Physician'),
  ('Dr. Vikram Singh', 'Cardiologist'),
  ('Dr. Priya Deshmukh', 'Dermatologist'),
  ('Dr. Arjun Mehta', 'Pediatrician'),
  ('Dr. Kavita Joshi', 'Orthopedic')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO HospitalBeds (hospital_name, location, available_beds) VALUES
  ('Nagpur City Hospital', 'Nagpur', 12),
  ('Orange City Multispeciality', 'Nagpur', 0),
  ('Wardhaman Nagar Care Center', 'Nagpur', 5),
  ('Pune General Hospital', 'Pune', 8),
  ('Sahyadri Speciality Hospital', 'Pune', 3),
  ('Lilavati Hospital', 'Mumbai', 0),
  ('Jaslok Hospital', 'Mumbai', 6);

INSERT INTO medicines (name, category, price, stock) VALUES
  ('Paracetamol 500mg', 'Painkiller', 20.00, 150),
  ('Amoxicillin 250mg', 'Antibiotic', 120.00, 60),
  ('Ibuprofen 200mg', 'Anti-inflammatory', 45.00, 90),
  ('Cetirizine 10mg', 'Allergy', 35.00, 100),
  ('Cough Syrup 100ml', 'Cough & Cold', 60.00, 40),
  ('Vitamin C Tablets', 'Supplement', 90.00, 120),
  ('Omeprazole 20mg', 'Antacid', 75.00, 70),
  ('Aspirin 300mg', 'Painkiller', 30.00, 0);

INSERT INTO labs (name, location, city, distance, contact, opening_time, closing_time, tests) VALUES
  ('MedCheck Diagnostics', 'Sadar', 'Nagpur', 2.3, '0712-2345678', '08:00 AM', '08:00 PM', 'Blood test, X-Ray, ECG, Urine test'),
  ('City Pathology Lab', 'Dharampeth', 'Nagpur', 4.1, '0712-2233445', '07:00 AM', '09:00 PM', 'CBC, Thyroid profile, Lipid profile'),
  ('Metro Diagnostic Centre', 'Sitabuldi', 'Nagpur', 1.5, '0712-2998877', '06:30 AM', '10:00 PM', 'MRI, CT Scan, Blood test, COVID test'),
  ('Sahyadri Labs', 'Shivajinagar', 'Pune', 3.2, '020-25567890', '07:00 AM', '09:00 PM', 'Blood test, Diabetes panel, ECG'),
  ('Apex Diagnostics', 'Andheri', 'Mumbai', 2.8, '022-26778899', '08:00 AM', '08:00 PM', 'X-Ray, MRI, Blood test, Ultrasound');

INSERT INTO clinics (name, address, phone, services, free_checkup_date, free_checkup_timings, latitude, longitude) VALUES
  ('Nagpur Free Health Camp', 'Civil Lines, Nagpur', '0712-2765432', 'General checkup, BP, sugar test', '2026-08-05', '09:00 AM - 01:00 PM', 21.1498, 79.0821),
  ('Sitabuldi Community Clinic', 'Sitabuldi, Nagpur', '0712-2887766', 'General checkup, eye screening', '2026-08-10', '10:00 AM - 02:00 PM', 21.1466, 79.0882),
  ('Pune Wellness Camp', 'Kothrud, Pune', '020-25789012', 'General checkup, dental screening', '2026-08-08', '09:30 AM - 12:30 PM', 18.5074, 73.8077);
