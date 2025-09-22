# Wishing Well API - Dozyr Remote Job Marketplace

A comprehensive Node.js API server for the Dozyr remote job marketplace, connecting talented freelancers with managers and companies worldwide.

## 🚀 Features

- **Multi-role Authentication**: Support for talent, managers, and admin users
- **Job Management**: Complete CRUD operations for job postings
- **Proposal System**: Talent can submit proposals, managers can accept/reject
- **Real-time Messaging**: Communication between talents and managers
- **Advanced Search**: Filter jobs and talents by skills, budget, location, etc.
- **Admin Dashboard**: Complete platform management and analytics
- **Skills Management**: Comprehensive skill categorization system
- **Rate Limiting**: API protection against abuse
- **Security**: JWT authentication, input validation, NoSQL injection protection

## 🛠 Technology Stack

- **Runtime**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: Helmet, CORS, bcryptjs, express-rate-limit
- **Validation**: express-validator
- **Environment**: dotenv for configuration

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (v5.0 or higher) or MongoDB Atlas
- npm or yarn package manager

## ⚙️ Installation

1. **Clone and setup**:
   ```bash
   cd wish-well
   npm install
   ```

2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   ```
   NODE_ENV=development
   PORT=3000

   # MongoDB Configuration
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dozyr_db?retryWrites=true&w=majority&appName=Dozyr
   MONGO_USER=username
   MONGO_PASSWORD=password
   MONGO_DB_NAME=dozyr_db

   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
   JWT_EXPIRES_IN=7d

   # Admin Configuration
   ADMIN_EMAIL=admin@dozyr.com
   ADMIN_PASSWORD=admin123_change_this
   ```

3. **Database Setup**:
   Set up MongoDB Atlas or local MongoDB instance:
   - For MongoDB Atlas: Create cluster and get connection string
   - For local MongoDB: Install MongoDB Community Server

4. **Initialize Database**:
   ```bash
   node utils/seedDatabase.js
   ```
   This will:
   - Create all required tables
   - Create an admin user
   - Seed the database with default skills

5. **Start the Server**:
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 📚 API Documentation

Visit `http://localhost:3000/api/v1/docs` when the server is running for complete API documentation.

### Key Endpoints

#### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/profile` - Get current user profile

#### Jobs
- `GET /api/v1/jobs/search` - Search jobs
- `POST /api/v1/jobs` - Create job (managers only)
- `GET /api/v1/jobs/:id` - Get job details

#### Proposals
- `POST /api/v1/proposals/jobs/:job_id/proposals` - Submit proposal
- `GET /api/v1/proposals/talent/my-proposals` - Get my proposals
- `POST /api/v1/proposals/:id/accept` - Accept proposal (managers only)

#### Messages
- `POST /api/v1/messages/jobs/:job_id/messages` - Send message
- `GET /api/v1/messages/conversations` - Get conversations

#### Profiles
- `GET /api/v1/profiles/talents/search` - Search talents
- `PUT /api/v1/profiles/talent/me` - Update talent profile
- `GET /api/v1/profiles/manager/dashboard` - Manager dashboard

#### Admin
- `GET /api/v1/admin/dashboard` - Admin dashboard
- `GET /api/v1/admin/users` - Manage users
- `GET /api/v1/admin/analytics` - Platform analytics

## 🔐 Authentication

The API uses JWT Bearer tokens for authentication:

```bash
Authorization: Bearer <your_jwt_token>
```

### User Roles
- **Talent**: Can search jobs, submit proposals, message managers
- **Manager**: Can post jobs, review proposals, hire talent
- **Admin**: Full platform access, user management, analytics

## 🗃 Database Schema

### Core Collections
- `users` - User accounts with roles
- `talentprofiles` - Talent-specific information
- `managerprofiles` - Manager/company information
- `jobs` - Job postings
- `proposals` - Job applications from talents
- `messages` - Communication between users
- `skills` - Available skills
- `talentskills` - Skills associated with talents
- `jobskills` - Skills required for jobs

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `MONGO_URI` | MongoDB connection string | - |
| `MONGO_USER` | MongoDB username | - |
| `MONGO_PASSWORD` | MongoDB password | - |
| `MONGO_DB_NAME` | MongoDB database name | `dozyr_db` |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | JWT expiration | `7d` |
| `ADMIN_EMAIL` | Admin user email | `admin@dozyr.com` |
| `ADMIN_PASSWORD` | Admin user password | `admin123` |

### Rate Limiting
- General API: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes
- Messages: 10 per minute

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Check API health
curl http://localhost:3000/health
```

## 🚀 Deployment

### Shared Hosting (Passenger)

1. Upload files to your hosting directory
2. Configure `.env` with production values
3. Install dependencies: `npm install --production`
4. Passenger should automatically detect the Node.js app
5. Set the startup file to `server.js`

### Cloud Platforms

The API is ready to deploy on:
- Heroku
- Railway
- DigitalOcean App Platform
- AWS Elastic Beanstalk
- Google Cloud Run

## 📈 Monitoring

### Health Checks
- `GET /health` - Basic health check
- `GET /api/v1/admin/system/health` - Detailed system health (admin only)

### Logging
All errors and important events are logged to the console. In production, consider using a logging service.

## 🔒 Security Features

- **Authentication**: JWT with secure secret
- **Rate Limiting**: Protection against API abuse
- **Input Validation**: All inputs validated and sanitized
- **NoSQL Injection Protection**: Mongoose schema validation and sanitization
- **CORS**: Configurable cross-origin resource sharing
- **Helmet**: Security headers
- **Password Hashing**: bcryptjs with salt rounds

## 🤝 API Usage Examples

### Register a Talent
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "talent@example.com",
    "password": "password123",
    "role": "talent",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

### Search Jobs
```bash
curl "http://localhost:3000/api/v1/jobs/search?category=Programming&budget_min=1000"
```

### Submit Proposal (requires auth)
```bash
curl -X POST http://localhost:3000/api/v1/proposals/jobs/1/proposals \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "cover_letter": "I am interested in this project...",
    "bid_amount": 1500,
    "timeline_days": 14
  }'
```

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the API documentation at `/api/v1/docs`
2. Review this README
3. Check the console logs for errors
4. Ensure your `.env` configuration is correct

## 🎯 Roadmap

Future enhancements:
- File upload support for portfolios
- Payment integration
- Real-time notifications
- Advanced AI matching
- Mobile app API support
- Multi-language support

---

**Dozyr** - Connecting remote talent with opportunities worldwide! 🌍