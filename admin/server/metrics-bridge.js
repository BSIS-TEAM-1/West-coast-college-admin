const express = require('express');
const axios = require('axios');
require('dotenv').config({ path: '../.env.production' });

const app = express();

// Use environment variables for security
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID;

// Validate required environment variables
if (!RENDER_API_KEY || !RENDER_SERVICE_ID) {
    console.error('ERROR: RENDER_API_KEY and RENDER_SERVICE_ID must be set in environment variables');
    process.exit(1);
}

app.get('/api/server-stats', async (req, res) => {
    try {
        const response = await axios.get(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/metrics`, {
            headers: { 'Authorization': `Bearer ${RENDER_API_KEY}` }
        });
        
        // Send Render metrics to frontend
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching Render metrics:', error.response?.data || error.message);
        res.status(500).json({ 
            error: "Could not fetch metrics. Check if your plan supports API metrics.",
            details: error.response?.data || error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.METRICS_PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Metrics bridge running on port ${PORT}`);
    console.log(`📊 Server stats available at: http://localhost:${PORT}/api/server-stats`);
    console.log(`💚 Health check at: http://localhost:${PORT}/health`);
});
