CREATE DATABASE IF NOT EXISTS car_rental;
USE car_rental;

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS cars;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT(15) NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE admins (
  id INT(15) NOT NULL AUTO_INCREMENT,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE cars (
  id INT(11) NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  price_per_day INT(11) NOT NULL,
  image VARCHAR(300) NOT NULL,
  rental_conditions TEXT DEFAULT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Available',
  PRIMARY KEY (id)
);

CREATE TABLE bookings (
  id INT(11) NOT NULL AUTO_INCREMENT,
  user_id INT(11) NOT NULL,
  car VARCHAR(100) NOT NULL,
  pickup_date DATE NOT NULL,
  return_date DATE NOT NULL,
  total_ammount INT(10) NOT NULL,
  status VARCHAR(200) NOT NULL DEFAULT 'Pending',
  PRIMARY KEY (id),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE payments (
  id INT(11) NOT NULL AUTO_INCREMENT,
  booking_id INT(11) NOT NULL,
  amount INT(10) NOT NULL,
  payment_method VARCHAR(200) NOT NULL,
  payment_status VARCHAR(200) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

INSERT INTO admins (email, password) VALUES
('admin@carrental.com', '$2y$10$8Q2G1lT0S0vS8P2pWz3Q1u.fZkVx6t7eB4L0vQ4hNrw4Tcey1jD9a');

INSERT INTO cars (name, brand, category, price_per_day, image, rental_conditions, status) VALUES
('BMW M5', 'BMW', 'Luxury', 18, 'images/ui.jpg', 'Luxury sedan in excellent condition.', 'Available'),
('Hyundai Creta', 'Hyundai', 'SUV', 14, 'images/ui.jpg', 'Comfortable SUV for city and highway trips.', 'Available'),
('Maruti Swift', 'Maruti', 'Economy', 10, 'images/ui.jpg', 'Budget-friendly hatchback for daily rides.', 'Available');
