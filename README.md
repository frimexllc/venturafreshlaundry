# Ventura Fresh Laundry - Management System

A comprehensive laundry management system with CRM, order management, membership subscriptions, and Stripe payment integration.

## Tech Stack

- **Frontend**: React 18 + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Payments**: Stripe (via emergentintegrations)
- **Authentication**: JWT-based with bcrypt

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB

### Environment Variables

#### Backend (.env)
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=ventura_laundry
JWT_SECRET=your-secret-key-here
STRIPE_API_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
SKIP_SERVER_NOTIFICATIONS=true
```

#### Frontend (.env)
```env
REACT_APP_BACKEND_URL=http://localhost:8001
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
```

### Installation

#### Backend
```bash
cd backend
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
uvicorn server:app --host 0.0.0.0 --port 8001
```

#### Frontend
```bash
cd frontend
yarn install
yarn start
```

## User Roles & Permissions

The system implements two user roles with distinct permissions:

### Administrator (admin)
- Full access to all system features
- Manage users and permissions
- Access financial reports and settings
- Configure services and memberships
- View all orders with financial data
- Access to: Dashboard, Customers, Orders, Services, Memberships, Store, Blog, Settings, User Management, Audit Log

### Operator (operator)
- Limited access to order management only
- View and update order status
- Access operator dashboard
- View customer information (limited)
- **No access** to financial data or settings
- Access to: Operator Panel, Support Tickets only

### Testing Role Restrictions

1. **First registered user** automatically becomes admin
2. **Subsequent users** are assigned operator role
3. Admins can change user roles via Settings > User Management
4. Operators attempting to access admin-only endpoints receive 403 Forbidden

#### Test Operator Access:
1. Login as admin
2. Go to `/admin/users` and create a new operator user
3. Logout and login as operator
4. Verify limited menu (only Operator Panel visible)
5. Try accessing `/admin/orders` - should redirect to Operator Panel

## Stripe Integration

### Payment Flows

#### 1. Membership Payments
- Customer selects membership plan on `/membership` page
- Enters contact details
- Clicks "Pay Now" to redirect to Stripe Checkout
- Upon successful payment, membership is activated
- Customer record is created/updated with membership status

#### 2. Store Product Payments
- Customer adds products to cart
- Proceeds to checkout
- Redirected to Stripe Checkout
- Upon payment, order is confirmed and stock updated

### Webhook Configuration

For production, configure Stripe webhook at:
```
POST /api/webhook/stripe
```

Events handled:
- `checkout.session.completed`
- `payment_intent.succeeded`

### Testing Payments

Use Stripe test cards:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **Requires Auth**: 4000 0025 0000 3155

## API Endpoints

### Authentication
```
POST /api/auth/register - Register new user
POST /api/auth/login - Login
GET  /api/auth/me - Get current user
```

### Admin Only (require admin role)
```
GET    /api/admin/users - List all users
POST   /api/admin/users - Create user with role
PUT    /api/admin/users/{id}/role - Update user role
DELETE /api/admin/users/{id} - Delete user
GET    /api/admin/roles - Get available roles
```

### Operator Endpoints (limited data)
```
GET   /api/operator/orders - Orders without financial data
PATCH /api/operator/orders/{id}/status - Update order status
```

### Payment Endpoints
```
POST /api/store/membership/checkout - Create membership checkout
GET  /api/store/membership/checkout/status/{session_id} - Check status
POST /api/store/checkout - Create product checkout
GET  /api/store/checkout/status/{session_id} - Check status
```

### Public Endpoints
```
GET  /api/public/services - List active services
GET  /api/public/membership-plans - List membership plans
POST /api/public/membership-signup - Submit membership signup
```

## Project Structure

```
/app
├── backend/
│   ├── server.py          # Main FastAPI application
│   ├── store.py           # Store & payment module
│   ├── blog.py            # Blog module
│   ├── automation_engine.py # Automation workflows
│   ├── notifications.py   # Email/SMS notifications
│   ├── requirements.txt   # Python dependencies
│   └── .env               # Environment variables
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx     # Main layout with role-based nav
│   │   │   └── ui/            # UI components
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Admin dashboard
│   │   │   ├── OperatorDashboard.jsx # Operator panel
│   │   │   ├── UserManagement.jsx  # User admin
│   │   │   ├── MembershipPage.jsx  # Public membership signup
│   │   │   └── ...
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Authentication context
│   │   └── App.js              # Routes
│   └── .env                    # Environment variables
│
└── README.md
```

## Order States

```
new → processing → ready → out_for_delivery → delivered → completed
                                           → cancelled
```

## Development Notes

### Security Best Practices
- All secrets stored in environment variables
- JWT tokens expire after 24 hours
- Passwords hashed with bcrypt
- Role-based access control enforced on backend
- Financial data hidden from operators
- CORS configured for allowed origins

### Stripe Security
- Prices defined on backend (not from frontend)
- Payment amounts calculated server-side
- Webhook signature verification
- Session-based idempotency

## Support

For issues or questions, check the audit log at `/admin/audit-log` or contact system administrator.
