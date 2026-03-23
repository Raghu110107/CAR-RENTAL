const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost';
const frontendDir = path.join(__dirname, '..', 'frontend');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'car_rental',
  waitForConnections: true,
  connectionLimit: 10
});

const uploadsDir = path.join(__dirname, '..', 'frontend', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    const safeBaseName = path
      .parse(file.originalname)
      .name
      .replace(/[^a-zA-Z0-9_-]/g, '_') || 'car_image';
    const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}_${safeBaseName}${extension}`);
  }
});

const upload = multer({
  storage,
  fileFilter: function (_req, file, cb) {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      cb(new Error('Only JPG, JPEG, PNG, WEBP, or AVIF images are allowed'));
      return;
    }
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(frontendDir));

function sendJson(res, status, message, data = {}) {
  res.json({
    status,
    message,
    data
  });
}

function cleanInput(value) {
  return String(value || '').trim();
}

function buildImageUrl(imagePath) {
  if (!imagePath) {
    return `${FRONTEND_ORIGIN}:${PORT}/images/ui.jpg`;
  }

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  if (imagePath.startsWith('uploads/')) {
    return `http://localhost:${PORT}/${imagePath}`;
  }

  return `${FRONTEND_ORIGIN}:${PORT}/${imagePath}`;
}

function mapCarRow(row) {
  return {
    ...row,
    image: buildImageUrl(row.image)
  };
}

app.get('/api/health', function (_req, res) {
  sendJson(res, true, 'Node backend is running', { port: PORT });
});

app.get('/', function (_req, res) {
  res.sendFile(path.join(frontendDir, 'register.html'));
});

app.post('/api/register', async function (req, res) {
  try {
    const name = cleanInput(req.body.name);
    const email = cleanInput(req.body.email);
    const password = req.body.password || '';
    const phone = cleanInput(req.body.phone);

    if (!name || !email || !password || !phone) {
      return sendJson(res, false, 'All fields are required');
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return sendJson(res, false, 'Invalid email address');
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      return sendJson(res, false, 'Phone number must be 10 digits');
    }

    const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingRows.length > 0) {
      return sendJson(res, false, 'Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, phone) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, phone]
    );

    return sendJson(res, true, 'Registration successful', {
      user_id: result.insertId,
      name,
      email
    });
  } catch (error) {
    return sendJson(res, false, 'Registration failed: ' + error.message);
  }
});

app.post('/api/login', async function (req, res) {
  try {
    const email = cleanInput(req.body.email);
    const password = req.body.password || '';

    if (!email || !password) {
      return sendJson(res, false, 'Email and password are required');
    }

    const [rows] = await pool.execute('SELECT id, name, email, password FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return sendJson(res, false, 'User not found');
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendJson(res, false, 'Incorrect password');
    }

    return sendJson(res, true, 'Login successful', {
      user_id: user.id,
      name: user.name,
      email: user.email
    });
  } catch (error) {
    return sendJson(res, false, 'Login failed: ' + error.message);
  }
});

app.get('/api/cars', async function (_req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, brand, category, price_per_day, image, rental_conditions, status FROM cars WHERE status = 'Available' ORDER BY id DESC"
    );

    return sendJson(res, true, 'Cars fetched successfully', rows.map(mapCarRow));
  } catch (error) {
    return sendJson(res, false, 'Failed to fetch cars: ' + error.message);
  }
});

app.post('/api/bookings', async function (req, res) {
  try {
    const userId = Number(req.body.user_id || 0);
    const car = cleanInput(req.body.car);
    const pickupDate = cleanInput(req.body.pickup_date);
    const returnDate = cleanInput(req.body.return_date);
    const totalAmount = Number(req.body.total_amount || 0);
    const status = cleanInput(req.body.status || 'Pending');

    if (!userId || !car || !pickupDate || !returnDate || !totalAmount) {
      return sendJson(res, false, 'All booking fields are required');
    }

    if (new Date(returnDate) < new Date(pickupDate)) {
      return sendJson(res, false, 'Return date must be after pickup date');
    }

    const [result] = await pool.execute(
      'INSERT INTO bookings (user_id, car, pickup_date, return_date, total_ammount, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, car, pickupDate, returnDate, totalAmount, status]
    );

    return sendJson(res, true, 'Booking successful', {
      booking_id: result.insertId,
      car,
      pickup_date: pickupDate,
      return_date: returnDate,
      total_amount: totalAmount
    });
  } catch (error) {
    return sendJson(res, false, 'Booking failed: ' + error.message);
  }
});

app.post('/api/payments', async function (req, res) {
  try {
    const bookingId = Number(req.body.booking_id || 0);
    const amount = Number(req.body.amount || 0);
    const paymentMethod = cleanInput(req.body.payment_method);
    const paymentStatus = cleanInput(req.body.payment_status || 'Paid');

    if (!bookingId || !amount || !paymentMethod) {
      return sendJson(res, false, 'All payment fields are required');
    }

    const [result] = await pool.execute(
      'INSERT INTO payments (booking_id, amount, payment_method, payment_status) VALUES (?, ?, ?, ?)',
      [bookingId, amount, paymentMethod, paymentStatus]
    );

    return sendJson(res, true, 'Payment successful', {
      payment_id: result.insertId,
      booking_id: bookingId,
      amount,
      payment_method: paymentMethod
    });
  } catch (error) {
    return sendJson(res, false, 'Payment failed: ' + error.message);
  }
});

