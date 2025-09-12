import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from '@simplewebauthn/server';

const app = express();
const port = process.env.PORT || 3000;

// Mock data store (in-memory)
const mockUsers = new Map();
const mockCredentials = new Map();

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['https://localhost:5173'],
  credentials: true
}));

app.use(morgan('combined'));
app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'mock', timestamp: new Date().toISOString() });
});

// Mock WebAuthn registration
app.post('/api/rpc', async (req, res) => {
  const { method, params } = req.body;

  try {
    switch (method) {
      case 'auth.webauthn.register.begin':
        const registrationOptions = await generateRegistrationOptions({
          rpName: 'MANA Project',
          rpID: process.env.RP_ID || 'localhost',
          userID: crypto.randomBytes(32),
          userName: params.username || 'mock-user',
          userDisplayName: params.displayName || 'Mock User',
          timeout: 60000,
          attestationType: 'none',
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'preferred',
            residentKey: 'preferred'
          }
        });

        // Store challenge in mock store
        mockCredentials.set(registrationOptions.challenge, {
          challenge: registrationOptions.challenge,
          userID: registrationOptions.user.id,
          timestamp: Date.now()
        });

        res.json({ 
          success: true, 
          result: registrationOptions 
        });
        break;

      case 'auth.webauthn.register.complete':
        // Mock successful registration
        const mockUserID = crypto.randomUUID();
        mockUsers.set(mockUserID, {
          id: mockUserID,
          username: 'mock-user',
          displayName: 'Mock User',
          createdAt: new Date().toISOString()
        });

        const token = jwt.sign(
          { 
            userId: mockUserID, 
            username: 'mock-user',
            displayName: 'Mock User'
          },
          process.env.JWT_SECRET || 'dev-secret-mock',
          { expiresIn: process.env.JWT_TTL || '1h' }
        );

        res.json({
          success: true,
          result: {
            user: mockUsers.get(mockUserID),
            token
          }
        });
        break;

      case 'auth.webauthn.authenticate.begin':
        const authOptions = await generateAuthenticationOptions({
          rpID: process.env.RP_ID || 'localhost',
          timeout: 60000,
          userVerification: 'preferred'
        });

        // Store challenge
        mockCredentials.set(authOptions.challenge, {
          challenge: authOptions.challenge,
          timestamp: Date.now()
        });

        res.json({ 
          success: true, 
          result: authOptions 
        });
        break;

      case 'auth.webauthn.authenticate.complete':
        // Mock successful authentication
        const existingUserID = crypto.randomUUID();
        const existingUser = {
          id: existingUserID,
          username: 'returning-user',
          displayName: 'Returning User'
        };

        const authToken = jwt.sign(
          { 
            userId: existingUserID, 
            username: 'returning-user',
            displayName: 'Returning User'
          },
          process.env.JWT_SECRET || 'dev-secret-mock',
          { expiresIn: process.env.JWT_TTL || '1h' }
        );

        res.json({
          success: true,
          result: {
            user: existingUser,
            token: authToken
          }
        });
        break;

      case 'chat.create':
        res.json({
          success: true,
          result: {
            chatId: crypto.randomUUID(),
            title: 'Mock Chat Session',
            createdAt: new Date().toISOString()
          }
        });
        break;

      case 'chat.message.send':
        res.json({
          success: true,
          result: {
            messageId: crypto.randomUUID(),
            content: `Mock response to: ${params.message}`,
            timestamp: new Date().toISOString(),
            role: 'assistant'
          }
        });
        break;

      default:
        res.status(404).json({
          success: false,
          error: { code: 'METHOD_NOT_FOUND', message: `Method '${method}' not found in mock backend` }
        });
    }
  } catch (error) {
    console.error('Mock API error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Mock backend error' }
    });
  }
});

// Catch all other routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found in mock backend' }
  });
});

app.listen(port, () => {
  console.log('🚀 MANA Mock Auth-BFF listening on port', port);
  console.log('🌐 CORS origins:', process.env.CORS_ORIGINS || 'https://localhost:5173');
  console.log('🎭 Mode: MOCK (no database required)');
  console.log('✨ Environment: development');
});