const express = require('express');
const cors = require('cors');
const dns = require('dns');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/car_rental';
const DNS_SERVERS = String(process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const frontendDir = path.join(__dirname, '..', 'frontend');

if (MONGODB_URI.startsWith('mongodb+srv://') && DNS_SERVERS.length > 0) {
  dns.setServers(DNS_SERVERS);
}

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

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, trim: true }
  },
  { versionKey: false }
);

const carSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    category: { type: String, default: 'General', trim: true },
    price_per_day: { type: Number, required: true },
    image: { type: String, required: true, trim: true, default: 'images/ui.jpg' },
    rental_conditions: { type: String, default: '', trim: true },
    status: { type: String, default: 'Available', trim: true }
  },
  { versionKey: false }
);

const bookingSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    car_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Car', required: true },
    car: { type: String, required: true, trim: true },
    pickup_date: { type: String, required: true, trim: true },
    return_date: { type: String, required: true, trim: true },
    total_ammount: { type: Number, required: true },
    status: { type: String, default: 'Pending', trim: true }
  },
  { versionKey: false }
);

const paymentSchema = new mongoose.Schema(
  {
    booking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    amount: { type: Number, required: true },
    payment_method: { type: String, required: true, trim: true },
    payment_status: { type: String, required: true, trim: true }
  },
  { versionKey: false }
);

const User = mongoose.model('User', userSchema);
const Car = mongoose.model('Car', carSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Payment = mongoose.model('Payment', paymentSchema);

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

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(cleanInput(value));
}

function normalizeImagePath(imagePath) {
  const value = cleanInput(imagePath);

  if (!value) {
    return 'images/ui.jpg';
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const parsedUrl = new URL(value);
      return parsedUrl.pathname.replace(/^\/+/, '') || 'images/ui.jpg';
    } catch (_error) {
      return value;
    }
  }

  return value.replace(/^\/+/, '');
}

function buildImageUrl(imagePath) {
  return normalizeImagePath(imagePath);
}

function mapCarDocument(car) {
  return {
    id: String(car._id),
    name: car.name,
    brand: car.brand,
    category: car.category,
    price_per_day: car.price_per_day,
      image: buildImageUrl(car.image),
    rental_conditions: car.rental_conditions,
    status: car.status
  };
}

function mapBookingDocument(booking, paymentByBookingId) {
  const payment = paymentByBookingId.get(String(booking._id));
  return {
    id: String(booking._id),
    user_id: booking.user_id ? String(booking.user_id._id || booking.user_id) : '',
    car_id: booking.car_id ? String(booking.car_id._id || booking.car_id) : '',
    car: booking.car,
    pickup_date: booking.pickup_date,
    return_date: booking.return_date,
    total_ammount: booking.total_ammount,
    status: booking.status,
    user_name: booking.user_id && booking.user_id.name ? booking.user_id.name : '',
    user_email: booking.user_id && booking.user_id.email ? booking.user_id.email : '',
    user_phone: booking.user_id && booking.user_id.phone ? booking.user_id.phone : '',
    payment_amount: payment ? payment.amount : null,
    payment_method: payment ? payment.payment_method : '',
    payment_status: payment ? payment.payment_status : ''
  };
}

async function syncCarStatusById(carId) {
  if (!carId || !isValidObjectId(carId)) {
    return;
  }

  const activeBooking = await Booking.findOne({
    car_id: carId,
    status: { $in: ['Pending', 'Approved', 'Paid'] }
  }).lean();

  const nextStatus = activeBooking ? 'Booked' : 'Available';
  await Car.findByIdAndUpdate(carId, { status: nextStatus });
}

async function seedCarsIfEmpty() {
  const carCount = await Car.countDocuments();
  if (carCount > 0) {
    return;
  }

  await Car.insertMany([
    {
      name: 'BMW M5',
      brand: 'BMW',
      category: 'Luxury',
      price_per_day: 18,
      image: 'images/ui.jpg',
      rental_conditions: 'Luxury sedan in excellent condition.',
      status: 'Available'
    },
    {
      name: 'Hyundai Creta',
      brand: 'Hyundai',
      category: 'SUV',
      price_per_day: 14,
      image: 'images/ui.jpg',
      rental_conditions: 'Comfortable SUV for city and highway trips.',
      status: 'Available'
    },
    {
      name: 'Maruti Swift',
      brand: 'Maruti',
      category: 'Economy',
      price_per_day: 10,
      image: 'images/ui.jpg',
      rental_conditions: 'Budget-friendly hatchback for daily rides.',
      status: 'Available'
    }
  ]);
}

