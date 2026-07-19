const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production.');
}

// Small, dependency-free guard for public write endpoints. It is intentionally
// conservative so normal visitors are not blocked, while repeated automated
// submissions receive a clear response.
const requestBuckets = new Map();
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20 } = {}) {
    return (req, res, next) => {
        const key = `${req.ip}:${req.path}`;
        const now = Date.now();
        const bucket = requestBuckets.get(key) || { count: 0, resetAt: now + windowMs };
        if (now > bucket.resetAt) {
            bucket.count = 0;
            bucket.resetAt = now + windowMs;
        }
        bucket.count += 1;
        requestBuckets.set(key, bucket);
        if (bucket.count > max) {
            return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
        }
        next();
    };
}

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, code) {
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!host || !user || !pass) {
        console.log(`[EMAIL VERIFICATION] To: ${email} Code: ${code}`);
        return { success: true, fallback: true };
    }

    const port = Number(process.env.EMAIL_PORT || 587);
    const secure = process.env.EMAIL_SECURE !== undefined
        ? process.env.EMAIL_SECURE === 'true'
        : port === 465;

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: true,
        auth: {
            user,
            pass
        }
    });

    try {
        await transporter.verify();
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'Nyumbani Hub <no-reply@nyumbanihub.com>',
            to: email,
            subject: 'Verify your Nyumbani Hub account',
            html: `<p>Your verification code is <strong>${code}</strong>.</p><p>Enter it on the registration page to activate your account.</p>`
        });
        return { success: true, fallback: false };
    } catch (error) {
        console.error('Verification email failed:', error);
        return { success: false, fallback: true, error: error.message };
    }
}

async function sendInquiryReplyEmail(toEmail, customerName, replyMessage, replyUrl) {
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!host || !user || !pass) {
        console.log(`[INQUIRY REPLY] To: ${toEmail} Message: ${replyMessage}${replyUrl ? ` Reply link: ${replyUrl}` : ''}`);
        return { success: true, fallback: true };
    }

    const port = Number(process.env.EMAIL_PORT || 587);
    const secure = process.env.EMAIL_SECURE !== undefined
        ? process.env.EMAIL_SECURE === 'true'
        : port === 465;

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: true,
        auth: {
            user,
            pass
        }
    });

    try {
        await transporter.verify();
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'Nyumbani Hub <no-reply@nyumbanihub.com>',
            to: toEmail,
            subject: 'Reply to your Nyumbani Hub inquiry',
            html: `<p>Hello ${customerName || 'there'},</p><p>${replyMessage.replace(/\n/g, '<br>')}</p>${replyUrl ? `<p><a href="${replyUrl}" style="display:inline-block;background:#0b1c39;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">Reply to Nyumbani Hub</a></p><p>You can use this secure link to send your response directly to the agent handling your inquiry.</p>` : ''}<p>Best regards,<br>Nyumbani Hub Team</p>`
        });
        return { success: true, fallback: false };
    } catch (error) {
        console.error('Inquiry reply email failed:', error);
        return { success: false, fallback: true, error: error.message };
    }
}



function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}


function buildPropertySerial(propertyId, createdAt = new Date()) {
    const year = new Date(createdAt).getFullYear();
    return `NYH-${year}-${String(propertyId).padStart(6, '0')}`;
}

async function sendPropertyAssignmentEmail(agent, property) {
    const host = process.env.EMAIL_HOST, user = process.env.EMAIL_USER, pass = process.env.EMAIL_PASS;
    if (!agent.email) return { success: false, skipped: true, reason: 'Agent has no email address.' };
    if (!host || !user || !pass) { console.log('[PROPERTY ASSIGNMENT] To: ' + agent.email + ' Property: ' + property.title); return { success: true, fallback: true }; }
    const port = Number(process.env.EMAIL_PORT || 587);
    const secure = process.env.EMAIL_SECURE !== undefined ? process.env.EMAIL_SECURE === 'true' : port === 465;
    const baseUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const propertyUrl = baseUrl ? baseUrl + '/property-details.html?id=' + property.id : '';
    try {
        const transporter = nodemailer.createTransport({ host, port, secure, requireTLS: true, auth: { user, pass } });
        await transporter.verify();
        await transporter.sendMail({ from: process.env.EMAIL_FROM || 'Nyumbani Hub <no-reply@nyumbanihub.com>', to: agent.email, subject: 'New property assignment: ' + property.title, html: '<p>Hello ' + escapeHtml(agent.full_name || 'there') + ',</p><p>You have been assigned to <strong>' + escapeHtml(property.title) + '</strong>.</p><p><strong>Property serial:</strong> ' + escapeHtml(property.property_serial || 'Pending') + '<br><strong>Location:</strong> ' + escapeHtml(property.location || 'Not specified') + '<br><strong>Category:</strong> ' + escapeHtml(property.category || 'Not specified') + '<br><strong>Price:</strong> KES ' + escapeHtml(property.price) + '</p>' + (propertyUrl ? '<p><a href="' + escapeHtml(propertyUrl) + '">View property details</a></p>' : '') + '<p>Nyumbani Hub</p>' });
        return { success: true, fallback: false };
    } catch (error) { console.error('Property assignment email failed:', error); return { success: false, error: error.message }; }
}


