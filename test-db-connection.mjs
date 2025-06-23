import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres('postgresql://postgres.lxjmkegyidxnclxnrfse:NikeLunarForce1@aws-0-eu-central-2.pooler.supabase.com:6543/postgres?sslmode=require');
const db = drizzle(client);

async function testConnection() {
  try {
    console.log('Testing database connection...');
    const result = await db.execute('SELECT NOW()');
    console.log('✅ Database connection successful!', result);
    
    // Test the trips table
    const tripsResult = await db.execute('SELECT COUNT(*) FROM trip');
    console.log('✅ Trips table accessible!', tripsResult);
    
    await client.end();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

testConnection();
