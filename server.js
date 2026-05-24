const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Railway MySQL connection config
const dbConfig = {
  host: process.env.DB_HOST || 'zephyr.proxy.rlwy.net',
  port: parseInt(process.env.DB_PORT || 23832),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'nwEZDdWXuHQKzHxCSKWNqLQZladWwQla',
  database: process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0,
  decimalNumbers: true,
  multipleStatements: false,
  supportBigNumbers: true
};

let pool;

async function initializePool() {
  try {
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    console.log('✅ Successfully connected to Railway MySQL');
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to Railway MySQL:', error.message);
    process.exit(1);
  }
}

initializePool();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Rust Stats API running' });
});

// Get player stats
app.get('/api/stats', async (req, res) => {
  let connection;
  try {
    const { stat = 'PVPKills', search = '', limit = 10 } = req.query;
    const parsedLimit = limit === 'all' ? 999 : Math.min(parseInt(limit) || 10, 1000);
    
    connection = await pool.getConnection();
    
    let query = 'SELECT UserID, Name, PVPKills, Deaths, KDR, HeadShots, PVEKills, NPCKills, TimePlayed FROM playerranks';
    let params = [];
    
    if (search && search.length > 0) {
      query += ` WHERE Name LIKE ?`;
      params.push(`%${search}%`);
    }
    
    // Validate stat column to prevent SQL injection
    const validStats = ['PVPKills', 'Deaths', 'KDR', 'HeadShots', 'PVEKills', 'NPCKills', 'TimePlayed'];
    const safeStat = validStats.includes(stat) ? stat : 'PVPKills';
    
    query += ` ORDER BY ${safeStat} DESC LIMIT ?`;
    params.push(parsedLimit);
    
    const [rows] = await connection.execute(query, params);
    
    // Format data
    const data = rows.map(row => ({
      UserID: row.UserID,
      Name: row.Name || 'Unknown',
      PVPKills: parseInt(row.PVPKills) || 0,
      Deaths: parseInt(row.Deaths) || 0,
      KDR: parseFloat(row.KDR) || 0,
      HeadShots: parseInt(row.HeadShots) || 0,
      PVEKills: parseInt(row.PVEKills) || 0,
      NPCKills: parseInt(row.NPCKills) || 0,
      TimePlayed: parseInt(row.TimePlayed) || 0
    }));
    
    res.json({
      success: true,
      count: data.length,
      data: data
    });
  } catch (error) {
    console.error('Stats API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch stats'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Get top players
app.get('/api/top', async (req, res) => {
  let connection;
  try {
    const { stat = 'PVPKills', limit = 10 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 10, 1000);
    
    connection = await pool.getConnection();
    
    const validStats = ['PVPKills', 'Deaths', 'KDR', 'HeadShots', 'PVEKills', 'NPCKills', 'TimePlayed'];
    const safeStat = validStats.includes(stat) ? stat : 'PVPKills';
    
    const query = `SELECT UserID, Name, PVPKills, Deaths, KDR, HeadShots, PVEKills, NPCKills, TimePlayed 
                   FROM playerranks 
                   ORDER BY ${safeStat} DESC 
                   LIMIT ?`;
    
    const [rows] = await connection.execute(query, [parsedLimit]);
    
    const data = rows.map((row, idx) => ({
      rank: idx + 1,
      UserID: row.UserID,
      Name: row.Name || 'Unknown',
      PVPKills: parseInt(row.PVPKills) || 0,
      Deaths: parseInt(row.Deaths) || 0,
      KDR: parseFloat(row.KDR) || 0,
      HeadShots: parseInt(row.HeadShots) || 0,
      PVEKills: parseInt(row.PVEKills) || 0,
      NPCKills: parseInt(row.NPCKills) || 0,
      TimePlayed: parseInt(row.TimePlayed) || 0
    }));
    
    res.json({
      success: true,
      stat: stat,
      count: data.length,
      data: data
    });
  } catch (error) {
    console.error('Top API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch top players'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Get summary stats
app.get('/api/summary', async (req, res) => {
  let connection;
  try {
    const { stat = 'PVPKills' } = req.query;
    
    connection = await pool.getConnection();
    
    const validStats = ['PVPKills', 'Deaths', 'KDR', 'HeadShots', 'PVEKills', 'NPCKills', 'TimePlayed'];
    const safeStat = validStats.includes(stat) ? stat : 'PVPKills';
    
    const query = `SELECT 
                     COUNT(*) as total_players,
                     MAX(${safeStat}) as max_value,
                     AVG(${safeStat}) as avg_value,
                     MIN(${safeStat}) as min_value
                   FROM playerranks`;
    
    const [rows] = await connection.execute(query);
    
    const stats = rows[0];
    
    res.json({
      success: true,
      stat: stat,
      data: {
        totalPlayers: stats.total_players || 0,
        maxValue: Math.round(stats.max_value) || 0,
        avgValue: Math.round(stats.avg_value) || 0,
        minValue: Math.round(stats.min_value) || 0
      }
    });
  } catch (error) {
    console.error('Summary API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch summary'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Search player
app.get('/api/player/:name', async (req, res) => {
  let connection;
  try {
    const { name } = req.params;
    
    connection = await pool.getConnection();
    
    const query = `SELECT UserID, Name, PVPKills, Deaths, KDR, HeadShots, PVEKills, NPCKills, TimePlayed 
                   FROM playerranks 
                   WHERE Name LIKE ?
                   LIMIT 1`;
    
    const [rows] = await connection.execute(query, [`%${name}%`]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }
    
    const player = rows[0];
    
    res.json({
      success: true,
      data: {
        UserID: player.UserID,
        Name: player.Name,
        PVPKills: parseInt(player.PVPKills) || 0,
        Deaths: parseInt(player.Deaths) || 0,
        KDR: parseFloat(player.KDR) || 0,
        HeadShots: parseInt(player.HeadShots) || 0,
        PVEKills: parseInt(player.PVEKills) || 0,
        NPCKills: parseInt(player.NPCKills) || 0,
        TimePlayed: parseInt(player.TimePlayed) || 0
      }
    });
  } catch (error) {
    console.error('Player API error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch player'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Rust Stats API running on port ${PORT}`);
  console.log(`📊 Database: ${process.env.DB_NAME || 'railway'}`);
  console.log(`🔗 Available endpoints:`);
  console.log(`   - GET /health`);
  console.log(`   - GET /api/stats?stat=PVPKills&limit=10&search=playerName`);
  console.log(`   - GET /api/top?stat=PVPKills&limit=10`);
  console.log(`   - GET /api/summary?stat=PVPKills`);
  console.log(`   - GET /api/player/:name`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});
