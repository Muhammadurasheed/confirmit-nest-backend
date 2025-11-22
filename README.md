# ConfirmIT Backend API Gateway (NestJS)

**AI-powered, blockchain-anchored trust verification for African commerce**

This is the main API gateway for ConfirmIT, built with NestJS. It handles authentication, business logic orchestration, database operations, and blockchain integration.

## 🏗️ Architecture

- **Framework:** NestJS v10 (Node.js 20 LTS)
- **Language:** TypeScript
- **Database:** Firebase Firestore
- **Storage:** Cloudinary
- **Blockchain:** Hedera Hashgraph (HCS + HTS)
- **Real-time:** WebSocket (Socket.IO)
- **API Documentation:** Swagger/OpenAPI

## 📁 Project Structure

```
backend/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── config/                 # Configuration files
│   ├── common/                 # Shared utilities
│   │   ├── guards/             # Auth guards
│   │   ├── filters/            # Exception filters
│   │   └── interceptors/       # Logging interceptors
│   └── modules/                # Feature modules
│       ├── receipts/           # Receipt verification
│       ├── accounts/           # Account checking
│       ├── business/           # Business directory
│       └── hedera/             # Blockchain integration
├── test/                       # E2E tests
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20 LTS or higher
- npm or yarn
- Firebase project with service account credentials
- Cloudinary account
- Hedera testnet account
- Redis (optional, for rate limiting)

### Installation

1. **Install dependencies:**

```bash
cd backend
npm install
```

2. **Set up environment variables:**

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:
- Firebase service account key (download from Firebase Console)
- Cloudinary credentials (from Cloudinary dashboard)
- Hedera account ID and private key (from Hedera portal)
- AI Service URL (FastAPI service URL)

3. **Run the development server:**

```bash
npm run start:dev
```

The API will be available at `http://localhost:8080`

4. **View API documentation:**

Open `http://localhost:8080/api/docs` to see Swagger UI

## 📡 API Endpoints

### Receipts
- `POST /api/receipts/scan` - Upload and analyze receipt
- `GET /api/receipts/:id` - Get receipt details
- `GET /api/receipts/user/:userId` - User's receipt history
- `WS /ws/receipts/:receiptId` - Real-time analysis updates

### Accounts
- `POST /api/accounts/check` - Check account trustworthiness
- `GET /api/accounts/:id` - Get account details

### Business
- `POST /api/business/register` - Register new business
- `GET /api/business/:id` - Get business profile
- `POST /api/business/api-keys/generate` - Generate API key
- `GET /api/business/stats/:id` - Get business analytics

### Hedera
- `POST /api/hedera/anchor` - Anchor data to Hedera HCS
- `GET /api/hedera/verify/:txId` - Verify blockchain anchor

## 🔒 Authentication

The API uses Firebase Authentication. Include the Firebase ID token in requests:

```bash
Authorization: Bearer <firebase_id_token>
```

To make endpoints public (no auth required), add `@Public()` decorator in controllers.

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 🐳 Docker Deployment

```bash
# Build image
docker build -t confirmit-backend .

# Run container
docker run -p 8080:8080 --env-file .env confirmit-backend
```

## 🚀 Production Deployment (Google Cloud Run)

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT_ID/confirmit-backend
gcloud run deploy confirmit-backend \
  --image gcr.io/PROJECT_ID/confirmit-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "$(cat .env | xargs)"
```

## 📊 Monitoring

- Logs: Winston logger with structured logging
- Errors: Sentry integration for error tracking
- Metrics: Built-in NestJS metrics

## 🔧 Development Tips

### Hot Reload
The dev server automatically reloads on file changes.

### Debug Mode
```bash
npm run start:debug
```

Then attach debugger to port 9229.

### Generate New Module
```bash
nest generate module modules/feature-name
nest generate controller modules/feature-name
nest generate service modules/feature-name
```

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Write tests
4. Submit PR

## 📄 License

MIT License - see LICENSE file

---

**Built with ❤️ for Hedera Africa Hackathon 2025**
