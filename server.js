const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
  host: process.env.DB_HOST || 'mysql.railway.internal',
  port: parseInt(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  decimalNumbers: true
};

const pool = mysql.createPool(dbConfig);

const validStats = ['PVPKills', 'Deaths', 'KDR', 'HeadShots', 'PVEKills', 'NPCKills', 'TimePlayed',
  'Suicides', 'SleepersKilled', 'StructuresBuilt', 'ResourcesGathered', 'BulletsFired', 'HeliKills', 'APCKills'];

const TABLE = process.env.TABLE_NAME || 'playerranksdb';

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Rust Stats API running' });
});

app.get('/api/tables', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [tables] = await connection.query('SHOW TABLES');
    res.json({ success: true, tables });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/columns/:table', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [cols] = await connection.query('SHOW COLUMNS FROM ??', [req.params.table]);
    res.json({ success: true, table: req.params.table, columns: cols });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/stats', async (req, res) => {
  let connection;
  try {
    const { stat = 'PVPKills', search = '', limit = 10 } = req.query;
    const parsedLimit = limit === 'all' ? 1000 : Math.min(Math.max(parseInt(limit) || 10, 1), 1000);
    const safeStat = validStats.includes(stat) ? stat : 'PVPKills';

    connection = await pool.getConnection();
    let query = `SELECT * FROM \`${TABLE}\``;
    let params = [];
    if (search && search.length > 0) {
      query += ' WHERE Name LIKE ?';
      params.push(`%${search}%`);
    }
    query += ` ORDER BY \`${safeStat}\` DESC LIMIT ${parsedLimit}`;

    const [rows] = await connection.query(query, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/summary', async (req, res) => {
  let connection;
  try {
    const { stat = 'PVPKills' } = req.query;
    const safeStat = validStats.includes(stat) ? stat : 'PVPKills';
    connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT COUNT(*) total_players, MAX(\`${safeStat}\`) max_value, AVG(\`${safeStat}\`) avg_value, MIN(\`${safeStat}\`) min_value FROM \`${TABLE}\``
    );
    const s = rows[0];
    res.json({
      success: true,
      stat,
      data: {
        totalPlayers: s.total_players || 0,
        maxValue: Math.round(s.max_value) || 0,
        avgValue: Math.round(s.avg_value) || 0,
        minValue: Math.round(s.min_value) || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Rust Stats API running on port ${PORT}, table: ${TABLE}`);
});
