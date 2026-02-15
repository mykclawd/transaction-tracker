# Transaction Tracker

A Next.js app for tracking credit card transactions by uploading video recordings. Automatically extracts merchant name, date, amount, and bitcoin rewards using OpenAI Vision.

## Features

- 🔐 **Authentication**: Secure user auth with Clerk
- 📹 **Video Upload**: Upload videos of your credit card transactions
- 🤖 **AI Extraction**: OpenAI Vision automatically extracts transaction details
- 🗂️ **Deduplication**: Smart hashing prevents duplicate entries
- 📊 **Dashboard**: Visualize spending by category, date, and month
- ✏️ **Manual Override**: Edit transaction categories
- 🔒 **Privacy**: Users can only access their own data

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Auth**: Clerk
- **Database**: Neon PostgreSQL
- **AI**: OpenAI GPT-4o Vision
- **Charts**: Recharts
- **UI**: shadcn/ui components
- **Deployment**: Vercel

## Setup

### 1. Clone and Install

```bash
cd transaction-tracker/my-app
npm install
```

### 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

Required variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | From Clerk Dashboard |
| `CLERK_SECRET_KEY` | From Clerk Dashboard |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `OPENAI_API_KEY` | From OpenAI Dashboard |

### 3. Database Setup

1. Create a new database in [Neon](https://neon.tech)
2. Copy the connection string to `DATABASE_URL`
3. Run the schema:

```bash
# Connect to your Neon database and run:
psql $DATABASE_URL < db/schema.sql
```

### 4. Clerk Setup

1. Go to [Clerk Dashboard](https://dashboard.clerk.dev)
2. Create a new application
3. Copy the Publishable Key and Secret Key
4. Add them to your `.env.local`
5. Configure redirect URLs:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in: `/`
   - After sign-up: `/`

### 5. OpenAI Setup

1. Go to [OpenAI Platform](https://platform.openai.com)
2. Create an API key
3. Add it to `OPENAI_API_KEY`

### 6. Run Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 7. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Add environment variables in Vercel Dashboard:
1. Go to Project Settings → Environment Variables
2. Add all variables from `.env.local`
3. Redeploy

## Usage

1. **Sign Up/In**: Create an account or sign in
2. **Upload Video**: Record or select a video of your credit card transactions
3. **AI Processing**: The app extracts merchant, date, amount, and BTC rewards
4. **Review**: Transactions appear in your dashboard
5. **Categorize**: Edit categories for better tracking
6. **Analyze**: View spending breakdowns and trends

## Data Model

```sql
transactions:
- id (hash of user_id + merchant + date + amount + rewards)
- user_id (clerk user id)
- merchant_name
- transaction_date
- amount_spent
- bitcoin_rewards
- category (nullable, user-editable)
- created_at, updated_at
```

## How Deduplication Works

Each transaction gets a unique ID generated from:
- `userId:merchantName:date:amount:rewards`

This ensures:
- Same user can't have duplicates
- Different users CAN have identical transactions
- Re-uploading the same video won't create duplicates

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/transactions/extract` | POST | Process video, extract & insert transactions |
| `/api/transactions` | GET | Get all user's transactions |
| `/api/transactions/[id]` | PUT | Update transaction category |
| `/api/transactions/[id]` | DELETE | Delete transaction |

## License

MIT
# Transaction Tracker