app.get('/api/admin/bookings', async function (req, res) {
  try {
    const scope = cleanInput(req.query.scope || 'pending').toLowerCase();
    const whereClause = scope === 'history'
      ? "WHERE b.status <> 'Pending'"
      : "WHERE b.status = 'Pending'";

    const [rows] = await pool.execute(
      `SELECT
        b.id,
        b.user_id,
        b.car,
        b.pickup_date,
        b.return_date,
        b.total_ammount,
        b.status,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        p.amount AS payment_amount,
        p.payment_method,
        p.payment_status
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN payments p ON p.booking_id = b.id
      ${whereClause}
      ORDER BY b.id DESC`
    );

    return sendJson(res, true, 'Admin bookings fetched successfully', rows);
  } catch (error) {
    return sendJson(res, false, 'Failed to fetch bookings: ' + error.message);
  }
});

app.put('/api/admin/bookings/:id/status', async function (req, res) {
  try {
    const bookingId = Number(req.params.id || 0);
    const status = cleanInput(req.body.status);

    if (!bookingId || !['Approved', 'Rejected'].includes(status)) {
      return sendJson(res, false, 'Valid booking id and status are required');
    }

    const [result] = await pool.execute('UPDATE bookings SET status = ? WHERE id = ?', [status, bookingId]);

    if (result.affectedRows === 0) {
      return sendJson(res, false, 'Booking not found');
    }

    return sendJson(res, true, `Booking ${status.toLowerCase()} successfully`, {
      booking_id: bookingId,
      status
    });
  } catch (error) {
    return sendJson(res, false, 'Failed to update booking status: ' + error.message);
  }
});

app.get('/api/admin/cars', async function (_req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, brand, category, price_per_day, image, rental_conditions, status FROM cars ORDER BY id DESC'
    );

    return sendJson(res, true, 'Admin cars fetched successfully', rows.map(mapCarRow));
  } catch (error) {
    return sendJson(res, false, 'Failed to fetch cars: ' + error.message);
  }
});

app.post('/api/admin/cars', upload.single('image'), async function (req, res) {
  try {
    const name = cleanInput(req.body.name);
    const brand = cleanInput(req.body.brand);
    const category = cleanInput(req.body.category || 'General');
    const price = Number(req.body.price_per_day || 0);
    const conditions = cleanInput(req.body.rental_conditions);
    const status = cleanInput(req.body.status || 'Available');

    if (!name || !brand || !price) {
      return sendJson(res, false, 'Car name, brand, and price are required');
    }

    if (!req.file) {
      return sendJson(res, false, 'Please upload a valid image');
    }

    const imagePath = `uploads/${req.file.filename}`;
    const [result] = await pool.execute(
      'INSERT INTO cars (name, brand, category, price_per_day, image, rental_conditions, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, brand, category, price, imagePath, conditions, status]
    );

    return sendJson(res, true, 'Car added successfully', {
      car_id: result.insertId,
      image: buildImageUrl(imagePath)
    });
  } catch (error) {
    return sendJson(res, false, 'Failed to add car: ' + error.message);
  }
});

app.put('/api/admin/cars/:id', upload.single('image'), async function (req, res) {
  try {
    const id = Number(req.params.id || 0);
    const name = cleanInput(req.body.name);
    const brand = cleanInput(req.body.brand);
    const category = cleanInput(req.body.category || 'General');
    const price = Number(req.body.price_per_day || 0);
    const conditions = cleanInput(req.body.rental_conditions);
    const status = cleanInput(req.body.status || 'Available');

    if (!id || !name || !brand || !price) {
      return sendJson(res, false, 'Car id, name, brand, and price are required');
    }

    const [existingRows] = await pool.execute('SELECT image FROM cars WHERE id = ?', [id]);
    if (existingRows.length === 0) {
      return sendJson(res, false, 'Car not found');
    }

    let imagePath = existingRows[0].image;
    if (req.file) {
      imagePath = `uploads/${req.file.filename}`;
    } else if (imagePath.startsWith(`http://localhost:${PORT}/uploads/`)) {
      imagePath = imagePath.replace(`http://localhost:${PORT}/`, '');
    } else if (imagePath.startsWith(`${FRONTEND_ORIGIN}:${PORT}/`)) {
      imagePath = imagePath.replace(`${FRONTEND_ORIGIN}:${PORT}/`, '');
    }

    await pool.execute(
      'UPDATE cars SET name = ?, brand = ?, category = ?, price_per_day = ?, image = ?, rental_conditions = ?, status = ? WHERE id = ?',
      [name, brand, category, price, imagePath, conditions, status, id]
    );

    return sendJson(res, true, 'Car updated successfully', {
      id,
      image: buildImageUrl(imagePath)
    });
  } catch (error) {
    return sendJson(res, false, 'Failed to update car: ' + error.message);
  }
});

app.delete('/api/admin/cars/:id', async function (req, res) {
  try {
    const id = Number(req.params.id || 0);
    if (!id) {
      return sendJson(res, false, 'Car id is required');
    }

    await pool.execute('DELETE FROM cars WHERE id = ?', [id]);
    return sendJson(res, true, 'Car deleted successfully');
  } catch (error) {
    return sendJson(res, false, 'Failed to delete car: ' + error.message);
  }
});

app.use(function (error, _req, res, _next) {
  return sendJson(res, false, error.message || 'Server error');
});

app.use(function (_req, res) {
  res.status(404).sendFile(path.join(frontendDir, 'register.html'));
});

app.listen(PORT, function () {
  console.log(`Car rental Node backend running on http://localhost:${PORT}`);
});