async function sendViewingBookingEmail(agent, property, booking) {
    const host = process.env.EMAIL_HOST, user = process.env.EMAIL_USER, pass = process.env.EMAIL_PASS;
    if (!agent.email) return { success: false, skipped: true, reason: 'The assigned agent has no email address.' };
    if (!host || !user || !pass) {
        console.log('[VIEWING BOOKING] Agent: ' + agent.email + ' Property: ' + property.title + ' Date: ' + booking.viewing_date + ' ' + booking.viewing_time);
        return { success: true, fallback: true };
    }

    const port = Number(process.env.EMAIL_PORT || 587);
    const secure = process.env.EMAIL_SECURE !== undefined ? process.env.EMAIL_SECURE === 'true' : port === 465;
    const baseUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const propertyUrl = baseUrl ? baseUrl + '/property-details.html?id=' + property.id : '';

    try {
        const transporter = nodemailer.createTransport({ host, port, secure, requireTLS: true, auth: { user, pass } });
        await transporter.verify();
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'Nyumbani Hub <no-reply@nyumbanihub.com>',
            to: agent.email,
            subject: 'New viewing request: ' + property.title,
            html: '<p>Hello ' + escapeHtml(agent.full_name || 'there') + ',</p><p>A client has requested a viewing for <strong>' + escapeHtml(property.title) + '</strong>.</p><p><strong>Property serial:</strong> ' + escapeHtml(property.property_serial || 'Not available') + '<br><strong>Location:</strong> ' + escapeHtml(property.location || 'Not specified') + '</p><p><strong>Viewing date:</strong> ' + escapeHtml(booking.viewing_date) + '<br><strong>Viewing time:</strong> ' + escapeHtml(booking.viewing_time) + '</p><p><strong>Client:</strong> ' + escapeHtml(booking.customer_name) + '<br><strong>Email:</strong> ' + escapeHtml(booking.customer_email) + '<br><strong>Phone:</strong> ' + escapeHtml(booking.customer_phone || 'Not provided') + '</p>' + (booking.notes ? '<p><strong>Client notes:</strong><br>' + escapeHtml(booking.notes).replace(/\r?\n/g, '<br>') + '</p>' : '') + (propertyUrl ? '<p><a href="' + escapeHtml(propertyUrl) + '">View property details</a></p>' : '') + '<p>Please follow up with the client to confirm the appointment.</p><p>Nyumbani Hub</p>'
        });
        return { success: true, fallback: false };
    } catch (error) {
        console.error('Viewing booking email failed:', error);
        return { success: false, error: error.message };
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from root directory (for HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    // Preserve the original upload so listing galleries can display true HD photos.
    // A practical cap still protects the server from accidental oversized uploads.
    limits: { fileSize: 15 * 1024 * 1024, files: 25 },
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
        cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed.'));
    }
});

const vaultDir = path.join(__dirname, 'vault');
if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir);
const documentUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, vaultDir),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: (req, file, cb) => {
        if (/^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword)$/.test(file.mimetype)) return cb(null, true);
        cb(new Error('Only PDF and Word documents are allowed.'));
    }
});

