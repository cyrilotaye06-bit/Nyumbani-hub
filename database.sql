-- =====================================
-- Nyumbani Hub DATABASE
-- =====================================

CREATE DATABASE charin_realtors;

USE charin_realtors;

-- =====================================
-- ADMIN USERS
-- =====================================

CREATE TABLE admins (

    id INT AUTO_INCREMENT PRIMARY KEY,

    full_name VARCHAR(100) NOT NULL,

    email VARCHAR(150) UNIQUE NOT NULL,

    password VARCHAR(255) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- =====================================
-- AGENTS
-- =====================================

CREATE TABLE agents (

    id INT AUTO_INCREMENT PRIMARY KEY,

    full_name VARCHAR(150) NOT NULL,

    phone VARCHAR(30),

    email VARCHAR(150),

    profile_photo VARCHAR(255),

    bio TEXT,

    job_title VARCHAR(150),

    specialties TEXT,

    whatsapp VARCHAR(30),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- =====================================
-- PROPERTY LISTINGS
-- =====================================

CREATE TABLE properties (

    id INT AUTO_INCREMENT PRIMARY KEY,

    property_serial VARCHAR(32) NOT NULL UNIQUE,

    title VARCHAR(255) NOT NULL,

    category ENUM(
        'Rental',
        'Sale',
        'BnB',
        'Resale'
    ) NOT NULL,

    price DECIMAL(15,2) NOT NULL,

    location VARCHAR(255),

    address TEXT,

    bedrooms INT DEFAULT 0,

    bathrooms INT DEFAULT 0,

    parking_spaces INT DEFAULT 0,

    property_size VARCHAR(100),

    furnished ENUM(
        'Yes',
        'No'
    ) DEFAULT 'No',

    availability_date DATE,

    description TEXT,

    featured BOOLEAN DEFAULT FALSE,

    status ENUM(
        'Available',
        'Booked',
        'Sold',
        'Rented'
    ) DEFAULT 'Available',

    agent_id INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (agent_id)
    REFERENCES agents(id)
    ON DELETE SET NULL

);

-- =====================================
-- PROPERTY IMAGES
-- =====================================

CREATE TABLE property_images (

    id INT AUTO_INCREMENT PRIMARY KEY,

    property_id INT NOT NULL,

    image_path VARCHAR(255) NOT NULL,

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id)
    REFERENCES properties(id)
    ON DELETE CASCADE

);

-- =====================================
-- BNB AVAILABILITY CALENDAR
-- =====================================

CREATE TABLE property_availability (

    id INT AUTO_INCREMENT PRIMARY KEY,

    property_id INT NOT NULL,

    available_date DATE NOT NULL,

    is_available BOOLEAN DEFAULT TRUE,

    FOREIGN KEY (property_id)
    REFERENCES properties(id)
    ON DELETE CASCADE

);

-- Listing performance and administrator-only document vault
CREATE TABLE property_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE TABLE property_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);
-- =====================================
-- USERS 
-- =====================================

CREATE TABLE users(

id INT AUTO_INCREMENT PRIMARY KEY,

full_name VARCHAR(150) NOT NULL,

email VARCHAR(150) UNIQUE NOT NULL,

phone VARCHAR(50),

password VARCHAR(255) NOT NULL,

created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- =====================================
-- CUSTOMER INQUIRIES
-- =====================================

CREATE TABLE inquiries (

    id INT AUTO_INCREMENT PRIMARY KEY,

    property_id INT,

    customer_name VARCHAR(150),

    customer_email VARCHAR(150),

    customer_phone VARCHAR(50),

    message TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id)
    REFERENCES properties(id)
    ON DELETE CASCADE

);

-- =====================================
-- SAVED PROPERTIES
-- =====================================

CREATE TABLE favorites (

    id INT AUTO_INCREMENT PRIMARY KEY,

    property_id INT,

    user_email VARCHAR(150),

    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id)
    REFERENCES properties(id)
    ON DELETE CASCADE

);

-- =====================================
-- SAMPLE ADMIN
-- password = admin123
-- hash should be replaced later
-- =====================================

INSERT INTO admins(

full_name,
email,
password

)

VALUES(

'System Administrator',

'admin@nyumbanihub.com',

'$2y$10$abcdefghijklmnopqrstuv'

);

-- =====================================
-- SAMPLE AGENT
-- =====================================

INSERT INTO agents(

full_name,
phone,
email,
bio

)

VALUES(

'John Mwangi',

'+254700000000',

'john@nyumbanihub.com',

'Senior Property Consultant'

);
