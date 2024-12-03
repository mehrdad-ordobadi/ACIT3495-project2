const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.AUTH_PORT || 8000;

// Mock user database
const users = {
    user1: 'password1',
    user2: 'password2'
};

app.use(bodyParser.json());

// Basic health check (liveness probe)
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: Date.now()
    });
});

// Ready check (readiness probe)
app.get('/health/ready', async (req, res) => {
    try {
        // Here you would typically check your database connection
        // For now, we'll just do a basic check
        if (Object.keys(users).length > 0) {
            res.status(200).json({
                status: 'ready',
                timestamp: Date.now()
            });
        } else {
            throw new Error('User database not initialized');
        }
    } catch (error) {
        res.status(503).json({
            status: 'not ready',
            error: error.message,
            timestamp: Date.now()
        });
    }
});

// Service discovery endpoint
app.get('/service-info', (req, res) => {
    res.status(200).json({
        name: 'authentication-service',
        version: '1.0.0',
        description: 'Handles user authentication',
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
                path: '/validate',
                method: 'POST',
                description: 'Validates user credentials',
                requestBody: {
                    userid: 'string',
                    password: 'string'
                }
            }
        ],
        dependencies: {}  // No external dependencies for this service
    });
});

// Authentication endpoint
app.post('/validate', (req, res) => {
    const { userid, password } = req.body;

    if (!userid || !password) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['userid', 'password']
        });
    }

    if (users[userid] && users[userid] === password) {
        res.status(200).json({
            message: 'Authentication successful',
            userid,
            timestamp: Date.now()
        });
    } else {
        res.status(401).json({
            error: 'Invalid credentials',
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
    console.log(`Authentication service listening at http://localhost:${port}`);
});