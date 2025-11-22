export default () => ({
  port: parseInt(process.env.PORT, 10) || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api',
  
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  },
  
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  
  aiService: {
    url: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  },
  
  hedera: {
    accountId: process.env.HEDERA_ACCOUNT_ID,
    privateKey: process.env.HEDERA_PRIVATE_KEY,
    topicId: process.env.HEDERA_TOPIC_ID,
    tokenId: process.env.HEDERA_TOKEN_ID,
    network: process.env.HEDERA_NETWORK || 'testnet',
  },
  
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
  },
  
  // Frontend URL for callbacks (extract first URL from CORS_ORIGIN)
  frontendUrl: process.env.FRONTEND_URL || 
    (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',')[0] : 'http://localhost:5173'),
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },
});
