# Car Rental System

## Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Database: MongoDB Atlas

## Features
- User registration and login
- View available cars
- Book cars
- Payment flow
- Admin add, edit, delete cars
- Admin booking request management

## How to Run
1. Open terminal in `backend`
2. Create a `.env` file from `.env.example`
3. Set `MONGODB_URI` to your MongoDB connection string
4. Run `npm install`
5. Run `npm start`
6. Open `http://localhost:5000/register.html`

## Database
MongoDB is used for users, cars, bookings, and payments. The backend seeds a few sample cars automatically when the cars collection is empty.
