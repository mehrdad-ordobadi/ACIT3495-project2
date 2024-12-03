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
    host: process.env.MYSQL_HOST || 'mysql',
    user: process.env.MYSQL_USER || 'writer',
    password: process.env.MYSQL_PASSWORD || 'writerpassword',
    database: process.env.MYSQL_DATABASE || 'datadb'
};

// Basic health check endpoint (liveness probe)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: Date.now()
    });
});

// Ready check endpoint (readiness probe)
app.get('/health/ready', async (req, res) => {
    try {
        // Check MySQL connection
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('SELECT 1');
        await connection.end();

        // Check Auth Service connection
        const authServiceUrl = `http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}/health`;
        await axios.get(authServiceUrl);

        res.status(200).json({
            status: 'ready',
            timestamp: Date.now(),
            checks: {
                mysql: 'connected',
                authService: 'connected'
            }
        });
    } catch (error) {
        console.error('Readiness check failed:', error);
        res.status(503).json({
            status: 'not ready',
            timestamp: Date.now(),
            error: error.message,
            checks: {
                mysql: error.code === 'ECONNREFUSED' ? 'failed' : 'unknown',
                authService: error.code === 'ECONNREFUSED' ? 'failed' : 'unknown'
            }
        });
    }
});

// Service discovery endpoint
app.get('/service-info', (req, res) => {
    res.status(200).json({
        name: 'enter-data-service',
        version: '1.0.0',
        description: 'Service for entering numerical data with authentication',
        endpoints: [
            {
                path: '/health',
                method: 'GET',
                description: 'Liveness probe'
            },
            {
                path: '/health/ready',
                method: 'GET',
                description: 'Readiness probe'
            },
            {
                path: '/enter-data',
                method: 'POST',
                description: 'Enter numerical data for a user',
                requestBody: {
                    userid: 'string',
                    password: 'string',
                    value: 'number'
                }
            }
        ],
        dependencies: {
            'authentication-service': `http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}`,
            'mysql': {
                host: dbConfig.host,
                database: dbConfig.database
            }
        },
        ui: {
            enabled: true,
            path: '/'
        }
    });
});

app.post('/enter-data', async (req, res) => {
    const { userid, password, value } = req.body;

    if (!userid || !password || value === undefined) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['userid', 'password', 'value']
        });
    }

    try {
        // Authenticate user
        const authResponse = await axios.post(
            `http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}/validate`,
            { userid, password }
        );
        
        if (authResponse.status !== 200) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Insert data into MySQL
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO data (userid, value) VALUES (?, ?)',
            [userid, value]
        );
        await connection.end();
        
        res.status(200).json({
            message: 'Data entered successfully',
            timestamp: Date.now(),
            data: {
                userid,
                value
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            error: 'An error occurred while processing your request',
            details: error.message,
            timestamp: Date.now()
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal server error',
        timestamp: Date.now()
    });
});

app.listen(port, () => {
    console.log(`Enter Data service listening at http://localhost:${port}`);
});