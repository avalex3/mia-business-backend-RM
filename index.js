const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

const MIA_API_URL = process.env.MIA_API_URL || 'https://test-ipspi.victoriabank.md';
const MIA_USERNAME = process.env.MIA_USERNAME;
const MIA_PASSWORD = process.env.MIA_PASSWORD;
let accessToken = null;
let refreshToken = null;

// Funcție pentru obținerea sau reîmprospătarea token-ului JWT
async function getAccessToken() {
    if (!accessToken) {
        try {
            const response = await axios.post(`${MIA_API_URL}/api/identity/token`, 
                new URLSearchParams({
                    grant_type: 'password',
                    username: MIA_USERNAME,
                    password: MIA_PASSWORD
                }), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            accessToken = response.data.accessToken;
            refreshToken = response.data.refreshToken;
            setTimeout(() => { accessToken = null; }, response.data.expiresIn * 1000); // Expiră token-ul
            return accessToken;
        } catch (error) {
            console.error('Eroare autentificare:', error.response?.data || error.message);
            throw error;
        }
    }
    return accessToken;
}

// Middleware pentru a adăuga token-ul în cereri
app.use(async (req, res, next) => {
    try {
        req.headers['Authorization'] = `Bearer ${await getAccessToken()}`;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Autentificare esuata' });
    }
});

// Endpoint pentru generarea unui cod QR
app.post('/api/generate-qr', async (req, res) => {
    try {
        const { amount, currency, iban, dba, remittanceInfo } = req.body;
        const response = await axios.post(`${MIA_API_URL}/api/v1/qr`, {
            header: {
                qrType: 'DYNM',
                amountType: 'Fixed',
                pmtContext: 'e' // e-commerce
            },
            extension: {
                creditorAccount: { iban },
                amount: { sum: amount, currency },
                dba,
                remittanceInfo4Payer: remittanceInfo,
                ttl: { length: 30, units: 'mm' }
            }
        }, {
            headers: { Authorization: req.headers['Authorization'] }
        });
        res.json({
            qrHeaderUUID: response.data.qrHeaderUUID,
            qrAsText: response.data.qrAsText,
            qrAsImage: response.data.qrAsImage
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
});

// Endpoint pentru primirea callback-urilor (signals)
app.post('/api/signals', (req, res) => {
    const token = req.body; // JWT ca string
    try {
        // Verifică semnătura JWT cu cheia publică (srv-admin2016.cer)
        const decoded = jwt.verify(token, process.env.PUBLIC_KEY, { algorithms: ['RS256'] });
        const { signalCode, qrHeaderUUID, qrExtensionUUID, payment } = decoded;
        console.log('Signal primit:', { signalCode, qrHeaderUUID, qrExtensionUUID, payment });
        // Procesează semnalul (ex. actualizează statusul în baza de date)
        res.status(200).send();
    } catch (error) {
        res.status(400).json({ error: 'Invalid signal JWT' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));