// Database Initialization (Create Users table)
async function seedDefaultProperties() {
    try {
        const [propertyCount] = await db.query('SELECT COUNT(*) as count FROM properties');
        if (propertyCount[0].count > 0) return;

        const sampleProperties = [
            {
                title: 'Luxury Apartment in Westlands',
                category: 'Rental',
                price: 250000,
                location: 'Westlands, Nairobi',
                address: 'Westlands, Nairobi',
                bedrooms: 3,
                bathrooms: 2,
                parking_spaces: 2,
                property_size: '1800 sq ft',
                furnished: 'Yes',
                availability_date: '2026-08-01',
                description: 'Modern apartment with skyline views, secure parking, and easy access to business hubs.',
                featured: 1,
                status: 'Available',
                agent_id: 1
            },
            {
                title: 'Spacious Villa in Runda',
                category: 'Sale',
                price: 8500000,
                location: 'Runda, Nairobi',
                address: 'Runda, Nairobi',
                bedrooms: 5,
                bathrooms: 4,
                parking_spaces: 3,
                property_size: '4200 sq ft',
                furnished: 'Yes',
                availability_date: '2026-09-15',
                description: 'A premium villa with a private garden, large lounge, and high-end finishes.',
                featured: 1,
                status: 'Available',
                agent_id: 1
            },
            {
                title: 'Cozy BnB in Kilimani',
                category: 'BnB',
                price: 6500,
                location: 'Kilimani, Nairobi',
                address: 'Kilimani, Nairobi',
                bedrooms: 2,
                bathrooms: 2,
                parking_spaces: 1,
                property_size: '1200 sq ft',
                furnished: 'Yes',
                availability_date: '2026-07-20',
                description: 'Comfortable short-stay home ideal for travelers and business visitors.',
                featured: 1,
                status: 'Available',
                agent_id: 1
            }
        ];

        for (const property of sampleProperties) {
            await db.query(`
                INSERT INTO properties (
                    title, category, price, location, address, bedrooms, bathrooms,
                    parking_spaces, property_size, furnished, availability_date,
                    description, featured, status, agent_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                property.title,
                property.category,
                property.price,
                property.location,
                property.address,
                property.bedrooms,
                property.bathrooms,
                property.parking_spaces,
                property.property_size,
                property.furnished,
                property.availability_date,
                property.description,
                property.featured,
                property.status,
                property.agent_id
            ]);
        }

        console.log('Seeded default properties for the homepage search.');
    } catch (error) {
        console.error('Error seeding default properties:', error);
    }
}

async function initDB() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                profile_photo TEXT,
                bio TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS properties (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_serial TEXT UNIQUE,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                price DECIMAL(15,2) NOT NULL,
                location TEXT,
                address TEXT,
                bedrooms INTEGER DEFAULT 0,
                bathrooms INTEGER DEFAULT 0,
                parking_spaces INTEGER DEFAULT 0,
                property_size TEXT,
                furnished TEXT DEFAULT 'No',
                availability_date DATE,
                description TEXT,
                featured BOOLEAN DEFAULT 0,
                status TEXT DEFAULT 'Available',
                agent_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS property_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL,
                image_path TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS property_availability (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL,
                available_date DATE NOT NULL,
                is_available BOOLEAN DEFAULT 1,
                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                password TEXT NOT NULL,
                is_verified INTEGER DEFAULT 0,
                verification_code TEXT,
                verification_expires_at TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try {
            const [cols] = await db.query('PRAGMA table_info(users)');
            const hasPhone = cols.some(col => col.name === 'phone');
            const hasVerified = cols.some(col => col.name === 'is_verified');
            const hasCode = cols.some(col => col.name === 'verification_code');
            const hasExpiry = cols.some(col => col.name === 'verification_expires_at');
            if (!hasPhone) await db.query('ALTER TABLE users ADD COLUMN phone TEXT');
            if (!hasVerified) await db.query('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0');
            if (!hasCode) await db.query('ALTER TABLE users ADD COLUMN verification_code TEXT');
            if (!hasExpiry) await db.query('ALTER TABLE users ADD COLUMN verification_expires_at TEXT');
        } catch (err) {
            console.warn('Unable to verify users verification columns:', err);
        }
        await db.query(`
            CREATE TABLE IF NOT EXISTS inquiries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER,
                customer_name TEXT,
                customer_email TEXT,
                customer_phone TEXT,
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS inquiry_conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                inquiry_id INTEGER NOT NULL,
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER,
                user_email TEXT,
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS site_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS viewing_bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                customer_phone TEXT,
                viewing_date TEXT NOT NULL,
                viewing_time TEXT NOT NULL,
                notes TEXT,
                status TEXT DEFAULT 'Requested',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS saved_searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                filters TEXT NOT NULL,
                alerts_enabled INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS property_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL,
                viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS property_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER NOT NULL,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
            )
        `);

        // SQLite databases created by earlier versions are upgraded in place.
        const ensureColumn = async (table, column, definition) => {
            const [columns] = await db.query(`PRAGMA table_info(${table})`);
            if (!columns.some(item => item.name === column)) {
                await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
            }
        };
        await ensureColumn('properties', 'property_type', 'TEXT');
        await ensureColumn('properties', 'amenities', 'TEXT');
        await ensureColumn('properties', 'video_url', 'TEXT');
        await ensureColumn('properties', 'floor_plan_url', 'TEXT');
        await ensureColumn('properties', 'verified', 'INTEGER DEFAULT 0');
        await ensureColumn('properties', 'expires_at', 'TEXT');
        await ensureColumn('properties', 'published_at', 'TEXT');
        await ensureColumn('properties', 'property_serial', 'TEXT');
        await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_property_serial ON properties(property_serial)');
        await ensureColumn('inquiries', 'status', "TEXT DEFAULT 'New'");
        await ensureColumn('inquiries', 'assigned_agent_id', 'INTEGER');
        await ensureColumn('inquiries', 'admin_notes', 'TEXT');
        await ensureColumn('inquiries', 'client_reply_token', 'TEXT');
        await ensureColumn('inquiries', 'last_client_reply_at', 'TEXT');
        await ensureColumn('agents', 'job_title', 'TEXT');
        await ensureColumn('agents', 'specialties', 'TEXT');
        await ensureColumn('agents', 'whatsapp', 'TEXT');

        // Bootstrap only when explicitly configured. Existing administrators are never overwritten.
        if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
            const [found] = await db.query('SELECT id FROM admins WHERE email = ?', [process.env.ADMIN_EMAIL]);
            if (!found || found.length === 0) {
                const password = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
                await db.query('INSERT INTO admins (full_name, email, password) VALUES (?, ?, ?)', [process.env.ADMIN_NAME || 'System Administrator', process.env.ADMIN_EMAIL, password]);
            }
        }

        // Seed Default Agent if none exists
        const [agents] = await db.query('SELECT COUNT(*) as count FROM agents');
        if (agents[0].count === 0) {
            await db.query("INSERT INTO agents (full_name, phone, email, bio) VALUES (?, ?, ?, ?)", 
            ['John Mwangi', '+254700000000', 'john@nyumbanihub.com', 'Senior Property Consultant']);
        }

        await seedDefaultProperties();
        const [propertiesWithoutSerials] = await db.query("SELECT id, created_at FROM properties WHERE property_serial IS NULL OR property_serial = ''");
        for (const property of propertiesWithoutSerials) {
            await db.query('UPDATE properties SET property_serial = ? WHERE id = ?', [buildPropertySerial(property.id, property.created_at), property.id]);
        }

        // Seed Default Site Settings if empty
        const [settings] = await db.query('SELECT COUNT(*) as count FROM site_settings');
        if (settings[0].count === 0) {
            await db.query(`INSERT INTO site_settings (setting_key, setting_value) VALUES 
                ('hero_title', 'Find Your Dream Property'),
                ('hero_subtitle', 'Rent, Buy, Resell & Book Luxury Apartments and Homes'),
                ('about_title', 'Who We Are'),
                ('about_text', 'At Nyumbani Hub, we believe that finding the perfect property should be a seamless and enjoyable experience. Founded with a vision to redefine real estate in the region, we bring decades of combined local expertise to help you navigate the housing market.\\n\\nWhether you''re a first-time homebuyer, a seasoned investor, or someone looking for a luxurious weekend getaway in our BnBs, our dedicated team is committed to delivering excellence, transparency, and outstanding service every step of the way.'),
                ('contact_email', 'info@nyumbanihub.com'),
                ('contact_phone', '+254 700 000 000'),
                ('contact_address', 'Westlands CBD, Nairobi')
            `);
        }

        console.log('Database tables verified and seeded.');
    } catch (err) {
        console.error('Error initializing DB:', err);
    }
}
initDB();

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token.' });
        }
        req.user = user;
        next();
    });
};

const authenticateAdmin = (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required.' });
        }
        next();
    });
};

// API Endpoints

// Get Site Settings
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM site_settings');
        const settings = {};
        rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update Site Settings (Admin Only)
app.put('/api/settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            await db.query('UPDATE site_settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
        }
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Get all properties
app.get('/api/properties', async (req, res) => {
    try {
        const { category, q, location, min_price, max_price, bedrooms, furnished, property_type, featured } = req.query;
        let query = `
            SELECT p.*, a.full_name AS agent_name, a.phone AS agent_phone, a.email AS agent_email,
                   GROUP_CONCAT(pi.image_path ORDER BY pi.id) AS image_paths
            FROM properties p 
            LEFT JOIN property_images pi ON p.id = pi.property_id
            LEFT JOIN agents a ON p.agent_id = a.id
        `;
        let params = [];
        const conditions = [];
        if (category) { conditions.push('p.category = ?'); params.push(category); }
        if (q) { conditions.push('(p.title LIKE ? OR p.location LIKE ? OR p.description LIKE ? OR p.amenities LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
        if (location) { conditions.push('p.location LIKE ?'); params.push(`%${location}%`); }
        if (min_price) { conditions.push('p.price >= ?'); params.push(Number(min_price)); }
        if (max_price) { conditions.push('p.price <= ?'); params.push(Number(max_price)); }
        if (bedrooms) { conditions.push(req.query.bedrooms === '4+' ? 'p.bedrooms >= 4' : 'p.bedrooms >= ?'); if (req.query.bedrooms !== '4+') params.push(Number(bedrooms)); }
        if (furnished) { conditions.push('p.furnished = ?'); params.push(furnished); }
        if (property_type) { conditions.push('p.property_type = ?'); params.push(property_type); }
        if (featured === 'true') conditions.push('p.featured = 1');
        conditions.push("p.status = 'Available'");
        conditions.push("(p.expires_at IS NULL OR p.expires_at = '' OR date(p.expires_at) >= date('now'))");
        query += ` WHERE ${conditions.join(' AND ')}`;
        query += ' GROUP BY p.id ORDER BY p.created_at DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching properties:', error);
        res.status(500).json({ error: 'Failed to fetch properties' });
    }
});

// Get single property
app.get('/api/properties/:id', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT p.*, a.full_name AS agent_name, a.phone AS agent_phone, a.email AS agent_email,
                   GROUP_CONCAT(pi.image_path ORDER BY pi.id) AS image_paths
            FROM properties p 
            LEFT JOIN property_images pi ON p.id = pi.property_id
            LEFT JOIN agents a ON p.agent_id = a.id
            WHERE p.id = ?
            GROUP BY p.id
        `, [req.params.id]);
        
        if (rows.length === 0) return res.status(404).json({ error: 'Property not found' });
        await db.query('INSERT INTO property_views (property_id) VALUES (?)', [req.params.id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching property:', error);
        res.status(500).json({ error: 'Failed to fetch property' });
    }
});

// Get agents
app.get('/api/agents', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM agents ORDER BY full_name ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
});


