# Exhibition Admin

A Korean-language admin dashboard for managing online exhibitions. It supports exhibition settings, items, categories, event periods, and board posts.

## Tech stack

- Next.js 15, React 19, and TypeScript
- Tailwind CSS
- Kakao OAuth login
- External backend API (proxied through the app)

## Getting started

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create `.env.local`:

   ```env
   API_BASE_URL=https://your-api-server.example.com
   NEXT_PUBLIC_KAKAO_REST_API_KEY=your_kakao_rest_api_key
   NEXT_PUBLIC_KAKAO_REDIRECT_URI=http://localhost:3000/login
   ```

   `API_BASE_URL` is required. It is used to forward `/api/backend/*` requests to the backend API and to read tenant data.

3. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Commands

```bash
npm run dev    # Start the development server
npm run build  # Create a production build
npm run start  # Start the production server
npm run lint   # Run linting
```

## Project structure

```text
src/app/         Pages, layouts, and API proxy routes
src/components/  Authentication, exhibition state, and admin UI components
src/lib/         API helpers, authentication helpers, and TypeScript types
```

## Authentication

Administrators sign in with Kakao. The Kakao app's redirect URI must match `NEXT_PUBLIC_KAKAO_REDIRECT_URI`; users without a completed profile are sent to the registration page.
