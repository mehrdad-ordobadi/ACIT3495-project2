const express = require('express');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.SHOW_RESULTS_PORT || 8002;

app.use(express.json());
app.use(cors());

// Serve static files at both root and /results
app.use(express.static(path.join(__dirname, 'public')));
app.use('/results', express.static(path.join(__dirname, 'public')));

const mongoHost = process.env.MONGO_HOST || 'mongodb.default.svc.cluster.local';
const mongoUser = process.env.MONGO_USER_READER || 'reader';
const mongoPassword = process.env.MONGO_PASSWORD_READER || 'readerpassword';
const mongoDatabase = 'analyticsdb';
const mongoUri = `mongodb://${mongoUser}:${mongoPassword}@${mongoHost}:27017/${mongoDatabase}?authSource=${mongoDatabase}`;

// Serve index.html at both root and /results
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
        // Check MongoDB connection
        const client = new MongoClient(mongoUri);
        await client.connect();
        await client.db('analyticsdb').command({ ping: 1 });
        await client.close();

        // Check Auth Service connection
        const authServiceUrl = `http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}/health`;
        await axios.get(authServiceUrl);

        res.status(200).json({
            status: 'ready',
            timestamp: Date.now(),
            checks: {
                mongodb: 'connected',
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
                mongodb: error.code === 'ECONNREFUSED' ? 'failed' : 'unknown',
                authService: error.code === 'ECONNREFUSED' ? 'failed' : 'unknown'
            }
        });
    }
});

// Service discovery endpoint
app.get('/service-info', (req, res) => {
    res.status(200).json({
        name: 'show-results-service',
        version: '1.0.0',
        description: 'Service for retrieving and displaying analytics results',
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
                path: '/results',
                method: 'GET',
                description: 'Results frontend'
            },
            {
                path: '/results',
                method: 'POST',
                description: 'Get analytics results for a user',
                requestBody: {
                    userid: 'string',
                    password: 'string'
                }
            }
        ],
        dependencies: {
            'authentication-service': `http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}`,
            'mongodb': {
                uri: mongoUri.replace(/:[^:]*@/, ':****@')  // Hide password in URI
            }
        },
        ui: {
            enabled: true,
            path: '/'
        }
    });
});

app.post('/results', async (req, res) => {
    const { userid, password } = req.body;

    if (!userid || !password) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['userid', 'password']
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

        // Retrieve results from MongoDB
        console.log('Connecting to MongoDB with URI:', mongoUri.replace(/:[^:]*@/, ':****@'));
        const client = new MongoClient(mongoUri);
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db('analyticsdb');
        const collection = db.collection('analytics');

        // Log the query we're about to make
        console.log('Querying MongoDB for userid:', userid);
        
        // First, let's check what's in the collection
        const allDocs = await collection.find({}).toArray();
        console.log('All documents in collection:', allDocs);

        // Now perform our actual query
        const results = await collection.find({ userid: userid }).toArray();
        console.log('Query results:', results);

        await client.close();
        console.log('MongoDB connection closed');

        if (results.length === 0) {
            console.log('No results found for userid:', userid);
            return res.status(404).json({
                message: 'No results found for this user',
                timestamp: Date.now(),
                debug: {
                    totalDocuments: allDocs.length,
                    searchedUserId: userid
                }
            });
        }

        res.json({
            results,
            timestamp: Date.now()
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
    console.log(`Show Results service listening at http://localhost:${port}`);
});