app.get('/api/admin/property-register', authenticateAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT p.id, p.property_serial, p.title, p.category, p.price, p.location, p.status, p.created_at, a.full_name AS agent_name FROM properties p LEFT JOIN agents a ON a.id = p.agent_id ORDER BY p.created_at DESC, p.id DESC`);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching property register:', error);
        res.status(500).json({ error: 'Failed to fetch property register.' });
    }
});

// Public BnB availability calendar. Missing dates are available by default.
app.get('/api/properties/:id/availability', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT available_date, is_available FROM property_availability WHERE property_id = ? ORDER BY available_date', [req.params.id]);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch availability.' }); }
});

app.put('/api/properties/:id/availability', authenticateAdmin, async (req, res) => {
    try {
        const { dates } = req.body;
        if (!Array.isArray(dates) || dates.some(item => !/^\d{4}-\d{2}-\d{2}$/.test(item.date || ''))) {
            return res.status(400).json({ error: 'Provide availability dates as YYYY-MM-DD.' });
        }
        await db.query('DELETE FROM property_availability WHERE property_id = ?', [req.params.id]);
        for (const item of dates) await db.query('INSERT INTO property_availability (property_id, available_date, is_available) VALUES (?, ?, ?)', [req.params.id, item.date, item.is_available ? 1 : 0]);
        res.json({ message: 'Availability updated.' });
    } catch (error) { res.status(500).json({ error: 'Failed to update availability.' }); }
});

// Get inquiries (Admin Only)
app.get('/api/inquiries', authenticateAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT i.*, p.title AS property_title, a.full_name AS assigned_agent_name
            FROM inquiries i
            LEFT JOIN properties p ON i.property_id = p.id
            LEFT JOIN agents a ON i.assigned_agent_id = a.id
            ORDER BY i.created_at DESC
        `);

        const inquiriesWithHistory = await Promise.all(rows.map(async (inquiry) => {
            const [historyRows] = await db.query(`
                SELECT sender, message, created_at
                FROM inquiry_conversations
                WHERE inquiry_id = ?
                ORDER BY created_at ASC
            `, [inquiry.id]);
            return { ...inquiry, history: historyRows };
        }));

        res.json(inquiriesWithHistory);
    } catch (error) {
        console.error('Error fetching inquiries:', error);
        res.status(500).json({ error: 'Failed to fetch inquiries' });
    }
});

// Submit inquiry
app.post('/api/inquiries', rateLimit({ max: 12 }), async (req, res) => {
    try {
        const { property_id, customer_name, customer_email, customer_phone, message } = req.body;
        if (!customer_name || !customer_email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required.' });
        }

        const result = await db.query(`
            INSERT INTO inquiries (property_id, customer_name, customer_email, customer_phone, message)
            VALUES (?, ?, ?, ?, ?)
        `, [property_id || null, customer_name, customer_email, customer_phone || '', message]);

        const inquiryId = result[0].insertId;
        await db.query(`
            INSERT INTO inquiry_conversations (inquiry_id, sender, message)
            VALUES (?, ?, ?)
        `, [inquiryId, 'customer', message]);

        res.status(201).json({ message: 'Inquiry submitted successfully.' });
    } catch (error) {
        console.error('Error submitting inquiry:', error);
        res.status(500).json({ error: 'Failed to submit inquiry' });
    }
});

