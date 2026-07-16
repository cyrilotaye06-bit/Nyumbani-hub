const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey123';

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
const upload = multer({ storage: storage });

// Database Initialization (Create Users table)
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

        // Ensure default admin exists and has the configured password (will insert or update)
        const defaultAdminEmail = 'cyrilotaye06@gmail.com';
        const defaultAdminPassword = 'rocca_bun6521';
        const [found] = await db.query('SELECT id FROM admins WHERE email = ?', [defaultAdminEmail]);
        const hashedDefault = await bcrypt.hash(defaultAdminPassword, 10);
        if (!found || found.length === 0) {
            await db.query('INSERT INTO admins (full_name, email, password) VALUES (?, ?, ?)', ['System Administrator', defaultAdminEmail, hashedDefault]);
        } else {
            // update password and ensure name
            await db.query('UPDATE admins SET password = ?, full_name = ? WHERE email = ?', [hashedDefault, 'System Administrator', defaultAdminEmail]);
        }

        // Seed Default Agent if none exists
        const [agents] = await db.query('SELECT COUNT(*) as count FROM agents');
        if (agents[0].count === 0) {
            await db.query("INSERT INTO agents (full_name, phone, email, bio) VALUES (?, ?, ?, ?)", 
            ['John Mwangi', '+254700000000', 'john@nyumbanihub.com', 'Senior Property Consultant']);
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
        const category = req.query.category;
        let query = `
            SELECT p.*, GROUP_CONCAT(pi.image_path) AS image_paths 
            FROM properties p 
            LEFT JOIN property_images pi ON p.id = pi.property_id
        `;
        let params = [];
        if (category) {
            query += ' WHERE p.category = ?';
            params.push(category);
        }
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
            SELECT p.*, GROUP_CONCAT(pi.image_path) AS image_paths 
            FROM properties p 
            LEFT JOIN property_images pi ON p.id = pi.property_id
            WHERE p.id = ?
            GROUP BY p.id
        `, [req.params.id]);
        
        if (rows.length === 0) return res.status(404).json({ error: 'Property not found' });
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

// Add a property (Admin Only)
app.post('/api/properties', authenticateAdmin, upload.array('images', 10), async (req, res) => {
    console.log('Received properties POST request', req.body);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { title, category, price, location, bedrooms, bathrooms, size, available, agent, phone, description } = req.body;
        
        // Convert empty string for price/bedrooms/bathrooms to null or 0 to avoid strict mode errors
        const safePrice = price || 0;
        const safeBedrooms = bedrooms || 0;
        const safeBathrooms = bathrooms || 0;
        const safeAvailable = available || null;

        const [result] = await conn.query(`
            INSERT INTO properties (title, category, price, location, bedrooms, bathrooms, property_size, availability_date, description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [title, category, safePrice, location, safeBedrooms, safeBathrooms, size, safeAvailable, description]);

        const propertyId = result.insertId;

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const imagePath = '/uploads/' + file.filename;
                await conn.query(`
                    INSERT INTO property_images (property_id, image_path) VALUES (?, ?)
                `, [propertyId, imagePath]);
            }
        }

        await conn.commit();
        res.status(201).json({ id: propertyId, message: 'Property added successfully' });
    } catch (error) {
        await conn.rollback();
        console.error('Error adding property:', error);
        res.status(500).json({ error: 'Failed to add property' });
    } finally {
        conn.release();
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
        const { full_name, phone, email, bio } = req.body;
        if (!full_name) return res.status(400).json({ error: 'Agent name is required' });
        
        let photoPath = null;
        if (req.file) {
            photoPath = '/uploads/' + req.file.filename;
        }
        
        const [result] = await db.query(
            'INSERT INTO agents (full_name, phone, email, bio, profile_photo) VALUES (?, ?, ?, ?, ?)',
            [full_name, phone || null, email || null, bio || null, photoPath]
        );
        
        res.status(201).json({ id: result.insertId, message: 'Agent added successfully' });
    } catch (error) {
        console.error('Error adding agent:', error);
        res.status(500).json({ error: 'Failed to add agent' });
    }
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

// --- AUTHENTICATION ROUTES ---

// Regular User Registration
app.post('/api/auth/user/register', async (req, res) => {
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
app.post('/api/auth/user/login', async (req, res) => {
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

app.post('/api/auth/admin/register', async (req, res) => {
    try {
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
app.post('/api/auth/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [admins] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
        if (admins.length === 0) return res.status(401).json({ error: 'Invalid admin credentials' });
        
        const admin = admins[0];
        
        // Admin passwords are stored hashed; require bcrypt comparison
        let validPassword = false;
        try { validPassword = await bcrypt.compare(password, admin.password); } catch (e) { console.error('Bcrypt compare error', e); }

        if (!validPassword) return res.status(401).json({ error: 'Invalid admin credentials' });
        
        const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin' }, process.env.JWT_SECRET || 'supersecretjwtkey123', { expiresIn: '24h' });
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