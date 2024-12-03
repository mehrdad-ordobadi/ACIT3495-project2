const express = require('express');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.SHOW_RESULTS_PORT || 8002;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const mongoUri = process.env.MONGO_URI || 'mongodb://reader:readerpassword@mongodb:27017/analyticsdb';

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Check MongoDB connection
        const client = new MongoClient(mongoUri);
        await client.connect();
        await client.db('analyticsdb').command({ ping: 1 });
        await client.close();

        // Check Auth Service connection
        await axios.get(`http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}/health`);

        res.status(200).json({ status: 'healthy' });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({ status: 'unhealthy', error: error.message });
    }
});

app.post('/results', async (req, res) => {
    const { userid, password } = req.body;
    if (!userid || !password) {
        return res.status(400).json({ error: "Missing userid or password" });
    }

    try {
        const authResponse = await axios.post(`http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}/validate`, {
            userid,
            password
        });

        if (authResponse.status !== 200) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const client = new MongoClient(mongoUri);
        await client.connect();
        const db = client.db('analyticsdb');
        const collection = db.collection('analytics');

        const results = await collection.find({ userid }).toArray();
        await client.close();

        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "An error occurred" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Show Results service listening at http://localhost:${port}`);
});