// Move an inquiry through the sales pipeline and optionally assign an agent.
app.patch('/api/inquiries/:id', authenticateAdmin, async (req, res) => {
    try {
        const { status, assigned_agent_id, admin_notes } = req.body;
        const allowed = ['New', 'Contacted', 'Viewing', 'Closed', 'Archived'];
        if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid inquiry status.' });
        await db.query(`UPDATE inquiries SET
            status = COALESCE(?, status),
            assigned_agent_id = ?,
            admin_notes = COALESCE(?, admin_notes)
            WHERE id = ?`, [status || null, assigned_agent_id || null, admin_notes || null, req.params.id]);
        res.json({ message: 'Inquiry updated successfully.' });
    } catch (error) {
        console.error('Error updating inquiry:', error);
        res.status(500).json({ error: 'Failed to update inquiry' });
    }
});

app.get('/api/viewings', authenticateAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT v.*, p.title AS property_title
            FROM viewing_bookings v JOIN properties p ON p.id = v.property_id
            ORDER BY v.viewing_date ASC, v.viewing_time ASC`);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch viewing bookings.' });
    }
});

app.post('/api/viewings', rateLimit({ max: 10 }), async (req, res) => {
    try {
        const { property_id, customer_name, customer_email, customer_phone, viewing_date, viewing_time, notes } = req.body;
        if (!property_id || !customer_name || !customer_email || !viewing_date || !viewing_time) {
            return res.status(400).json({ error: 'Property, name, email, date, and time are required.' });
        }
        const selected = new Date(`${viewing_date}T${viewing_time}`);
        if (Number.isNaN(selected.valueOf()) || selected < new Date()) return res.status(400).json({ error: 'Please choose a future viewing time.' });

        const [properties] = await db.query(`SELECT p.id, p.title, p.property_serial, p.location, a.full_name, a.email
            FROM properties p LEFT JOIN agents a ON a.id = p.agent_id WHERE p.id = ?`, [property_id]);
        if (!properties.length) return res.status(404).json({ error: 'Property not found.' });
        const property = properties[0];

        const [conflicts] = await db.query(`SELECT id FROM viewing_bookings
            WHERE property_id = ? AND viewing_date = ? AND viewing_time = ? AND status != 'Cancelled'`, [property_id, viewing_date, viewing_time]);
        if (conflicts.length) return res.status(409).json({ error: 'That viewing time has just been booked. Please select another.' });

        const [result] = await db.query(`INSERT INTO viewing_bookings
            (property_id, customer_name, customer_email, customer_phone, viewing_date, viewing_time, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [property_id, customer_name, customer_email, customer_phone || '', viewing_date, viewing_time, notes || '']);

        const notification = await sendViewingBookingEmail(
            { full_name: property.full_name, email: property.email },
            property,
            { customer_name, customer_email, customer_phone, viewing_date, viewing_time, notes }
        );
        res.status(201).json({
            id: result.insertId,
            message: 'Viewing request submitted. We will confirm shortly.',
            ...(notification.success ? {} : { warning: notification.reason || 'The assigned agent could not be notified by email.' })
        });
    } catch (error) {
        console.error('Error creating viewing:', error);
        res.status(500).json({ error: 'Failed to request viewing.' });
    }
});

app.patch('/api/viewings/:id', authenticateAdmin, async (req, res) => {
    const allowed = ['Requested', 'Confirmed', 'Completed', 'Cancelled'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid viewing status.' });
    await db.query('UPDATE viewing_bookings SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    res.json({ message: 'Viewing status updated.' });
});

app.get('/api/dashboard', authenticateAdmin, async (req, res) => {
    try {
        const [[propertyTotal]] = await db.query('SELECT COUNT(*) AS count FROM properties');
        const [[inquiryTotal]] = await db.query('SELECT COUNT(*) AS count FROM inquiries');
        const [[viewingTotal]] = await db.query("SELECT COUNT(*) AS count FROM viewing_bookings WHERE status IN ('Requested', 'Confirmed')");
        const [pipeline] = await db.query('SELECT status, COUNT(*) AS count FROM inquiries GROUP BY status');
        res.json({ properties: propertyTotal.count, inquiries: inquiryTotal.count, open_viewings: viewingTotal.count, pipeline });
    } catch (error) { res.status(500).json({ error: 'Failed to fetch dashboard metrics.' }); }
});

app.get('/api/analytics/listings', authenticateAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT p.id, p.title, p.category,
            COUNT(DISTINCT pv.id) AS views, COUNT(DISTINCT f.id) AS saves,
            COUNT(DISTINCT i.id) AS inquiries
            FROM properties p
            LEFT JOIN property_views pv ON pv.property_id = p.id
            LEFT JOIN favorites f ON f.property_id = p.id
            LEFT JOIN inquiries i ON i.property_id = p.id
            GROUP BY p.id ORDER BY inquiries DESC, saves DESC, views DESC`);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch listing analytics.' }); }
});

// Delete inquiry (Admin Only)
app.delete('/api/inquiries/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM inquiries WHERE id = ?', [req.params.id]);
        res.json({ message: 'Inquiry deleted successfully.' });
    } catch (error) {
        console.error('Error deleting inquiry:', error);
        res.status(500).json({ error: 'Failed to delete inquiry' });
    }
});

// Send reply to inquiry sender (Admin Only)
app.post('/api/inquiries/:id/reply', authenticateAdmin, async (req, res) => {
    try {
        const { replyMessage } = req.body;
        const inquiryId = req.params.id;
        if (!replyMessage || !replyMessage.trim()) {
            return res.status(400).json({ error: 'Reply message is required.' });
        }

        const [inquiries] = await db.query('SELECT customer_email, customer_name FROM inquiries WHERE id = ?', [inquiryId]);
        if (!inquiries.length) {
            return res.status(404).json({ error: 'Inquiry not found.' });
        }

        const inquiry = inquiries[0];
        const replyToken = crypto.randomBytes(32).toString('hex');
        await db.query('UPDATE inquiries SET client_reply_token = ? WHERE id = ?', [replyToken, inquiryId]);
        const publicBaseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
        const replyUrl = `${publicBaseUrl}/client-reply.html?token=${replyToken}`;
        const emailResult = await sendInquiryReplyEmail(inquiry.customer_email, inquiry.customer_name, replyMessage, replyUrl);
        if (!emailResult.success) {
            return res.status(500).json({ error: 'Failed to send email reply.' });
        }

        await db.query(`
            INSERT INTO inquiry_conversations (inquiry_id, sender, message)
            VALUES (?, ?, ?)
        `, [Number(inquiryId), 'admin', replyMessage]);

        const [historyRows] = await db.query(`
            SELECT sender, message, created_at
            FROM inquiry_conversations
            WHERE inquiry_id = ?
            ORDER BY created_at ASC
        `, [Number(inquiryId)]);

        res.json({ message: 'Reply sent successfully.', history: historyRows });
    } catch (error) {
        console.error('Error sending inquiry reply:', error);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

// The client reply page validates its opaque, per-inquiry token before showing any details.
app.get('/api/client-replies/:token', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT i.id, i.customer_name, p.title AS property_title
            FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id
            WHERE i.client_reply_token = ?`, [req.params.token]);
        if (!rows.length) return res.status(404).json({ error: 'This reply link is invalid or has expired.' });
        res.json(rows[0]);
    } catch (error) { res.status(500).json({ error: 'Unable to open this reply link.' }); }
});