app.get('/api/health', function (_req, res) {
  sendJson(res, true, 'Node backend is running', {
    port: PORT,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/', function (_req, res) {
  res.sendFile(path.join(frontendDir, 'register.html'));
});

app.post('/api/register', async function (req, res) {
  try {
    const name = cleanInput(req.body.name);
    const email = cleanInput(req.body.email).toLowerCase();
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

    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      return sendJson(res, false, 'Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone
    });

    return sendJson(res, true, 'Registration successful', {
      user_id: String(user._id),
      name,
      email
    });
  } catch (error) {
    return sendJson(res, false, 'Registration failed: ' + error.message);
  }
});

app.post('/api/login', async function (req, res) {
  try {
    const email = cleanInput(req.body.email).toLowerCase();
    const password = req.body.password || '';

    if (!email || !password) {
      return sendJson(res, false, 'Email and password are required');
    }

    const user = await User.findOne({ email });
    if (!user) {
      return sendJson(res, false, 'User not found');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendJson(res, false, 'Incorrect password');
    }

    return sendJson(res, true, 'Login successful', {
      user_id: String(user._id),
      name: user.name,
      email: user.email
    });
  } catch (error) {
    return sendJson(res, false, 'Login failed: ' + error.message);
  }
});

app.get('/api/cars', async function (_req, res) {
  try {
    const activeBookings = await Booking.find({
      status: { $in: ['Pending', 'Approved', 'Paid'] }
    })
      .select('car_id')
      .lean();

    const unavailableIds = activeBookings.map(function (booking) {
      return booking.car_id;
    });

    const cars = await Car.find({
      status: 'Available',
      _id: { $nin: unavailableIds }
    })
      .sort({ _id: -1 })
      .lean();

    return sendJson(res, true, 'Cars fetched successfully', cars.map(mapCarDocument));
  } catch (error) {
    return sendJson(res, false, 'Failed to fetch cars: ' + error.message);
  }
});

app.post('/api/bookings', async function (req, res) {
  let reservedCar = null;

  try {
    const userId = cleanInput(req.body.user_id);
    const carId = cleanInput(req.body.car_id);
    const carName = cleanInput(req.body.car);
    const pickupDate = cleanInput(req.body.pickup_date);
    const returnDate = cleanInput(req.body.return_date);
    const totalAmount = Number(req.body.total_amount || 0);
    const status = cleanInput(req.body.status || 'Pending');

    if (!userId || !carId || !carName || !pickupDate || !returnDate || !totalAmount) {
      return sendJson(res, false, 'All booking fields are required');
    }

    if (!isValidObjectId(userId) || !isValidObjectId(carId)) {
      return sendJson(res, false, 'Invalid user or car id');
    }

    if (returnDate < pickupDate) {
      return sendJson(res, false, 'Return date must be after pickup date');
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return sendJson(res, false, 'User not found');
    }

    reservedCar = await Car.findOneAndUpdate(
      { _id: carId, status: 'Available' },
      { status: 'Booked' },
      { new: true }
    );

    if (!reservedCar) {
      return sendJson(res, false, 'Selected car is no longer available');
    }

    const existingActiveBooking = await Booking.findOne({
      car_id: carId,
      status: { $in: ['Pending', 'Approved', 'Paid'] }
    }).lean();

    if (existingActiveBooking) {
      await syncCarStatusById(carId);
      return sendJson(res, false, 'Selected car is no longer available');
    }

    const booking = await Booking.create({
      user_id: userId,
      car_id: carId,
      car: reservedCar.name || carName,
      pickup_date: pickupDate,
      return_date: returnDate,
      total_ammount: totalAmount,
      status
    });

    return sendJson(res, true, 'Booking successful', {
      booking_id: String(booking._id),
      car: booking.car,
      pickup_date: pickupDate,
      return_date: returnDate,
      total_amount: totalAmount
    });
  } catch (error) {
    if (reservedCar && reservedCar._id) {
      await syncCarStatusById(String(reservedCar._id));
    }
    return sendJson(res, false, 'Booking failed: ' + error.message);
  }
});

app.post('/api/payments', async function (req, res) {
  try {
    const bookingId = cleanInput(req.body.booking_id);
    const amount = Number(req.body.amount || 0);
    const paymentMethod = cleanInput(req.body.payment_method);
    const paymentStatus = cleanInput(req.body.payment_status || 'Paid');

    if (!bookingId || !amount || !paymentMethod) {
      return sendJson(res, false, 'All payment fields are required');
    }

    if (!isValidObjectId(bookingId)) {
      return sendJson(res, false, 'Invalid booking id');
    }

    const booking = await Booking.findById(bookingId).lean();
    if (!booking) {
      return sendJson(res, false, 'Booking not found');
    }

    const payment = await Payment.create({
      booking_id: bookingId,
      amount,
      payment_method: paymentMethod,
      payment_status: paymentStatus
    });

    return sendJson(res, true, 'Payment successful', {
      payment_id: String(payment._id),
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
    const statusFilter = scope === 'history'
      ? { $ne: 'Pending' }
      : 'Pending';

    const bookings = await Booking.find({ status: statusFilter })
      .populate('user_id', 'name email phone')
      .sort({ _id: -1 })
      .lean();

    const bookingIds = bookings.map(function (booking) {
      return booking._id;
    });

    const payments = await Payment.find({ booking_id: { $in: bookingIds } })
      .sort({ _id: -1 })
      .lean();

    const paymentByBookingId = new Map();
    payments.forEach(function (payment) {
      const key = String(payment.booking_id);
      if (!paymentByBookingId.has(key)) {
        paymentByBookingId.set(key, payment);
      }
    });

    return sendJson(
      res,
      true,
      'Admin bookings fetched successfully',
      bookings.map(function (booking) {
        return mapBookingDocument(booking, paymentByBookingId);
      })
    );
  } catch (error) {
    return sendJson(res, false, 'Failed to fetch bookings: ' + error.message);
  }
});

app.put('/api/admin/bookings/:id/status', async function (req, res) {
  try {
    const bookingId = cleanInput(req.params.id);
    const status = cleanInput(req.body.status);

    if (!bookingId || !['Approved', 'Rejected'].includes(status)) {
      return sendJson(res, false, 'Valid booking id and status are required');
    }

    if (!isValidObjectId(bookingId)) {
      return sendJson(res, false, 'Booking not found');
    }

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status },
      { new: true }
    ).lean();

    if (!booking) {
      return sendJson(res, false, 'Booking not found');
    }

    await syncCarStatusById(String(booking.car_id));

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
    const cars = await Car.find().sort({ _id: -1 }).lean();
    return sendJson(res, true, 'Admin cars fetched successfully', cars.map(mapCarDocument));
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

    const imagePath = req.file ? `uploads/${req.file.filename}` : 'images/ui.jpg';
    const car = await Car.create({
      name,
      brand,
      category,
      price_per_day: price,
      image: imagePath,
      rental_conditions: conditions,
      status
    });

    return sendJson(res, true, 'Car added successfully', {
      car_id: String(car._id),
      image: buildImageUrl(imagePath)
    });
  } catch (error) {
    return sendJson(res, false, 'Failed to add car: ' + error.message);
  }
});

app.put('/api/admin/cars/:id', upload.single('image'), async function (req, res) {
  try {
    const id = cleanInput(req.params.id);
    const name = cleanInput(req.body.name);
    const brand = cleanInput(req.body.brand);
    const category = cleanInput(req.body.category || 'General');
    const price = Number(req.body.price_per_day || 0);
    const conditions = cleanInput(req.body.rental_conditions);
    const status = cleanInput(req.body.status || 'Available');

    if (!id || !name || !brand || !price) {
      return sendJson(res, false, 'Car id, name, brand, and price are required');
    }

    if (!isValidObjectId(id)) {
      return sendJson(res, false, 'Car not found');
    }

    const existingCar = await Car.findById(id);
    if (!existingCar) {
      return sendJson(res, false, 'Car not found');
    }

    let imagePath = normalizeImagePath(existingCar.image);
    if (req.file) {
      imagePath = `uploads/${req.file.filename}`;
    }

    existingCar.name = name;
    existingCar.brand = brand;
    existingCar.category = category;
    existingCar.price_per_day = price;
    existingCar.image = imagePath;
    existingCar.rental_conditions = conditions;
    existingCar.status = status;
    await existingCar.save();

    return sendJson(res, true, 'Car updated successfully', {
      id,
      image: buildImageUrl(imagePath)
    });
  } catch (error) {
    return sendJson(res, false, 'Failed to update car: ' + error.message);
  }
});

app.put('/api/admin/cars/:id/release', async function (req, res) {
  try {
    const id = cleanInput(req.params.id);
    if (!id) {
      return sendJson(res, false, 'Car id is required');
    }

    if (!isValidObjectId(id)) {
      return sendJson(res, false, 'Car not found');
    }

    const car = await Car.findById(id);
    if (!car) {
      return sendJson(res, false, 'Car not found');
    }

    await Booking.updateMany(
      {
        car_id: id,
        status: { $in: ['Pending', 'Approved', 'Paid'] }
      },
      { status: 'Completed' }
    );

    car.status = 'Available';
    await car.save();

    return sendJson(res, true, 'Car released and made available again', {
      id,
      name: car.name,
      status: 'Available'
    });
  } catch (error) {
    return sendJson(res, false, 'Failed to release car: ' + error.message);
  }
});

app.delete('/api/admin/cars/:id', async function (req, res) {
  try {
    const id = cleanInput(req.params.id);
    if (!id) {
      return sendJson(res, false, 'Car id is required');
    }

    if (!isValidObjectId(id)) {
      return sendJson(res, false, 'Car not found');
    }

    await Car.findByIdAndDelete(id);
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

async function startServer() {
  app.listen(PORT, function () {
    console.log(`Car rental Node backend running on port ${PORT}`);
  });

  let hasSeededCars = false;

  async function connectToDatabase() {
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000
      });

      console.log('MongoDB connected successfully');

      if (!hasSeededCars) {
        await seedCarsIfEmpty();
        hasSeededCars = true;
      }
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error.message);
      console.error('Retrying MongoDB connection in 10 seconds...');
      setTimeout(connectToDatabase, 10000);
    }
  }

  mongoose.connection.on('disconnected', function () {
    console.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', function () {
    console.log('MongoDB reconnected');
  });

  await connectToDatabase();
}

startServer();
