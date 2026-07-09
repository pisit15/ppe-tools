import { NextResponse } from 'next/server';

// This one-time bootstrap endpoint has been permanently disabled.
// It previously seeded user accounts with hardcoded plaintext passwords,
// which is a security risk (publicly callable + re-seeds known credentials).
// User accounts are now managed directly in the database, and passwords
// are stored as bcrypt hashes.
export async function GET() {
  return NextResponse.json(
    { error: 'This setup endpoint has been disabled for security reasons.' },
    { status: 410 }
  );
}
