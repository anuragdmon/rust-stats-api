const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql.railway.internal',
  port: parseInt(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  decimalNumbers: true
});

const RANKS_TABLE = process.env.TABLE_NAME || 'playerranksdb';
const KILLS_TABLE = process.env.KILLS_TABLE || 'KillRecords';

const rankStats = ['PVPKills','Deaths','KDR','HeadShots','PVEKills','NPCKills','TimePlayed',
  'Suicides','SleepersKilled','StructuresBuilt','ResourcesGathered','BulletsFired','HeliKills','APCKills'];

app.get('/health', (req,res)=> res.json({status:'ok',message:'Rust Stats API running'}));

app.get('/api/tables', async (req,res)=>{
  let c; try{ c=await pool.getConnection(); const [t]=await c.query('SHOW TABLES'); res.json({success:true,tables:t}); }
  catch(e){ res.status(500).json({success:false,error:e.message}); } finally{ if(c)c.release(); }
});

app.get('/api/columns/:table', async (req,res)=>{
  let c; try{ c=await pool.getConnection(); const [cols]=await c.query('SHOW COLUMNS FROM ??',[req.params.table]); res.json({success:true,table:req.params.table,columns:cols}); }
  catch(e){ res.status(500).json({success:false,error:e.message}); } finally{ if(c)c.release(); }
});

// PlayerRanks data
app.get('/api/stats', async (req,res)=>{
  let c;
  try{
    const { stat='PVPKills', search='', limit=10 } = req.query;
    const lim = limit==='all'?5000:Math.min(Math.max(parseInt(limit)||10,1),5000);
    const safe = rankStats.includes(stat)?stat:'PVPKills';
    c = await pool.getConnection();
    let q = `SELECT * FROM \`${RANKS_TABLE}\``; const p=[];
    if(search){ q+=' WHERE Name LIKE ?'; p.push(`%${search}%`); }
    q += ` ORDER BY \`${safe}\` DESC LIMIT ${lim}`;
    const [rows]=await c.query(q,p);
    res.json({success:true,count:rows.length,data:rows});
  }catch(e){ res.status(500).json({success:false,error:e.message}); } finally{ if(c)c.release(); }
});

// KillRecords data
app.get('/api/kills', async (req,res)=>{
  let c;
  try{
    const { search='', limit='all' } = req.query;
    const lim = limit==='all'?5000:Math.min(Math.max(parseInt(limit)||10,1),5000);
    c = await pool.getConnection();
    let q = `SELECT * FROM \`${KILLS_TABLE}\``; const p=[];
    if(search){ q+=' WHERE displayname LIKE ?'; p.push(`%${search}%`); }
    q += ` LIMIT ${lim}`;
    const [rows]=await c.query(q,p);
    res.json({success:true,count:rows.length,data:rows});
  }catch(e){ res.status(500).json({success:false,error:e.message}); } finally{ if(c)c.release(); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`API on ${PORT}, ranks=${RANKS_TABLE}, kills=${KILLS_TABLE}`));