const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.ENTER_DATA_PORT || 8001;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
    host: process.env.MYSQL_HOST || "mysql",
    user: process.env.MYSQL_USER || "writer",
    password: process.env.MYSQL_PASSWORD || "writerpassword",
    database: process.env.MYSQL_DATABASE || "datadb"
};

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Check MySQL connection
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('SELECT 1');
        await connection.end();

        // Check Auth Service connection
        await axios.get(`http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}/health`);

        res.status(200).json({ status: 'healthy' });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({ status: 'unhealthy', error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/enter-data', async (req, res) => {
    const { userid, password, value } = req.body;

    if (!userid || !password || !value) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const authResponse = await axios.post(`http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}/validate`, { userid, password });
        
        if (authResponse.status !== 200) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const connection = await mysql.createConnection(dbConfig);
        
        await connection.execute('INSERT INTO data (userid, value) VALUES (?, ?)', [userid, value]);
        
        await connection.end();
        
        res.status(200).json({ message: "Data entered successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "An error occurred" });
    }
});

app.listen(port, () => {
    console.log(`Enter Data service listening at http://localhost:${port}`);
});