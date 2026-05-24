const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Railway MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'zephyr.proxy.rlwy.net',
  port: process.env.DB_PORT || 23832,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'nwEZDdXubHQk2HxCSKkNqLQZ1adkwQ1a',
  database: process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Rust Stats API running' });
});

// Get player stats
app.get('/api/stats', async (req, res) => {
  try {
    const { stat = 'PVPKills', search = '', limit = 10 } = req.query;
    const parsedLimit = limit === 'all' ? 999 : parseInt(limit) || 10;
    
    const connection = await pool.getConnection();
    
    let query = 'SELECT UserID, Name, PVPKills, Deaths, KDR, HeadShots, PVEKills, NPCKills, TimePlayed FROM playerranks';
    
    if (search && search.length > 0) {
      const searchSafe = search.replace(/[%_\\]/g, '\\$&');
      query += ` WHERE Name LIKE '%${searchSafe}%' ESCAPE '\\'`;
    }
    
    query += ` ORDER BY ${stat} DESC LIMIT ${parsedLimit}`;
    
    const [rows] = await connection.query(query);
    connection.release();
    
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
    console.error('Stats API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get top players
app.get('/api/top', async (req, res) => {
  try {
    const { stat = 'PVPKills', limit = 10 } = req.query;
    const parsedLimit = parseInt(limit) || 10;
    
    const connection = await pool.getConnection();
    
    const query = `SELECT UserID, Name, PVPKills, Deaths, KDR, HeadShots, PVEKills, NPCKills, TimePlayed 
                   FROM playerranks 
                   ORDER BY ${stat} DESC 
                   LIMIT ${parsedLimit}`;
    
    const [rows] = await connection.query(query);
    connection.release();
    
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
    console.error('Top API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get summary stats
app.get('/api/summary', async (req, res) => {
  try {
    const { stat = 'PVPKills' } = req.query;
    
    const connection = await pool.getConnection();
    
    const query = `SELECT 
                     COUNT(*) as total_players,
                     MAX(${stat}) as max_value,
                     AVG(${stat}) as avg_value,
                     MIN(${stat}) as min_value
                   FROM playerranks`;
    
    const [rows] = await connection.query(query);
    connection.release();
    
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
    console.error('Summary API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Search player
app.get('/api/player/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    const connection = await pool.getConnection();
    
    const query = `SELECT UserID, Name, PVPKills, Deaths, KDR, HeadShots, PVEKills, NPCKills, TimePlayed 
                   FROM playerranks 
                   WHERE Name LIKE ?
                   LIMIT 1`;
    
    const [rows] = await connection.query(query, [`%${name}%`]);
    connection.release();
    
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
    console.error('Player API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Rust Stats API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.DB_NAME || 'railway'}`);
});