app.post('/api/client-replies/:token', rateLimit({ max: 8 }), async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) return res.status(400).json({ error: 'Please write a reply before sending.' });
        const [rows] = await db.query('SELECT id FROM inquiries WHERE client_reply_token = ?', [req.params.token]);
        if (!rows.length) return res.status(404).json({ error: 'This reply link is invalid or has expired.' });
        const inquiryId = rows[0].id;
        await db.query('INSERT INTO inquiry_conversations (inquiry_id, sender, message) VALUES (?, ?, ?)', [inquiryId, 'customer', message.trim()]);
        await db.query("UPDATE inquiries SET status = CASE WHEN status = 'Archived' THEN 'New' ELSE status END, last_client_reply_at = CURRENT_TIMESTAMP WHERE id = ?", [inquiryId]);
        res.status(201).json({ message: 'Your reply has been sent to the Nyumbani Hub team.' });
    } catch (error) {
        console.error('Error recording client reply:', error);
        res.status(500).json({ error: 'Unable to send your reply.' });
    }
});

// Add a property (Admin Only)
app.post('/api/properties', authenticateAdmin, upload.array('images', 25), async (req, res) => {
    console.log('Received properties POST request', req.body);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { title, category, price, location, address, bedrooms, bathrooms, parking_spaces, size, available,
            property_size, furnished, agent, agent_id, description, property_type, amenities, video_url,
            floor_plan_url, featured, verified, expires_at } = req.body;
        
        // Convert empty string for price/bedrooms/bathrooms to null or 0 to avoid strict mode errors
        const safePrice = price || 0;
        const safeBedrooms = bedrooms || 0;
        const safeBathrooms = bathrooms || 0;
        const safeAvailable = available || req.body.availability_date || null;

        const [result] = await conn.query(`
            INSERT INTO properties (
                title, category, price, location, address, bedrooms, bathrooms, parking_spaces, property_size,
                availability_date, furnished, description, agent_id, property_type, amenities, video_url,
                floor_plan_url, featured, verified, expires_at, published_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [title, category, safePrice, location, address || null, safeBedrooms, safeBathrooms,
            parking_spaces || 0, property_size || size || null, safeAvailable, furnished || 'No', description || '',
            agent_id || agent || null, property_type || null, amenities || '', video_url || null, floor_plan_url || null,
            featured === 'true' || featured === '1' ? 1 : 0, verified === 'true' || verified === '1' ? 1 : 0, expires_at || null]);

        const propertyId = result.insertId;
        const propertySerial = buildPropertySerial(propertyId);
        await conn.query('UPDATE properties SET property_serial = ? WHERE id = ?', [propertySerial, propertyId]);

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const imagePath = '/uploads/' + file.filename;
                await conn.query(`
                    INSERT INTO property_images (property_id, image_path) VALUES (?, ?)
                `, [propertyId, imagePath]);
            }
        }

        await conn.commit();
        let notification;
        if (agent_id || agent) {
            const [agents] = await conn.query('SELECT id, full_name, email FROM agents WHERE id = ?', [agent_id || agent]);
            if (agents.length) notification = await sendPropertyAssignmentEmail(agents[0], { id: propertyId, property_serial: propertySerial, title, location, category, price: safePrice });
        }
        res.status(201).json({ id: propertyId, property_serial: propertySerial, message: 'Property added successfully' });
    } catch (error) {
        await conn.rollback();
        console.error('Error adding property:', error);
        res.status(500).json({ error: 'Failed to add property' });
    } finally {
        conn.release();
    }
});

app.patch('/api/properties/:id', authenticateAdmin, async (req, res) => {
    try {
        const editable = ['title', 'price', 'location', 'address', 'bedrooms', 'bathrooms', 'parking_spaces', 'property_size',
            'furnished', 'availability_date', 'description', 'agent_id', 'property_type', 'amenities', 'video_url',
            'floor_plan_url', 'featured', 'verified', 'status', 'expires_at'];
        const entries = Object.entries(req.body).filter(([key]) => editable.includes(key));
        if (!entries.length) return res.status(400).json({ error: 'No editable property fields supplied.' });
        const agentAssignment = entries.find(([key]) => key === 'agent_id');
        let existingProperty;
        if (agentAssignment) {
            const [properties] = await db.query('SELECT id, property_serial, title, location, category, price, agent_id FROM properties WHERE id = ?', [req.params.id]);
            if (!properties.length) return res.status(404).json({ error: 'Property not found.' });
            existingProperty = properties[0];
        }
                const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
        await db.query(`UPDATE properties SET ${assignments} WHERE id = ?`, [...entries.map(([, value]) => value), req.params.id]);
        let notification;
        const newAgentId = agentAssignment && agentAssignment[1] ? Number(agentAssignment[1]) : null;
        if (newAgentId && newAgentId !== Number(existingProperty.agent_id)) {
            const [agents] = await db.query('SELECT id, full_name, email FROM agents WHERE id = ?', [newAgentId]);
            if (agents.length) notification = await sendPropertyAssignmentEmail(agents[0], existingProperty);
        }
        res.json({ message: 'Property updated successfully.' });
    } catch (error) {
        console.error('Error updating property:', error);
        res.status(500).json({ error: 'Failed to update property.' });
    }
});

// Delete a property (Admin Only)
app.delete('/api/properties/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get image path to delete file
        const [images] = await db.query('SELECT image_path FROM property_images WHERE property_id = ?', [id]);
        
        // Delete property (cascades to property_images due to foreign key)
        await db.query('DELETE FROM properties WHERE id = ?', [id]);

        // Delete associated image files
        for (const image of images) {
            if (image.image_path) {
                const filePath = path.join(__dirname, image.image_path);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        }

        res.json({ message: 'Property deleted successfully' });
    } catch (error) {
        console.error('Error deleting property:', error);
        res.status(500).json({ error: 'Failed to delete property' });
    }
});

// Add an agent (Admin Only)
app.post('/api/agents', authenticateAdmin, upload.single('photo'), async (req, res) => {
    try {
        const { full_name, phone, email, bio, job_title, specialties, whatsapp } = req.body;
        if (!full_name) return res.status(400).json({ error: 'Agent name is required' });
        
        let photoPath = null;
        if (req.file) {
            photoPath = '/uploads/' + req.file.filename;
        }
        
        const [result] = await db.query(
            'INSERT INTO agents (full_name, phone, email, bio, profile_photo, job_title, specialties, whatsapp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [full_name, phone || null, email || null, bio || null, photoPath, job_title || null, specialties || null, whatsapp || null]
        );
        
        res.status(201).json({ id: result.insertId, message: 'Agent added successfully' });
    } catch (error) {
        console.error('Error adding agent:', error);
        res.status(500).json({ error: 'Failed to add agent' });
    }
});

app.patch('/api/agents/:id', authenticateAdmin, upload.single('photo'), async (req, res) => {
    try {
        const { full_name, phone, email, bio, job_title, specialties, whatsapp } = req.body;
        if (!full_name) return res.status(400).json({ error: 'Agent name is required.' });
        const values = [full_name, phone || null, email || null, bio || null, job_title || null, specialties || null, whatsapp || null];
        let query = 'UPDATE agents SET full_name = ?, phone = ?, email = ?, bio = ?, job_title = ?, specialties = ?, whatsapp = ?';
        if (req.file) { query += ', profile_photo = ?'; values.push('/uploads/' + req.file.filename); }
        values.push(req.params.id);
        await db.query(query + ' WHERE id = ?', values);
        res.json({ message: 'Agent updated successfully.' });
    } catch (error) { res.status(500).json({ error: 'Failed to update agent.' }); }
});

// Delete an agent (Admin Only)
app.delete('/api/agents/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM agents WHERE id = ?', [id]);
        res.json({ message: 'Agent deleted successfully' });
    } catch (error) {
        console.error('Error deleting agent:', error);
        res.status(500).json({ error: 'Failed to delete agent' });
    }
});

app.get('/api/documents', authenticateAdmin, async (req, res) => {
    const [rows] = await db.query(`SELECT d.*, p.title AS property_title FROM property_documents d JOIN properties p ON p.id = d.property_id ORDER BY d.uploaded_at DESC`);
    res.json(rows);
});

app.post('/api/documents', authenticateAdmin, documentUpload.single('document'), async (req, res) => {
    try {
        if (!req.file || !req.body.property_id) return res.status(400).json({ error: 'Choose a property and document.' });
        const [result] = await db.query('INSERT INTO property_documents (property_id, file_name, file_path) VALUES (?, ?, ?)', [req.body.property_id, req.file.originalname, req.file.filename]);
        res.status(201).json({ id: result.insertId, message: 'Document added to the secure vault.' });
    } catch (error) { res.status(500).json({ error: 'Failed to upload document.' }); }
});

app.delete('/api/documents/:id', authenticateAdmin, async (req, res) => {
    const [rows] = await db.query('SELECT file_path FROM property_documents WHERE id = ?', [req.params.id]);
    await db.query('DELETE FROM property_documents WHERE id = ?', [req.params.id]);
    if (rows[0]?.file_path) { const filePath = path.join(vaultDir, rows[0].file_path); if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }
    res.json({ message: 'Document removed.' });
});

app.get('/api/documents/:id/download', authenticateAdmin, async (req, res) => {
    const [rows] = await db.query('SELECT file_name, file_path FROM property_documents WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    res.download(path.join(vaultDir, rows[0].file_path), rows[0].file_name);
});

// Account-backed favorites replace local-only saved items when a user is signed in.
app.get('/api/favorites', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT p.*, GROUP_CONCAT(pi.image_path ORDER BY pi.id) AS image_paths
            FROM favorites f JOIN properties p ON p.id = f.property_id
            LEFT JOIN property_images pi ON pi.property_id = p.id
            WHERE f.user_email = ? GROUP BY p.id ORDER BY f.saved_at DESC`, [req.user.email]);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch favorites.' }); }
});

