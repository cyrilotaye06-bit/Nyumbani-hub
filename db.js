const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const DB_FILE = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'charin_realtors.sqlite');
let dbPromise = null;

async function getDbConnection() {
    if (!dbPromise) {
        fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
        dbPromise = open({ filename: DB_FILE, driver: sqlite3.Database })
            .then(async (conn) => {
                await conn.exec('PRAGMA foreign_keys = ON;');
                await conn.exec('PRAGMA journal_mode = WAL;');
                await conn.exec('PRAGMA synchronous = FULL;');
                await conn.exec('PRAGMA busy_timeout = 5000;');
                return conn;
            })
            .catch((error) => {
                dbPromise = null;
                throw error;
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

module.exports = {
    DB_FILE,
    getConnection: async () => {
        const conn = await getDbConnection();
        return {
            query: async (sql, params) => {
                const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
                if (isSelect) return [await conn.all(sql, params)];
                const result = await conn.run(sql, params);
                return [{ insertId: result.lastID }];
            },
            beginTransaction: async () => conn.run('BEGIN TRANSACTION'),
            commit: async () => conn.run('COMMIT'),
            rollback: async () => conn.run('ROLLBACK'),
            release: () => {}
        };
    },
    query: async (sql, params) => {
        const conn = await getDbConnection();
        const isSelect = /^(SELECT|PRAGMA)/i.test(sql.trim());
        if (isSelect) return [await conn.all(sql, params)];
        const result = await conn.run(sql, params);
        return [{ insertId: result.lastID }];
    },
    close: closeDbConnection
};
