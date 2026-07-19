const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const DB_FILE = path.join(__dirname, 'charin_realtors.sqlite');
let dbPromise = null;

async function getDbConnection() {
    if (!dbPromise) {
        dbPromise = open({
            filename: DB_FILE,
            driver: sqlite3.Database
        });
    }
    return dbPromise;
}

async function closeDbConnection() {
    if (dbPromise) {
        const conn = await dbPromise;
        await conn.close();
        dbPromise = null;
    }
}

// Mocking the mysql2 connection pool interface so we don't have to rewrite everything in server.js right away,
// but for simplicity we will just export the connection promise.
module.exports = {
    DB_FILE,
    getConnection: async () => {
        const conn = await getDbConnection();
        // Return an object that mimics the basic methods used in server.js
        return {
            query: async (sql, params) => {
                const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
                if (isSelect) {
                    const rows = await conn.all(sql, params);
                    return [rows]; // mysql2 returns [rows, fields]
                } else {
                    const result = await conn.run(sql, params);
                    return [{ insertId: result.lastID }]; 
                }
            },
            beginTransaction: async () => {
                await conn.run('BEGIN TRANSACTION');
            },
            commit: async () => {
                await conn.run('COMMIT');
            },
            rollback: async () => {
                await conn.run('ROLLBACK');
            },
            release: () => {
                // SQLite doesn't need to release in the same way, we can just let it be or close it if needed.
                // For simplicity we do nothing.
            }
        };
    },
    query: async (sql, params) => {
        const conn = await getDbConnection();
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA');
        if (isSelect) {
            const rows = await conn.all(sql, params);
            return [rows];
        } else {
            const result = await conn.run(sql, params);
            return [{ insertId: result.lastID }];
        }
    },
    close: async () => {
        await closeDbConnection();
    }
};