app.post('/api/favorites/:propertyId', authenticateToken, async (req, res) => {
    try {
        const [existing] = await db.query('SELECT id FROM favorites WHERE property_id = ? AND user_email = ?', [req.params.propertyId, req.user.email]);
        if (!existing.length) await db.query('INSERT INTO favorites (property_id, user_email) VALUES (?, ?)', [req.params.propertyId, req.user.email]);
        res.status(201).json({ message: 'Property saved.' });
    } catch (error) { res.status(500).json({ error: 'Failed to save property.' }); }
});

app.delete('/api/favorites/:propertyId', authenticateToken, async (req, res) => {
    await db.query('DELETE FROM favorites WHERE property_id = ? AND user_email = ?', [req.params.propertyId, req.user.email]);
    res.json({ message: 'Property removed from favorites.' });
});

app.get('/api/saved-searches', authenticateToken, async (req, res) => {
    const [rows] = await db.query('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(rows.map(row => ({ ...row, filters: JSON.parse(row.filters) })));
});

app.post('/api/saved-searches', authenticateToken, async (req, res) => {
    const { name, filters, alerts_enabled = true } = req.body;
    if (!name || !filters || typeof filters !== 'object') return res.status(400).json({ error: 'A name and search filters are required.' });
    const [result] = await db.query('INSERT INTO saved_searches (user_id, name, filters, alerts_enabled) VALUES (?, ?, ?, ?)', [req.user.id, name, JSON.stringify(filters), alerts_enabled ? 1 : 0]);
    res.status(201).json({ id: result.insertId, message: 'Search saved. Alerts are ready for email delivery when notifications are configured.' });
});

app.delete('/api/saved-searches/:id', authenticateToken, async (req, res) => {
    await db.query('DELETE FROM saved_searches WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Saved search removed.' });
});

