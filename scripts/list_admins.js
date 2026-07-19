const db = require('../db');

(async () => {
  try {
    const [rows] = await db.query('SELECT id, full_name, email, password, created_at FROM admins');
    console.log('admins_count:', rows.length);
    rows.forEach(r => console.log(r));
    process.exit(0);
  } catch (err) {
    console.error('Error querying admins:', err);
    process.exit(1);
  }
})();