// --- AUTHENTICATION ROUTES ---

// Regular User Registration
app.post('/api/auth/user/register', rateLimit({ max: 8 }), async (req, res) => {
    try {
        const { full_name, email, password, phone } = req.body;
        if (!full_name || !email || !password) return res.status(400).json({ error: 'All fields are required' });
        
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email already in use' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const [result] = await db.query(
            'INSERT INTO users (full_name, email, phone, password, is_verified, verification_code, verification_expires_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
            [full_name, email, phone || null, hashedPassword, verificationCode, expiresAt]
        );
        const userId = result.insertId;

        const mailResult = await sendVerificationEmail(email, verificationCode);
        res.status(201).json({
            message: 'Verification code sent. Please verify your email to activate your account.',
            requiresVerification: true,
            email,
            user: { id: userId, full_name, email, phone: phone || null },
            ...(mailResult.fallback ? { verificationCode } : {})
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// Regular User Login
app.post('/api/auth/user/login', rateLimit({ max: 10 }), async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.is_verified !== 1 && user.is_verified !== '1') {
            return res.status(401).json({ error: 'Please verify your email before logging in.' });
        }
        
        const token = jwt.sign({ id: user.id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.post('/api/auth/user/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = users[0];
        if (user.is_verified === 1 || user.is_verified === '1') {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        const verificationCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await db.query('UPDATE users SET verification_code = ?, verification_expires_at = ? WHERE id = ?', [verificationCode, expiresAt, user.id]);

        const mailResult = await sendVerificationEmail(email, verificationCode);
        res.json({
            message: 'Verification code resent.',
            ...(mailResult.fallback ? { verificationCode } : {})
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error while resending verification code' });
    }
});

app.post('/api/auth/user/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Email and verification code are required' });

        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = users[0];
        if (user.is_verified === 1 || user.is_verified === '1') {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        if (!user.verification_code || user.verification_code !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        const expiresAt = user.verification_expires_at ? new Date(user.verification_expires_at) : new Date(0);
        if (expiresAt < new Date()) {
            return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
        }

        await db.query('UPDATE users SET is_verified = 1, verification_code = NULL, verification_expires_at = NULL WHERE id = ?', [user.id]);
        const token = jwt.sign({ id: user.id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error while verifying email' });
    }
});

app.post('/api/auth/admin/register', rateLimit({ max: 4 }), async (req, res) => {
    try {
        if (!process.env.ADMIN_REGISTRATION_KEY || req.headers['x-admin-registration-key'] !== process.env.ADMIN_REGISTRATION_KEY) {
            return res.status(403).json({ error: 'Administrator self-registration is disabled.' });
        }
        const { full_name, email, password } = req.body;
        if (!full_name || !email || !password) return res.status(400).json({ error: 'All fields are required' });
        
        // Check if admin exists
        const [existing] = await db.query('SELECT id FROM admins WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email already in use' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO admins (full_name, email, password) VALUES (?, ?, ?)', [full_name, email, hashedPassword]);
        
        res.status(201).json({ message: 'Admin registered successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during admin registration' });
    }
});

// Admin Login
app.post('/api/auth/admin/login', rateLimit({ max: 10 }), async (req, res) => {
    try {
        const { email, password } = req.body;
        const [admins] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
        if (admins.length === 0) return res.status(401).json({ error: 'Invalid admin credentials' });
        
        const admin = admins[0];
        
        // Admin passwords are stored hashed; require bcrypt comparison
        let validPassword = false;
        try { validPassword = await bcrypt.compare(password, admin.password); } catch (e) { console.error('Bcrypt compare error', e); }

        if (!validPassword) return res.status(401).json({ error: 'Invalid admin credentials' });
        
        const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: admin.id, full_name: admin.full_name, email: admin.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during admin login' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

app.use((err, req, res, next) => { console.error('GLOBAL ERROR:', err); res.status(500).json({ error: 'Internal Server Error' }); });
